import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELP, main, parseArgs } from './args.ts';

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
