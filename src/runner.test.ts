import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Prompt } from './history.ts';
import { prepareChunks, writeChunks, type Manifest } from './chunks.ts';
import {
  findClaude,
  findingsFile,
  MAX_QUOTE,
  parseReply,
  runAll,
  runChunk,
  SYSTEM_PROMPT,
  validateFindings,
  type ChunkFindings,
  type Progress,
} from './runner.ts';
import { makeFakeClaude, readCalls } from './fake-claude.test.ts';

const posixOnly = process.platform === 'win32' ? 'the fake claude is a POSIX script' : false;

let nextId = 1;
const prompt = (display: string, day: number, project = '/repos/a'): Prompt => ({
  id: nextId++,
  display,
  timestamp: new Date(2026, 2, day, 12).getTime(),
  project,
  sessionId: 's',
  pasteCount: 0,
});

/** An out dir with three chunks of two instructions each. */
async function fixture(): Promise<{ outDir: string; manifest: Manifest }> {
  const outDir = await mkdtemp(path.join(tmpdir(), 'rimoo-run-'));
  const ps = [1, 2, 3, 4, 5, 6].map((d) => prompt(`instruction number ${d} for the toy app`, d));
  const opts = { chunkSize: 2 };
  const manifest = await writeChunks(outDir, prepareChunks(ps, opts), opts);
  return { outDir, manifest };
}

async function ids(outDir: string, n: number): Promise<number[]> {
  const text = await readFile(path.join(outDir, 'chunks', `00${n}.jsonl`), 'utf8');
  return text.trim().split('\n').map((l) => (JSON.parse(l) as { id: number }).id);
}

// ---------------------------------------------------------------------------------------------- findClaude

test('findClaude: first executable claude on PATH, or null', { skip: posixOnly }, async () => {
  const a = await mkdtemp(path.join(tmpdir(), 'rimoo-path-'));
  const b = await mkdtemp(path.join(tmpdir(), 'rimoo-path-'));
  try {
    assert.equal(await findClaude({ PATH: `${a}:${b}` }, 'linux'), null);
    assert.equal(await findClaude({}, 'linux'), null);
    // Not executable, or a directory: skipped.
    await writeFile(path.join(a, 'claude'), 'x');
    await mkdir(path.join(b, 'claude'));
    assert.equal(await findClaude({ PATH: `${a}:${b}` }, 'linux'), null);
    await chmod(path.join(a, 'claude'), 0o755);
    assert.equal(await findClaude({ PATH: `${b}:${a}` }, 'linux'), path.join(a, 'claude'));
  } finally {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  }
});

test('findClaude: on Windows reads Path in any case, splits on ; and finds claude.cmd', async () => {
  const a = await mkdtemp(path.join(tmpdir(), 'rimoo-path-'));
  try {
    await writeFile(path.join(a, 'claude.cmd'), '@echo off');
    assert.equal(await findClaude({ Path: `C:\\nowhere;"${a}"` }, 'win32'), path.join(a, 'claude.cmd'));
    assert.equal(await findClaude({ Path: 'C:\\nowhere' }, 'win32'), null);
  } finally {
    await rm(a, { recursive: true, force: true });
  }
});

// ----------------------------------------------------------------------------------------- validateFindings

const good = (over: Record<string, unknown> = {}) => ({
  category: 'testing',
  rule: 'Reproduce a bug before fixing it',
  frequency: 3,
  confidence: 'medium',
  evidence: [
    { id: 1, ts: '2026-03-01T12:00', quote: 'repro first' },
    { id: 2, ts: '2026-03-02T12:00', quote: 'again, repro' },
  ],
  trigger: 'when a bug comes in',
  ...over,
});

test('validateFindings: keeps a finding in shape as it is', () => {
  const r = validateFindings({ findings: [good()] }, new Set([1, 2]));
  assert.deepEqual(r.dropped, { findings: 0, evidence: 0 });
  assert.deepEqual(r.findings, [good()]);
});

test('validateFindings: every field rule drops the whole finding', () => {
  const bad = [
    good({ category: 'style' }),
    good({ rule: '' }),
    good({ rule: '   ' }),
    good({ rule: 3 }),
    good({ frequency: '3' }),
    good({ frequency: Number.NaN }),
    good({ confidence: 'sure' }),
    good({ evidence: 'id 1' }),
    'not an object',
    null,
  ];
  const r = validateFindings({ findings: [...bad, good()] }, new Set([1, 2]));
  assert.equal(r.findings.length, 1);
  assert.deepEqual(r.dropped, { findings: bad.length, evidence: 0 });
});

