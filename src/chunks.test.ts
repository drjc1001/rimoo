import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Prompt } from './history.ts';
import { isDate, localDateTime, MAX_CHUNK_CHARS, MAX_TEXT, prepareChunks, writeChunks } from './chunks.ts';
import { buildPrompt, dataLine, dataSection, projectName } from './prompt-template.ts';

// Local noon, so local dates in assertions hold in any timezone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
let nextId = 1;
const prompt = (display: string, timestamp = at(2026, 1, 1), project = '/repos/a'): Prompt => ({
  id: nextId++,
  display,
  timestamp,
  project,
  sessionId: 's',
  pasteCount: 0,
});

test('localDateTime: local date and time to the minute', () => {
  assert.equal(localDateTime(at(2026, 2, 17, 15, 14)), '2026-02-17T15:14');
  assert.equal(localDateTime(at(2026, 12, 1, 9, 5)), '2026-12-01T09:05');
});

test('isDate: YYYY-MM-DD naming a real day', () => {
  assert.ok(isDate('2026-07-01'));
  assert.ok(isDate('2024-02-29'));
  for (const bad of ['2026-13-01', '2026-02-30', '2025-02-29', '2026-7-1', '20260701', 'yesterday', '']) {
    assert.ok(!isDate(bad), bad);
  }
});

test('prepareChunks: keeps instructions only and counts what it dropped', () => {
  const ps = [
    prompt('/compact'),
    prompt('go ahead'),
    prompt('[Pasted text #1 +3 lines]'),
    prompt('merge it into stage please'),
    prompt('look at this error [Pasted text #1 +3 lines]'),
  ];
  const r = prepareChunks(ps, { chunkSize: 10 });
  assert.equal(r.candidates, 2);
  assert.deepEqual(r.dropped, { slash: 1, short: 1, empty: 1 });
  assert.equal(r.candidates + r.dropped.slash + r.dropped.short + r.dropped.empty, ps.length);
  // The original wording is kept, placeholder included, not the normalized key.
  assert.deepEqual(
    r.chunks[0]!.map((row) => row.text),
    ['merge it into stage please', 'look at this error [Pasted text #1 +3 lines]'],
  );
  assert.deepEqual(
    r.chunks[0]!.map((row) => row.id),
    [ps[3]!.id, ps[4]!.id],
  );
});

test('prepareChunks: sorted by project then time, cut into consecutive chunks', () => {
  const ps = [
    prompt('b project, later message', at(2026, 3, 2), '/repos/b'),
    prompt('a project, later message', at(2026, 3, 2), '/repos/a'),
    prompt('b project, earlier message', at(2026, 3, 1), '/repos/b'),
    prompt('a project, earlier message', at(2026, 3, 1), '/repos/a'),
    prompt('no project on this line', at(2026, 3, 1), ''),
  ];
  const r = prepareChunks(ps, { chunkSize: 2 });
  assert.equal(r.totalChunks, 3);
  assert.deepEqual(
    r.chunks.map((c) => c.map((row) => `${row.project} ${row.text}`)),
    [
      ['(unknown) no project on this line', '/repos/a a project, earlier message'],
      ['/repos/a a project, later message', '/repos/b b project, earlier message'],
      ['/repos/b b project, later message'],
    ],
  );
  assert.equal(r.chunks[0]![1]!.ts, '2026-03-01T12:00');
});

test('prepareChunks: --project, --since (local date, inclusive), --sample', () => {
  const ps = [
    prompt('old message in the toy app', at(2026, 6, 30, 23, 59), '/repos/toy-app'),
    prompt('first message of july in toy app', at(2026, 7, 1, 0, 1), '/repos/toy-app'),
    prompt('another july message in toy app', at(2026, 7, 2), '/repos/toy-app-docs'),
    prompt('a july message somewhere else', at(2026, 7, 2), '/repos/other'),
    prompt('/compact', at(2026, 7, 2), '/repos/other'),
  ];
  const r = prepareChunks(ps, { chunkSize: 1, project: 'toy-app', since: '2026-07-01' });
  assert.equal(r.candidates, 2);
  assert.deepEqual(r.dropped, { slash: 0, short: 0, empty: 0 });
  assert.equal(r.totalChunks, 2);
  const s = prepareChunks(ps, { chunkSize: 1, project: 'toy-app', since: '2026-07-01', sample: 1 });
  assert.equal(s.totalChunks, 2);
  assert.equal(s.chunks.length, 1);
  assert.equal(s.chunks[0]![0]!.text, 'first message of july in toy app');
});

