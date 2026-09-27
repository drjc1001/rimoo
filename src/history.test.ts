import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { locateHistory, parseHistory, parseLine, slashCommand } from './history.ts';

test('locateHistory: --history override wins over everything', () => {
  const p = locateHistory({ override: 'some/where/h.jsonl', env: { HOME: '/h', CLAUDE_CONFIG_DIR: '/c' } });
  assert.equal(p, path.resolve('some/where/h.jsonl'));
});

test('locateHistory: CLAUDE_CONFIG_DIR is honoured', () => {
  assert.equal(locateHistory({ env: { HOME: '/h', CLAUDE_CONFIG_DIR: '/cfg' } }), path.join('/cfg', 'history.jsonl'));
});

test('locateHistory: HOME first, then USERPROFILE (Windows)', () => {
  assert.equal(locateHistory({ env: { HOME: '/home/dev' } }), path.join('/home/dev', '.claude', 'history.jsonl'));
  const win = locateHistory({ env: { USERPROFILE: 'C:\\Users\\dev' } });
  assert.ok(win.startsWith('C:\\Users\\dev'), win);
  assert.ok(win.endsWith('history.jsonl'), win);
});

test('parseLine: full record keeps fields and counts pastes without keeping them', () => {
  const line = JSON.stringify({
    display: 'commit this',
    pastedContents: { a: { content: 'SECRET' }, b: { content: 'x' } },
    timestamp: 1700000000000,
    project: '/repo',
    sessionId: 's1',
  });
  const p = parseLine(line, 7);
  assert.deepEqual(p, {
    id: 7,
    display: 'commit this',
    timestamp: 1700000000000,
    project: '/repo',
    sessionId: 's1',
    pasteCount: 2,
  });
  assert.ok(!JSON.stringify(p).includes('SECRET'));
});

test('parseLine: older records without sessionId or pastedContents are accepted', () => {
  const p = parseLine(JSON.stringify({ display: 'hi', timestamp: 1, project: '/r' }), 1);
  assert.deepEqual(p, { id: 1, display: 'hi', timestamp: 1, project: '/r', sessionId: '', pasteCount: 0 });
});

test('parseLine: rejects unreadable records', () => {
  assert.equal(parseLine('{not json', 1), null);
  assert.equal(parseLine('[1,2]', 1), null);
  assert.equal(parseLine(JSON.stringify({ timestamp: 1 }), 1), null);
  assert.equal(parseLine(JSON.stringify({ display: 'x', timestamp: '2026-01-01' }), 1), null);
  assert.equal(parseLine(JSON.stringify({ display: 42, timestamp: 1 }), 1), null);
});

test('parseHistory: counts lines, drops exact duplicates, reports unreadable line numbers', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const file = path.join(dir, 'history.jsonl');
    const rec = (display: string, timestamp: number) =>
      JSON.stringify({ display, pastedContents: {}, timestamp, project: '/p', sessionId: 's' });
    const lines = [
      rec('first', 1000), // 1
      rec('first', 1000), // 2 exact duplicate
      '{broken', // 3 unreadable
      '', // 4 blank, ignored
      rec('first', 2000), // 5 same text, different time: kept
      JSON.stringify({ display: 'old format', timestamp: 3000 }), // 6 lenient
      JSON.stringify({ timestamp: 4000 }), // 7 no display: unreadable
    ];
    await writeFile(file, lines.join('\r\n') + '\n');
    const r = await parseHistory(file);
    assert.equal(r.totalLines, 7);
    assert.equal(r.duplicates, 1);
    assert.deepEqual(r.badLines, [3, 7]);
    assert.deepEqual(
      r.prompts.map((p) => [p.id, p.display]),
      [
        [1, 'first'],
        [5, 'first'],
        [6, 'old format'],
      ],
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('slashCommand: command name for slash commands, null for paths and plain text', () => {
  assert.equal(slashCommand('/compact'), '/compact');
  assert.equal(slashCommand('  /Model opus  '), '/model');
  assert.equal(slashCommand('/jasper-taste plan'), '/jasper-taste');
  assert.equal(slashCommand('/mattpocock-skills:tdd'), '/mattpocock-skills:tdd');
  assert.equal(slashCommand('/btw預期把L1/L2/L3 都做完'), '/btw');
  assert.equal(slashCommand('/btw, one more thing'), '/btw');
  assert.equal(slashCommand('/data/repos/app is the repo'), null);
  assert.equal(slashCommand('/debug/shot.png 這個檔案'), null);
  assert.equal(slashCommand('/ad-c-4x5-v3.mp4 從 0:01'), null);
  assert.equal(slashCommand('// a comment'), null);
  assert.equal(slashCommand('/[B'), null);
  assert.equal(slashCommand('/'), null);
  assert.equal(slashCommand('commit this'), null);
});