test('validateFindings: unknown ids are dropped and counted; no evidence left drops the finding', () => {
  const r = validateFindings(
    {
      findings: [
        good({ evidence: [{ id: 1, quote: 'real' }, { id: 99, quote: 'made up' }, { id: '2', quote: 'id as text' }] }),
        good({ evidence: [{ id: 99, quote: 'made up' }] }),
        good({ evidence: [] }),
        good({ evidence: [{ id: 1 }, 'x', { id: 1.5, quote: 'q' }] }),
      ],
    },
    new Set([1, 2]),
  );
  assert.equal(r.findings.length, 1);
  assert.deepEqual(
    r.findings[0]!.evidence,
    [
      { id: 1, ts: null, quote: 'real' },
      { id: 2, ts: null, quote: 'id as text' },
    ],
  );
  // 1 unknown id in the first, 1 in the second, 3 unusable in the fourth.
  assert.deepEqual(r.dropped, { findings: 3, evidence: 5 });
});

test('validateFindings: quotes are cut to 300 characters, empty trigger becomes null', () => {
  const long = '好'.repeat(MAX_QUOTE + 50);
  const r = validateFindings(
    [good({ evidence: [{ id: 1, ts: 't', quote: long }], trigger: '' })],
    new Set([1]),
  );
  assert.equal([...r.findings[0]!.evidence[0]!.quote].length, MAX_QUOTE);
  assert.equal(r.findings[0]!.trigger, null);
});

test('validateFindings: a reply without a findings list throws', () => {
  assert.throws(() => validateFindings({ rules: [] }, new Set()), /no "findings" list/);
  assert.throws(() => validateFindings('text', new Set()), /no "findings" list/);
  assert.deepEqual(validateFindings({ findings: [] }, new Set()).findings, []);
});

test('parseReply: plain JSON, fenced JSON, otherwise throws', () => {
  assert.deepEqual(parseReply('{"findings":[]}'), { findings: [] });
  assert.deepEqual(parseReply('```json\n{"findings":[1]}\n```'), { findings: [1] });
  assert.deepEqual(parseReply('Here you go:\n```\n{"findings":[2]}\n```\n'), { findings: [2] });
  assert.throws(() => parseReply('Sorry, no JSON today.'));
  assert.throws(() => parseReply('```json\nnot json\n```'));
});

// ------------------------------------------------------------------------------------------------ runChunk

