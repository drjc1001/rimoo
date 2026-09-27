import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAnalyze } from './analyze.ts';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) };
}

test('runAnalyze: missing history exits 1 with a readable message', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const c = capture();
    const code = await runAnalyze({ env: { HOME: dir }, cwd: dir, stdout: c.stdout, stderr: c.stderr });
    assert.equal(code, 1);
    assert.equal(c.out.length, 0);
    assert.match(c.err.join(''), /No Claude Code history found at .*history\.jsonl/);
    assert.match(c.err.join(''), /--history <path>/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runAnalyze: file with no readable prompts exits 1, does not write stats', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const file = path.join(dir, 'h.jsonl');
    await writeFile(file, 'garbage\n{"timestamp":1}\n');
    const c = capture();
    const code = await runAnalyze({ historyPath: file, cwd: dir, stdout: c.stdout, stderr: c.stderr });
    assert.equal(code, 1);
    assert.match(c.err.join(''), /2 lines but none could be read as a prompt \(2 unreadable\)/);
    await assert.rejects(readFile(path.join(dir, 'rimoo-out', 'stats.json')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runAnalyze: writes stats.json, prints summary, warns about unreadable lines', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const file = path.join(dir, 'h.jsonl');
    const rec = (display: string, timestamp: number, project: string) =>
      JSON.stringify({ display, pastedContents: {}, timestamp, project, sessionId: 's' });
    const t = Date.UTC(2026, 0, 10, 12);
    await writeFile(file, [rec('a', t, '/p1'), rec('a', t, '/p1'), 'bad', rec('/compact', t + 1, '/p2')].join('\n') + '\n');
    const c = capture();
    const code = await runAnalyze({
      historyPath: file,
      outDir: 'custom-out',
      cwd: dir,
      stdout: c.stdout,
      stderr: c.stderr,
    });
    assert.equal(code, 0);
    const stats = JSON.parse(await readFile(path.join(dir, 'custom-out', 'stats.json'), 'utf8'));
    assert.equal(stats.lines, 4);
    assert.equal(stats.duplicatesRemoved, 1);
    assert.equal(stats.unreadableLines, 1);
    assert.equal(stats.prompts, 2);
    assert.equal(stats.projects, 2);
    assert.equal(stats.slashCommands, 1);
    assert.equal(stats.source, file);
    const out = c.out.join('');
    assert.match(out, /4 lines · 1 duplicate removed · 1 unreadable/);
    assert.match(out, /2 prompts · 2 projects · 2026-01-10 → 2026-01-10/);
    assert.match(out, /Most repeated instructions \(top 20\)\n {2}\(none\)/);
    assert.match(out, /Short replies \(top 10\)\n {2}1 {2}1 {2}2026-01-10 → 2026-01-10 {2}a\n/);
    assert.match(out, /Slash commands \(top 10\)\n {2}1 {2}1 {2}2026-01-10 → 2026-01-10 {2}\/compact\n/);
    assert.match(out, /Saved custom-out\/stats\.json and custom-out\/repeated\.json\n$/);
    const repeated = JSON.parse(await readFile(path.join(dir, 'custom-out', 'repeated.json'), 'utf8'));
    assert.deepEqual(Object.keys(repeated), [
      'generatedAt',
      'similarity',
      'instructions',
      'shortReplies',
      'slashCommands',
      'singletons',
    ]);
    assert.equal(repeated.similarity, 0.8);
    // Groups seen once stay on the terminal but out of the file; the file only counts them.
    assert.deepEqual(repeated.shortReplies, []);
    assert.deepEqual(repeated.singletons, { instructions: 0, shortReplies: 1, slashCommands: 1 });
    assert.match(c.err.join(''), /skipped 1 unreadable line\(s\): 3\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
