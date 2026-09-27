import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HELP, main, parseArgs } from './args.ts';
import { Readable } from 'node:stream';
import { makeFakeClaude, readCalls } from './fake-claude.test.ts';

test('parseArgs: command, --key value, --key=value, help', () => {
  assert.deepEqual(parseArgs(['analyze']), { command: 'analyze', options: {}, errors: [] });
  assert.deepEqual(parseArgs(['analyze', '--history', 'h.jsonl', '--out=o']), {
    command: 'analyze',
    options: { history: 'h.jsonl', out: 'o' },
    errors: [],
  });
  assert.deepEqual(parseArgs(['-h']).options, { help: true });
});

test('parseArgs: reports unknown options, missing values, extra positionals', () => {
  const r = parseArgs(['analyze', '--nope', '--history', 'extra', 'more', '-x']);
  assert.equal(r.command, 'analyze');
  assert.deepEqual(r.errors, ['Unknown option: --nope', 'Unexpected argument: more', 'Unknown option: -x']);
  assert.deepEqual(parseArgs(['analyze', '--out']).errors, ['Option --out needs a value']);
});

test('main: no command prints help and exits 2; --help exits 0; unknown command exits 2', async () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) } };
  };
  const a = io();
  assert.equal(await main([], a.io), 2);
  assert.equal(a.out.join(''), HELP);
  const b = io();
  assert.equal(await main(['--help'], b.io), 0);
  const c = io();
  assert.equal(await main(['wat'], c.io), 2);
  assert.match(c.err.join(''), /Unknown command: wat/);
});

test('main: --similarity must be a number from 0 to 1, otherwise exit 2', async () => {
  for (const bad of ['abc', '1.5', '-0.1', ' ', 'NaN']) {
    const err: string[] = [];
    const code = await main(['analyze', '--similarity', bad, '--history', '/nonexistent'], {
      stdout: () => {},
      stderr: (t) => err.push(t),
    });
    assert.equal(code, 2, bad);
    assert.match(err.join(''), /--similarity must be a number from 0 to 1/);
  }
  assert.deepEqual(parseArgs(['analyze', '--similarity=0.7']).options, { similarity: '0.7' });
  assert.match(HELP, /--similarity <0-1>/);
});