test('runChunk ok: flags, stdin, no CLAUDECODE, validated findings and usage in findings/001.json', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const env = { PATH: fake.dir, FAKE_CLAUDE_LOG: fake.log, CLAUDECODE: '1' };
    const r = await runChunk({ claude: fake.claude, outDir, chunk: manifest.chunks[0]!, model: 'opus', env });
    const onDisk = JSON.parse(await readFile(findingsFile(outDir, 1), 'utf8')) as ChunkFindings;
    assert.deepEqual(onDisk, r);
    assert.equal(r.chunk, 1);
    assert.equal(r.model, 'claude-fake-1');
    assert.deepEqual(r.usage, { input: 10, cacheCreation: 100, cacheRead: 1000, output: 50, thinking: 20, total: 1160 });
    assert.equal(r.costUsd, 0.0125);
    assert.equal(r.durationMs, 4200);
    assert.match(r.promptSha256, /^[0-9a-f]{64}$/);
    // One finding kept with its real id; the made-up confidence and the unknown-id-only finding dropped.
    assert.equal(r.findings.length, 1);
    assert.deepEqual(r.dropped, { findings: 2, evidence: 2 });
    const [first] = await ids(outDir, 1);
    assert.deepEqual(r.findings[0]!.evidence.map((e) => e.id), [first]);
    assert.equal(r.findings[0]!.evidence[0]!.quote.length, MAX_QUOTE);

    const [call] = await readCalls(fake.log);
    assert.equal(call!.claudecode, null);
    const promptText = await readFile(path.join(outDir, 'prompts', '001.md'), 'utf8');
    assert.equal(call!.stdinChars, promptText.length);
    const mcp = path.join(outDir, 'mcp-none.json');
    assert.deepEqual(call!.args, [
      '-p',
      '--output-format',
      'json',
      '--system-prompt',
      SYSTEM_PROMPT,
      '--tools',
      '',
      '--strict-mcp-config',
      '--mcp-config',
      mcp,
      '--no-session-persistence',
      '--model',
      'opus',
    ]);
    assert.deepEqual(JSON.parse(await readFile(mcp, 'utf8')), { mcpServers: {} });
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('runChunk fenced: the fence is stripped, same findings', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const r = await runChunk({
      claude: fake.claude,
      outDir,
      chunk: manifest.chunks[0]!,
      env: { PATH: fake.dir, FAKE_CLAUDE_MODE: 'fenced' },
    });
    assert.equal(r.findings.length, 1);
    assert.deepEqual(r.dropped, { findings: 2, evidence: 2 });
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('runChunk garbage: the reply is saved to findings/NNN.raw.txt and the error says where', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const raw = path.join(outDir, 'findings', '002.raw.txt');
    await assert.rejects(
      runChunk({ claude: fake.claude, outDir, chunk: manifest.chunks[1]!, env: { PATH: fake.dir, FAKE_CLAUDE_MODE: 'garbage' } }),
      (err: Error) => err.message.includes('chunk 2') && err.message.includes(raw),
    );
    assert.equal(await readFile(raw, 'utf8'), 'Sorry, here are some thoughts.');
    await assert.rejects(readFile(findingsFile(outDir, 2), 'utf8'));
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('runChunk error and crash: the error carries what claude said, no findings file', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const chunk = manifest.chunks[0]!;
    await assert.rejects(
      runChunk({ claude: fake.claude, outDir, chunk, env: { PATH: fake.dir, FAKE_CLAUDE_MODE: 'error' } }),
      /chunk 1: Claude usage limit reached/,
    );
    await assert.rejects(
      runChunk({ claude: fake.claude, outDir, chunk, env: { PATH: fake.dir, FAKE_CLAUDE_MODE: 'crash' } }),
      /chunk 1: claude exited with code 3 without a JSON result: fake claude crashed/,
    );
    assert.deepEqual(await readdir(path.join(outDir, 'findings')), []);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------------------------------------- runAll

test('runAll: runs in order, adds up usage.json, then resumes, reruns with force or a changed prompt', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const env = { PATH: fake.dir, FAKE_CLAUDE_LOG: fake.log };
    const events: Progress[] = [];
    const s = await runAll({ claude: fake.claude, outDir, manifest, env, onProgress: (p) => events.push(p) });
    assert.deepEqual(events.map((e) => `${e.kind} ${e.chunk.index}/${e.total}`), ['done 1/3', 'done 2/3', 'done 3/3']);
    assert.deepEqual((await readCalls(fake.log)).map((c) => c.part), [1, 2, 3]);
    assert.deepEqual(s, {
      chunksRun: 3,
      chunksSkipped: 0,
      chunksFailed: [],
      tokens: { input: 30, cacheCreation: 300, cacheRead: 3000, output: 150, thinking: 60, total: 3480 },
      costUsd: 0.0375,
      durationMs: 12600,
      findings: 3,
      dropped: { findings: 6, evidence: 6 },
    });
    assert.deepEqual(JSON.parse(await readFile(path.join(outDir, 'findings', 'usage.json'), 'utf8')), s);

    // Resume: nothing runs again, totals still cover every finished chunk.
    const again = await runAll({ claude: fake.claude, outDir, manifest, env });
    assert.equal((await readCalls(fake.log)).length, 3);
    assert.equal(again.chunksRun, 0);
    assert.equal(again.chunksSkipped, 3);
    assert.deepEqual(again.tokens, s.tokens);

    // A chunk whose prompt changed since (history grew, other filters) is not trusted.
    await writeFile(path.join(outDir, 'prompts', '002.md'), 'This is part 2 of 3: changed\n');
    const changed = await runAll({ claude: fake.claude, outDir, manifest, env });
    assert.deepEqual((await readCalls(fake.log)).slice(3).map((c) => c.part), [2]);
    assert.equal(changed.chunksSkipped, 2);

    // --force runs everything again.
    const forced = await runAll({ claude: fake.claude, outDir, manifest, env, force: true, concurrency: 9 });
    assert.equal((await readCalls(fake.log)).length, 7);
    assert.equal(forced.chunksRun, 3);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('runAll: stops at the first failure, keeps finished chunks, records the failed one', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const env = { PATH: fake.dir, FAKE_CLAUDE_LOG: fake.log, FAKE_CLAUDE_FAIL_ON: '2' };
    const events: string[] = [];
    const s = await runAll({
      claude: fake.claude,
      outDir,
      manifest,
      env,
      onProgress: (p) => events.push(`${p.kind} ${p.chunk.index}`),
    });
    assert.deepEqual(events, ['done 1', 'failed 2']);
    assert.deepEqual((await readCalls(fake.log)).map((c) => c.part), [1, 2]);
    assert.deepEqual(s.chunksFailed, [2]);
    assert.equal(s.chunksRun, 1);
    assert.equal(s.tokens.total, 1160);
    assert.deepEqual((await readdir(path.join(outDir, 'findings'))).sort(), ['001.json', 'usage.json']);

    // Next run picks up at chunk 2.
    const next = await runAll({ claude: fake.claude, outDir, manifest, env: { PATH: fake.dir, FAKE_CLAUDE_LOG: fake.log } });
    assert.deepEqual((await readCalls(fake.log)).slice(2).map((c) => c.part), [2, 3]);
    assert.equal(next.chunksSkipped, 1);
    assert.equal(next.chunksRun, 2);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('runAll: with concurrency, chunks already running finish but no new one starts after a failure', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const env = { PATH: fake.dir, FAKE_CLAUDE_LOG: fake.log, FAKE_CLAUDE_FAIL_ON: '1' };
    const s = await runAll({ claude: fake.claude, outDir, manifest, env, concurrency: 2 });
    // 1 and 2 start together; 1 fails, 2 finishes, 3 never starts.
    assert.deepEqual((await readCalls(fake.log)).map((c) => c.part).sort(), [1, 2]);
    assert.deepEqual(s.chunksFailed, [1]);
    assert.equal(s.chunksRun, 1);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});
