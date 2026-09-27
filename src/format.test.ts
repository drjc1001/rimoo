import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRepeated, formatSaved, formatSummary, n } from './format.ts';
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