test('main: --similarity reaches repeated.json', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const file = path.join(dir, 'h.jsonl');
    await writeFile(file, JSON.stringify({ display: 'commit this', timestamp: 1, project: '/p' }) + '\n');
    const code = await main(['analyze', '--history', file, '--similarity', '0.7'], {
      stdout: () => {},
      stderr: () => {},
      cwd: dir,
    });
    assert.equal(code, 0);
    const r = JSON.parse(await readFile(path.join(dir, 'rimoo-out', 'repeated.json'), 'utf8'));
    assert.equal(r.similarity, 0.7);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('main: --since must be a real YYYY-MM-DD date, --sample and --chunk-size whole numbers of 1 or more', async () => {
  const cases: [string[], RegExp][] = [
    [['--since', '2026-13-01'], /--since must be a date written YYYY-MM-DD, got: 2026-13-01/],
    [['--since', 'last week'], /--since must be a date written YYYY-MM-DD/],
    [['--chunk-size', '0'], /--chunk-size must be a whole number of 1 or more, got: 0/],
    [['--chunk-size', '1.5'], /--chunk-size must be a whole number of 1 or more/],
    [['--sample', '-2'], /--sample must be a whole number of 1 or more/],
    [['--sample', 'abc'], /--sample must be a whole number of 1 or more/],
  ];
  for (const [flags, message] of cases) {
    const err: string[] = [];
    const code = await main(['analyze', ...flags, '--history', '/nonexistent'], {
      stdout: () => {},
      stderr: (t) => err.push(t),
    });
    assert.equal(code, 2, flags.join(' '));
    assert.match(err.join(''), message);
  }
  for (const flag of ['--project <text>', '--since <date>', '--sample <n>', '--chunk-size <n>'])
    assert.ok(HELP.includes(flag), flag);
});

test('main: chunk flags reach manifest.json', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const file = path.join(dir, 'h.jsonl');
    const lines = [1, 2, 3].map((i) =>
      JSON.stringify({
        display: `instruction number ${i} for the toy app`,
        timestamp: Date.UTC(2026, 6, 10 + i, 12),
        project: '/r/toy-app',
      }),
    );
    await writeFile(file, lines.join('\n') + '\n');
    const code = await main(
      ['analyze', '--history', file, '--project', 'toy', '--since', '2026-07-01', '--sample', '1', '--chunk-size', '2'],
      { stdout: () => {}, stderr: () => {}, cwd: dir },
    );
    assert.equal(code, 0);
    const m = JSON.parse(await readFile(path.join(dir, 'rimoo-out', 'manifest.json'), 'utf8'));
    assert.deepEqual(m.filters, { project: 'toy', since: '2026-07-01', sample: 1 });
    assert.equal(m.chunkSize, 2);
    assert.equal(m.totalChunks, 2);
    assert.equal(m.chunks.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('parseArgs: --prepare-only, --yes and --force are flags that take no value', () => {
  assert.deepEqual(parseArgs(['analyze', '--prepare-only', '--yes', '--force', '--model', 'opus', '--concurrency=2']), {
    command: 'analyze',
    options: { 'prepare-only': true, yes: true, force: true, model: 'opus', concurrency: '2' },
    errors: [],
  });
  assert.deepEqual(parseArgs(['analyze', '--yes=1']).errors, ['Option --yes takes no value']);
  assert.deepEqual(parseArgs(['analyze', '--model']).errors, ['Option --model needs a value']);
  for (const flag of ['--prepare-only', '--yes', '--concurrency <n>', '--force', '--model <name>'])
    assert.ok(HELP.includes(flag), flag);
});

test('main: --concurrency must be a whole number from 1 to 4, otherwise exit 2', async () => {
  for (const bad of ['5', '0', '1.5', 'two']) {
    const err: string[] = [];
    const code = await main(['analyze', '--concurrency', bad, '--history', '/nonexistent'], {
      stdout: () => {},
      stderr: (t) => err.push(t),
    });
    assert.equal(code, 2, bad);
    assert.match(err.join(''), new RegExp(`--concurrency must be a whole number from 1 to 4, got: ${bad}`));
  }
});

test('main: run flags reach claude (--yes, --model, --concurrency), --prepare-only stops before it', {
  skip: process.platform === 'win32' ? 'the fake claude is a POSIX script' : false,
}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  const fake = await makeFakeClaude();
  try {
    const file = path.join(dir, 'h.jsonl');
    const lines = [1, 2, 3].map((i) =>
      JSON.stringify({ display: `instruction number ${i} for the toy app`, timestamp: Date.UTC(2026, 6, 10 + i, 12), project: '/r/toy-app' }),
    );
    await writeFile(file, lines.join('\n') + '\n');
    const io = { stdout: () => {}, stderr: () => {}, cwd: dir, env: { PATH: fake.dir, FAKE_CLAUDE_LOG: fake.log } };
    const stdin = () => Object.assign(Readable.from([]), { isTTY: false });
    assert.equal(await main(['analyze', '--history', file, '--chunk-size', '2', '--prepare-only'], { ...io, stdin: stdin() }), 0);
    assert.deepEqual(await readCalls(fake.log), []);
    assert.equal(await main(['analyze', '--history', file, '--chunk-size', '2'], { ...io, stdin: stdin() }), 2);
    assert.deepEqual(await readCalls(fake.log), []);
    const code = await main(
      ['analyze', '--history', file, '--chunk-size', '2', '--yes', '--model', 'sonnet', '--concurrency', '2'],
      { ...io, stdin: stdin() },
    );
    assert.equal(code, 0);
    const calls = await readCalls(fake.log);
    assert.deepEqual(calls.map((c) => c.part).sort(), [1, 2]);
    assert.deepEqual(calls[0]!.args.slice(-2), ['--model', 'sonnet']);
    // --force runs finished chunks again.
    assert.equal(await main(['analyze', '--history', file, '--chunk-size', '2', '--yes', '--force'], { ...io, stdin: stdin() }), 0);
    assert.equal((await readCalls(fake.log)).length, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('parseArgs: --allow-paths is a flag, listed in the help', () => {
  assert.deepEqual(parseArgs(['analyze', '--allow-paths']), { command: 'analyze', options: { 'allow-paths': true }, errors: [] });
  assert.deepEqual(parseArgs(['analyze', '--allow-paths=yes']).errors, ['Option --allow-paths takes no value']);
  assert.ok(HELP.includes('--allow-paths'));
});
