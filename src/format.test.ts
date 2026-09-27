import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRepeated, formatSaved, formatSummary, n } from './format.ts';
import { formatLargeHistory, formatProgress, seconds } from './format.ts';
import type { Manifest, ManifestChunk } from './chunks.ts';
import type { RepeatedGroup } from './repeated.ts';
import type { Stats } from './stats.ts';

test('formatSummary: thousands separators, ranges, top projects, month bars', () => {
  const stats: Stats = {
    generatedAt: 'x',
    source: '/home/dev/.claude/history.jsonl',
    lines: 24030,
    duplicatesRemoved: 1,
    unreadableLines: 0,
    prompts: 24029,
    projects: 61,
    dateRange: { first: '2025-11-01', last: '2026-09-27' },
    perProject: [
      { project: '/data/repos/toy-app', prompts: 7378 },
      { project: '/data/repos/other', prompts: 12 },
    ],
    perMonth: [
      { month: '2025-11', prompts: 100 },
      { month: '2025-12', prompts: 0 },
      { month: '2026-01', prompts: 400 },
    ],
    slashCommands: 891,
    withPaste: 1480,
  };
  const out = formatSummary(stats);
  assert.match(out, /24,030 lines · 1 duplicate removed · 0 unreadable/);
  assert.match(out, /24,029 prompts · 61 projects · 2025-11-01 → 2026-09-27/);
  assert.match(out, /891 slash commands · 1,480 with pasted content/);
  assert.match(out, /top 2 of 61/);
  assert.match(out, /7,378 {2}\/data\/repos\/toy-app/);
  assert.match(out, /2025-12 {4}0 {2}\n/);
  assert.match(out, /2026-01 {2}400 {2}▇{24}\n/);
  assert.doesNotMatch(out, /Saved/);
  assert.equal(n(1234567), '1,234,567');
});

const group = (key: string, count: number, projects: number): RepeatedGroup => ({
  key,
  label: key,
  count,
  projects,
  first: '2026-01-02',
  last: '2026-09-20',
  examples: [key],
  ids: [1],
});

test('formatRepeated: three sections, aligned counts and projects, long keys clipped', () => {
  const out = formatRepeated({
    instructions: [group('merge it into stage', 1234, 12), group('x'.repeat(200), 5, 1)],
    shortReplies: [group('yes', 36, 3)],
    slashCommands: [],
  });
  assert.match(out, /^Most repeated instructions \(top 20\)\n/);
  assert.match(out, /\n {2}1,234 {2}12 {2}2026-01-02 → 2026-09-20 {2}merge it into stage\n/);
  assert.match(out, /\n {6}5 {3}1 {2}2026-01-02 → 2026-09-20 {2}x{79}…\n/);
  assert.match(out, /\nShort replies \(top 10\)\n {2}36 {2}3 {2}2026-01-02 → 2026-09-20 {2}yes\n/);
  assert.match(out, /\nSlash commands \(top 10\)\n {2}\(none\)\n$/);
});

test('formatSaved: lists every file on one line', () => {
  assert.equal(formatSaved(['o/stats.json', 'o/repeated.json']), 'Saved o/stats.json and o/repeated.json\n');
});

test('formatLargeHistory: two lines above 2,000,000 tokens or 40 chunks, nothing otherwise', () => {
  const m = (totalTokens: number, totalChunks: number) =>
    ({ totalChunks, estimateFull: { calls: totalChunks, promptTokens: 0, overheadTokens: 0, outputTokens: 0, totalTokens } }) as unknown as Manifest;
  assert.equal(formatLargeHistory(m(1_260_000, 24)), '');
  assert.equal(formatLargeHistory(m(2_000_000, 40)), '');
  for (const big of [m(2_000_001, 24), m(1_000_000, 41)]) {
    assert.equal(
      formatLargeHistory(big),
      '  This is a large history.\n' +
        '  Narrow it with --since <date> or --project <text>, or run it in several sittings: finished chunks are kept' +
        ' and the next run picks up where this one stopped.\n\n',
    );
  }
});

test('formatProgress and seconds: one line per chunk', () => {
  const chunk = { index: 3 } as ManifestChunk;
  const result = {
    usage: { input: 1, cacheCreation: 2, cacheRead: 3, output: 4, total: 51204 },
    costUsd: 0.19,
    durationMs: 41_000,
    findings: new Array(31),
    dropped: { findings: 2, evidence: 0 },
  } as never;
  assert.equal(
    formatProgress({ kind: 'done', chunk, total: 24, result }),
    '  chunk 3/24 · 51,204 tokens · $0.19 · 41 s · 31 findings (2 dropped)\n',
  );
  assert.equal(formatProgress({ kind: 'skipped', chunk, total: 24 }), '  chunk 3/24 · already done, kept\n');
  assert.equal(
    formatProgress({ kind: 'failed', chunk, total: 24, error: new Error('chunk 3: limit') }),
    '  chunk 3/24 · failed: chunk 3: limit\n',
  );
  assert.equal(seconds(400), '0 s');
  assert.equal(seconds(185_000), '3 min 5 s');
});
