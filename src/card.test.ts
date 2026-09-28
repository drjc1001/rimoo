import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CARD_FOOTER,
  escapeHtml,
  findChrome,
  monthsBetween,
  parseCardSize,
  renderCard,
  screenshotCard,
  type CardInput,
} from './card.ts';
import { renderShareCard, writeExports, type ExportInput } from './exports.ts';
import type { Merged, MergedRule } from './merge.ts';
import { makeFakeChrome, readChromeCalls } from './fake-claude.test.ts';

const posixOnly = process.platform === 'win32' ? 'the fake chrome is a POSIX script' : false;

const card = (over: Partial<CardInput> = {}): CardInput => ({
  prompts: 24145,
  projects: 61,
  months: 11,
  rules: [
    { text: '結論先講', frequency: 40 },
    { text: '先給計畫再動手', frequency: 32 },
    { text: '沿用既有畫面', frequency: 24 },
    { text: '有測試才算做完', frequency: 22 },
    { text: '先找根因再修', frequency: 21 },
    { text: '第六條不上圖', frequency: 3 },
  ],
  quote: { text: 'merged, help me deploy', count: 49 },
  lang: 'zh',
  ...over,
});

test('renderCard: the three numbers, five habits with counts, the quoted line and the footer', () => {
  const html = renderCard(card());
  for (const s of ['24,145', '61', '11', '則', '個專案', '個月', '我的 AI 協作習慣', '我一直在教 AI 的事', '最常重複的一句']) {
    assert.ok(html.includes(s), s);
  }
  for (const [text, freq] of [['結論先講', 40], ['先給計畫再動手', 32], ['沿用既有畫面', 24], ['有測試才算做完', 22], ['先找根因再修', 21]] as const) {
    assert.match(html, new RegExp(`${text}</span><span class="count">${freq}×</span>`));
  }
  assert.doesNotMatch(html, /第六條不上圖/);
  assert.match(html, /「merged, help me deploy」<\/span><span class="count">×49<\/span>/);
  assert.ok(html.includes(CARD_FOOTER));
  // Self-contained: no outside resource.
  assert.doesNotMatch(html, /<link|<script|<img|url\(|https?:/);
});

test('renderCard: English wording, one of each in the singular', () => {
  const html = renderCard(card({ lang: 'en', prompts: 1, projects: 1, months: 1 }));
  for (const s of ['My AI coding workstyle', 'What I keep telling my coding agent', 'Most repeated line', '>prompt<', '>project<', '>month<']) {
    assert.ok(html.includes(s), s);
  }
  assert.match(renderCard(card({ lang: 'en' })), />prompts<.*>projects<.*>months</s);
  assert.match(renderCard(card({ lang: 'en' })), /“merged, help me deploy”/);
});

test('renderCard: body is exactly the card size, 1080×1080 by default and 1200×627 when asked', () => {
  assert.match(renderCard(card()), /html, body \{ width: 1080px; height: 1080px; overflow: hidden; \}/);
  const wide = renderCard(card({ size: { w: 1200, h: 627 } }));
  assert.match(wide, /html, body \{ width: 1200px; height: 627px; overflow: hidden; \}/);
  assert.match(wide, /<body class="wide">/);
  // Text sizes the card promises: body copy at least 28px on both; the big numbers at least 96px on the square,
  // 80px on the wide one, where the column with the habits needs the room.
  for (const [html, num] of [[renderCard(card()), 96], [wide, 80]] as const) {
    const sizes = [...html.matchAll(/font-size: (\d+)px/g)].map((m) => Number(m[1]));
    assert.ok(Math.min(...sizes) >= 28, String(sizes));
    assert.ok(Number(/\.num \{ font-size: (\d+)px/.exec(html)![1]) >= num);
  }
});

test('renderCard: each string is gated (paths, project names, emails) and escaped', () => {
  const html = renderCard(
    card({
      rules: [
        { text: '別碰 /data/repos/secret-app/.env', frequency: 9 },
        { text: '沿用 toy-app 的 <b>版面</b>', frequency: 8 },
      ],
      quote: { text: 'toy-app 部署好了嗎？寄 me@corp.example', count: 5 },
      names: ['toy-app'],
    }),
  );
  for (const leak of ['/data/repos', 'secret-app', 'toy-app', 'me@corp.example']) assert.ok(!html.includes(leak), leak);
  assert.match(html, /別碰 \[removed\]/);
  assert.ok(html.includes('沿用 [removed] 的 &lt;b&gt;版面&lt;/b&gt;'));
  assert.doesNotMatch(html, /<b>/);
  // --allow-paths keeps paths and names, as in the other shared files.
  const kept = renderCard(card({ rules: [{ text: '沿用 toy-app', frequency: 1 }], quote: null, names: ['toy-app'], allowPaths: true }));
  assert.ok(kept.includes('沿用 toy-app'));
  assert.doesNotMatch(kept, /最常重複的一句/);
});

test('escapeHtml, monthsBetween, parseCardSize', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  assert.equal(monthsBetween({ first: '2025-11-01', last: '2026-09-28' }), 11);
  assert.equal(monthsBetween({ first: '2026-07-11', last: '2026-07-16' }), 1);
  assert.equal(monthsBetween(null), 0);
  assert.deepEqual(parseCardSize('1200x627'), { w: 1200, h: 627 });
  assert.deepEqual(parseCardSize('1080X1080'), { w: 1080, h: 1080 });
  for (const bad of ['1200', '1200x', 'axb', '1200x627x2', '50x50', '99999x627']) assert.equal(parseCardSize(bad), null, bad);
});

// ------------------------------------------------------------------------------------ share.html from the exports

function rule(i: number, over: Partial<MergedRule> = {}): MergedRule {
  return {
    key: `key_${i}`, category: 'communication', title: `短句${i}`, rule: `規則${i}。`, confidence: 'high',
    frequency: 50 - i, chunks: 3, members: [i], evidence: [], trigger: null, ...over,
  };
}

function exportInput(): ExportInput {
  const rules = [1, 2, 3, 4, 5, 6].map((i) => rule(i));
  rules[0] = rule(1, { title: '別碰 /home/me/toy-app/.env' });
  rules[1] = rule(2, { title: '沿用 toy-app 的版面' });
  const merged: Merged = {
    generatedAt: '2026-09-28T00:00:00.000Z', findingsSha256: 'f'.repeat(64), chunksAnalyzed: 2, chunksTotal: 2, findings: 9,
    usage: { input: 0, cacheCreation: 0, cacheRead: 0, output: 0, thinking: 0, total: 0 }, costUsd: 0, durationMs: 0,
    dropped: { unknown: 0, duplicate: 0, groups: 0 }, rules,
  };
  return {
    merged,
    stats: { prompts: 24145, projects: 61, dateRange: { first: '2025-11-01', last: '2026-09-28' } },
    repeatedTop: { label: 'toy-app 部署好了嗎', count: 49 },
  };
}

test('share.html: written with the other exports, top five titles, months, the gated quote; no project name', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-card-'));
  try {
    await writeExports(dir, exportInput(), { names: ['toy-app'] });
    const html = await readFile(path.join(dir, 'share.html'), 'utf8');
    for (const s of ['24,145', '>61<', '>11<', '短句3', '短句5', '「[removed] 部署好了嗎」', '×49', CARD_FOOTER]) assert.ok(html.includes(s), s);
    assert.doesNotMatch(html, /短句6|toy-app|\/home\/me/);
    // The page itself is not run through the gate: its CSS and markup come out whole.
    assert.match(html, /<\/style>/);
    assert.doesNotMatch(html, /\[removed\]\s*\{/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('share.html and share.txt with lang en: titleEn where there is one, else the title', () => {
  const input = exportInput();
  input.merged.rules[2] = { ...input.merged.rules[2]!, titleEn: 'Reuse what exists' };
  const html = renderShareCard({ ...input, lang: 'en' }, { names: ['toy-app'] });
  assert.ok(html.includes('Reuse what exists'));
  assert.ok(html.includes('What I keep telling my coding agent'));
  assert.ok(!renderShareCard(input).includes('Reuse what exists'));
});

// ------------------------------------------------------------------------------------------ Chrome (fake)

test('findChrome: null when none is on PATH; the fake one when it is', { skip: posixOnly }, async () => {
  const empty = await mkdtemp(path.join(tmpdir(), 'rimoo-nochrome-'));
  const fake = await makeFakeChrome();
  try {
    assert.equal(await findChrome({ PATH: empty }, 'linux'), null);
    assert.equal(await findChrome({}, 'linux'), null);
    assert.equal(await findChrome({ PATH: `${empty}:${fake.dir}` }, 'linux'), fake.chrome);
  } finally {
    await rm(empty, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('screenshotCard: headless with the screenshot path and window size; a failure is returned, not thrown', { skip: posixOnly }, async () => {
  const fake = await makeFakeChrome();
  try {
    const html = path.join(fake.dir, 'share.html');
    const png = path.join(fake.dir, 'share.png');
    await writeFile(html, renderCard(card()));
    process.env.FAKE_CHROME_LOG = fake.log;
    assert.equal(await screenshotCard(fake.chrome, html, png), null);
    assert.ok((await stat(png)).size > 0);
    await screenshotCard(fake.chrome, html, png, { w: 1200, h: 627 });
    const [square, wide] = await readChromeCalls(fake.log);
    assert.ok(square!.includes('--headless=new'));
    assert.ok(square!.includes(`--screenshot=${png}`));
    assert.ok(square!.includes('--window-size=1080,1080'));
    assert.ok(square!.includes('--hide-scrollbars'));
    assert.equal(square!.at(-1), `file://${html}`);
    assert.ok(wide!.includes('--window-size=1200,627'));
    process.env.FAKE_CHROME_FAIL = '1';
    assert.match((await screenshotCard(fake.chrome, html, png))!, /^Chrome exited with code 1: fake chrome failed$/);
    delete process.env.FAKE_CHROME_FAIL;
    assert.match((await screenshotCard(path.join(fake.dir, 'nope'), html, png))!, /ENOENT/);
  } finally {
    delete process.env.FAKE_CHROME_LOG;
    delete process.env.FAKE_CHROME_FAIL;
    await rm(fake.dir, { recursive: true, force: true });
  }
});