test('prepareChunks: a chunk also closes before its prompt file passes maxChars', async () => {
  const long = (i: number) => prompt(`message ${i} `.padEnd(2000, 'x'), at(2026, 3, 1, 8, i));
  const ps = Array.from({ length: 10 }, (_, i) => long(i));
  const opts = { chunkSize: 1000, maxChars: 10_000 };
  const r = prepareChunks(ps, opts);
  assert.ok(r.chunks.length > 1);
  assert.equal(r.chunks.flat().length, 10);
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const m = await writeChunks(dir, r, opts);
    assert.equal(m.maxChars, 10_000);
    for (const c of m.chunks) assert.ok(c.chars <= 10_000, `${c.index}: ${c.chars}`);
    // Full chunks are close to the limit, not cut far below it.
    assert.ok(m.chunks[0]!.chars > 10_000 - 2_100, String(m.chunks[0]!.chars));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  assert.equal(prepareChunks(ps, { chunkSize: 1000 }).chunks.length, 1);
  assert.equal(MAX_CHUNK_CHARS, 120_000);
});

test('prepareChunks: text is cut to MAX_TEXT characters, counting CJK as one each', () => {
  const r = prepareChunks([prompt('測'.repeat(MAX_TEXT + 50))], { chunkSize: 10 });
  assert.equal([...r.chunks[0]![0]!.text].length, MAX_TEXT);
});

test('dataLine: id | ts | text on one line; dataSection heads each project once', () => {
  assert.equal(
    dataLine({ id: 7, ts: '2026-02-17T15:14', project: '/repos/a', text: 'first line\n\n  second line\r\nthird' }),
    '7 | 2026-02-17T15:14 | first line second line third',
  );
  assert.equal(projectName('/data/repos/toy-app'), 'toy-app');
  assert.equal(projectName('C:\\Users\\me\\toy-app\\'), 'toy-app');
  assert.equal(projectName('(unknown)'), '(unknown)');
  assert.equal(
    dataSection([
      { id: 1, ts: '2026-02-17T15:14', project: '/repos/a', text: 'one' },
      { id: 2, ts: '2026-02-17T15:15', project: '/repos/a', text: 'two' },
      { id: 3, ts: '2026-02-17T15:16', project: '/repos/b', text: 'three' },
    ]),
    '# project: a\n1 | 2026-02-17T15:14 | one\n2 | 2026-02-17T15:15 | two\n# project: b\n3 | 2026-02-17T15:16 | three',
  );
});

test('buildPrompt: says which part, how many messages, the seven categories, then the data', () => {
  const rows = [
    { id: 3, ts: '2026-02-17T15:14', project: '/repos/a', text: 'commit this and push' },
    { id: 9, ts: '2026-02-18T09:00', project: '/repos/a', text: 'why is the test\nstill red' },
  ];
  const p = buildPrompt({ index: 2, total: 5, rows });
  assert.match(p, /This is part 2 of 5: 2 messages/);
  for (const c of [
    'communication',
    'planning',
    'implementation',
    'testing',
    'debugging',
    'architecture',
    'ai_collaboration',
  ]) {
    assert.match(p, new RegExp(`^- ${c}: `, 'm'), c);
  }
  assert.match(p, /Reply with JSON only/);
  assert.ok(
    p
      .trimEnd()
      .endsWith(
        '<messages>\n# project: a\n3 | 2026-02-17T15:14 | commit this and push\n9 | 2026-02-18T09:00 | why is the test still red\n</messages>',
      ),
  );
});

