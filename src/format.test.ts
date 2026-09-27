import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSummary, n } from './format.ts';
import type { Stats } from './stats.ts';

test('formatSummary: thousands separators, ranges, top projects, month bars, output path', () => {
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
  const out = formatSummary(stats, 'rimoo-out/stats.json');
  assert.match(out, /24,030 lines · 1 duplicate removed · 0 unreadable/);
  assert.match(out, /24,029 prompts · 61 projects · 2025-11-01 → 2026-09-27/);
  assert.match(out, /891 slash commands · 1,480 with pasted content/);
  assert.match(out, /top 2 of 61/);
  assert.match(out, /7,378 {2}\/data\/repos\/toy-app/);
  assert.match(out, /2025-12 {4}0 {2}\n/);
  assert.match(out, /2026-01 {2}400 {2}▇{24}\n/);
  assert.match(out, /Saved rimoo-out\/stats\.json\n$/);
  assert.equal(n(1234567), '1,234,567');
});
