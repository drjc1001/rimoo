import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Prompt } from './history.ts';
import { computeStats, localDate } from './stats.ts';

// Noon UTC keeps the local calendar date identical in every timezone from UTC-11 to UTC+11.
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
const prompt = (id: number, display: string, timestamp: number, project = '/a', pasteCount = 0): Prompt => ({
  id,
  display,
  timestamp,
  project,
  sessionId: 's',
  pasteCount,
});

test('computeStats: counts, ordering, date range, month gaps filled, slash and paste counts', () => {
  const prompts = [
    prompt(1, 'plan this', at(2025, 11, 3), '/a'),
    prompt(2, '/compact', at(2026, 1, 15), '/b'),
    prompt(3, 'commit this', at(2026, 1, 20), '/b', 1),
    prompt(4, 'yes', at(2026, 1, 21), '/b'),
    prompt(5, 'go', at(2026, 1, 22), '', 2),
  ];
  const s = computeStats(
    { totalLines: 9, prompts, badLines: [4, 8], duplicates: 2 },
    '/x/history.jsonl',
    new Date('2026-09-27T00:00:00Z'),
  );
  assert.equal(s.generatedAt, '2026-09-27T00:00:00.000Z');
  assert.equal(s.source, '/x/history.jsonl');
  assert.equal(s.lines, 9);
  assert.equal(s.duplicatesRemoved, 2);
  assert.equal(s.unreadableLines, 2);
  assert.equal(s.prompts, 5);
  assert.equal(s.projects, 3);
  assert.deepEqual(s.dateRange, { first: '2025-11-03', last: '2026-01-22' });
  assert.deepEqual(s.perProject, [
    { project: '/b', prompts: 3 },
    { project: '(unknown)', prompts: 1 },
    { project: '/a', prompts: 1 },
  ]);
  assert.deepEqual(s.perMonth, [
    { month: '2025-11', prompts: 1 },
    { month: '2025-12', prompts: 0 },
    { month: '2026-01', prompts: 4 },
  ]);
  assert.equal(s.slashCommands, 1);
  assert.equal(s.withPaste, 2);
});

test('computeStats: empty input gives null date range and no months', () => {
  const s = computeStats({ totalLines: 0, prompts: [], badLines: [], duplicates: 0 }, '/x');
  assert.equal(s.prompts, 0);
  assert.equal(s.dateRange, null);
  assert.deepEqual(s.perMonth, []);
  assert.deepEqual(s.perProject, []);
});

test('localDate: formats with zero padding', () => {
  assert.equal(localDate(at(2026, 3, 7)), '2026-03-07');
});