test('writeChunks: prompt and data files per chunk, a manifest, old parts cleared, other files kept', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    await mkdir(path.join(dir, 'chunks'), { recursive: true });
    await writeFile(path.join(dir, 'chunks', '099.jsonl'), 'stale\n');
    await writeFile(path.join(dir, 'stats.json'), '{}\n');
    const ps = [
      prompt('a first instruction here', at(2026, 3, 1, 8, 0), '/repos/a'),
      prompt('a second instruction here', at(2026, 3, 2, 9, 30), '/repos/a'),
      prompt('b only instruction here', at(2026, 3, 1, 10, 0), '/repos/b'),
      prompt('/model opus', at(2026, 3, 1), '/repos/b'),
    ];
    const opts = { chunkSize: 2, since: '2026-01-01' };
    const m = await writeChunks(dir, prepareChunks(ps, opts), opts, new Date('2026-09-27T00:00:00Z'));
    assert.deepEqual(await readdir(path.join(dir, 'chunks')), ['001.jsonl', '002.jsonl']);
    assert.deepEqual(await readdir(path.join(dir, 'prompts')), ['001.md', '002.md']);
    assert.equal(await readFile(path.join(dir, 'stats.json'), 'utf8'), '{}\n');

    const onDisk = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    assert.deepEqual(onDisk, m);
    assert.equal(m.generatedAt, '2026-09-27T00:00:00.000Z');
    assert.deepEqual(m.filters, { project: null, since: '2026-01-01', sample: null });
    assert.equal(m.candidates, 3);
    assert.deepEqual(m.dropped, { slash: 1, short: 0, empty: 0 });
    assert.equal(m.totalChunks, 2);
    const first = m.chunks[0]!;
    assert.equal(first.file, 'chunks/001.jsonl');
    assert.equal(first.promptFile, 'prompts/001.md');
    assert.equal(first.prompts, 2);
    assert.equal(first.firstTs, '2026-03-01T08:00');
    assert.equal(first.lastTs, '2026-03-02T09:30');
    assert.equal(first.projects, 1);
    const promptText = await readFile(path.join(dir, first.promptFile), 'utf8');
    assert.equal(first.chars, [...promptText].length);
    assert.ok(first.tokens > 0 && first.tokens < first.chars, `${first.tokens} of ${first.chars}`);
    assert.deepEqual(m.estimate, m.estimateFull);
    assert.equal(m.estimate.calls, 2);
    assert.equal(m.estimate.promptTokens, m.chunks[0]!.tokens + m.chunks[1]!.tokens);
    assert.equal(m.estimate.totalTokens, m.estimate.promptTokens + 2 * 24_000);
    assert.match(promptText, /This is part 1 of 2: 2 messages/);

    // Every id quoted in the prompt's data section is a row of the matching chunk file.
    const jsonl = (await readFile(path.join(dir, first.file), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.deepEqual(Object.keys(jsonl[0]), ['id', 'ts', 'project', 'text']);
    const data = promptText.slice(promptText.indexOf('<messages>\n') + 11, promptText.indexOf('</messages>'));
    const ids = data
      .trim()
      .split('\n')
      .filter((l) => !l.startsWith('# project: '))
      .map((l) => Number(l.split(' | ')[0]));
    assert.deepEqual(
      ids,
      jsonl.map((r) => r.id),
    );
    assert.deepEqual(ids, [ps[0]!.id, ps[1]!.id]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeChunks: nothing left after filters still writes an empty manifest and clears old parts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    await mkdir(path.join(dir, 'prompts'), { recursive: true });
    await writeFile(path.join(dir, 'prompts', '001.md'), 'stale\n');
    const opts = { chunkSize: 10, project: 'nowhere' };
    const m = await writeChunks(dir, prepareChunks([prompt('some instruction text')], opts), opts);
    assert.deepEqual(m.chunks, []);
    assert.equal(m.candidates, 0);
    assert.deepEqual(await readdir(path.join(dir, 'prompts')), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeChunks: with --sample the manifest costs the whole run as well as the sample', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const ps = [
      prompt('a first instruction here', at(2026, 3, 1, 8, 0), '/repos/a'),
      prompt('a second instruction here', at(2026, 3, 2, 9, 30), '/repos/a'),
      prompt('b only instruction here', at(2026, 3, 1, 10, 0), '/repos/b'),
    ];
    const opts = { chunkSize: 2, sample: 1 };
    const m = await writeChunks(dir, prepareChunks(ps, opts), opts);
    assert.equal(m.chunks.length, 1);
    assert.equal(m.totalChunks, 2);
    assert.equal(m.estimate.calls, 1);
    assert.equal(m.estimateFull.calls, 2);
    assert.ok(m.estimateFull.promptTokens > m.estimate.promptTokens);
    assert.equal(m.estimateFull.totalTokens, m.estimateFull.promptTokens + 2 * 24_000);
    assert.deepEqual(await readdir(path.join(dir, 'prompts')), ['001.md']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
