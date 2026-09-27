// Test helper, not a test: a fake `claude` executable so no test ever calls the real one.
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Reads the prompt on stdin and answers like `claude -p --output-format json`. FAKE_CLAUDE_MODE picks the reply:
 * - ok: a result with three findings: one fine (a real id, an unknown id, a 400-character quote), one with a
 *   made-up confidence, one whose only id is unknown
 * - fenced: the same result inside a ```json fence
 * - garbage: a result that is not JSON
 * - error: subtype error_during_execution, exit code 1
 * - crash: nothing on stdout, a message on stderr, exit code 3
 * FAKE_CLAUDE_FAIL_ON=<part> switches to error for that part only (and delays every success by 200 ms, so a
 * failure running alongside a success always lands first). FAKE_CLAUDE_LOG=<file> appends one JSON
 * line per call: { part, args, claudecode, stdinChars }.
 *
 * A merge prompt (one holding a <findings> block) gets a merge reply instead, built from the finding lines
 * i0, i1, … in it: {key "Result First!", title, i0's rule, high, [i0, i1]}, {plan_before_coding, i2's rule, medium,
 * [i2]}, {with_unknown, low, [999999, i3]}, {duplicate_member, high, [i0, i4]}; missing i's are left out.
 * The modes above apply to it too (fenced, garbage, error, crash). FAKE_CLAUDE_MERGE_FAIL_ON=<category> switches
 * to error for that category only. Merge calls are logged to FAKE_CLAUDE_MERGE_LOG=<file>, not FAKE_CLAUDE_LOG:
 * { category, args, stdinChars, prompt }.
 */
const SCRIPT = `
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const part = Number((/This is part (\\d+) of/.exec(input) || [])[1] || 0);
  const merge = /\\n<findings>\\n/.test(input);
  const category = merge ? (/in the category "([a-z_]+)"/.exec(input) || [])[1] || null : null;
  if (merge && process.env.FAKE_CLAUDE_MERGE_LOG) {
    fs.appendFileSync(process.env.FAKE_CLAUDE_MERGE_LOG, JSON.stringify({
      category, args: process.argv.slice(2), stdinChars: input.length, prompt: input,
    }) + '\\n');
  }
  if (!merge && process.env.FAKE_CLAUDE_LOG) {
    fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({
      part, args: process.argv.slice(2), claudecode: process.env.CLAUDECODE ?? null, stdinChars: input.length,
    }) + '\\n');
  }
  let mode = process.env.FAKE_CLAUDE_MODE || 'ok';
  if (!merge && Number(process.env.FAKE_CLAUDE_FAIL_ON) === part) mode = 'error';
  if (merge && process.env.FAKE_CLAUDE_MERGE_FAIL_ON === category) mode = 'error';
  if (mode === 'crash') {
    process.stderr.write('fake claude crashed');
    process.exit(3);
  }
  if (mode === 'error') {
    process.stdout.write(JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true,
      result: 'Claude usage limit reached', usage: {} }));
    process.exit(1);
  }
  const ids = [...input.matchAll(/^(\\d+) \\| /gm)].map((m) => Number(m[1]));
  const findings = [
    { category: 'communication', rule: 'Put the result first', frequency: 3, confidence: 'high',
      evidence: [{ id: ids[0], ts: '2026-03-01T12:00', quote: 'x'.repeat(400) }, { id: 999999, ts: 'x', quote: 'made up' }],
      trigger: 'after a long report' },
    { category: 'testing', rule: 'Test first', frequency: 2, confidence: 'very sure',
      evidence: [{ id: ids[0], ts: 'x', quote: 'q' }], trigger: null },
    { category: 'planning', rule: 'Plan first', frequency: 2, confidence: 'low',
      evidence: [{ id: 999999, ts: 'x', quote: 'q' }], trigger: null },
  ];
  let json = JSON.stringify({ findings });
  if (merge) {
    const block = input.slice(input.indexOf('<findings>'), input.indexOf('</findings>'));
    const lines = [...block.matchAll(/^(\\d+) \\| .*$/gm)].map((m) => ({ index: Number(m[1]), rule: m[0].split(' | ')[4] }));
    const at = (k) => lines[k];
    const group = (key, extra, conf, members, ruleOf) => ({
      key, ...extra, rule: at(ruleOf) ? at(ruleOf).rule : 'no rule', confidence: conf,
      members: members.filter((m) => m !== undefined),
    });
    const idx = (k) => (at(k) ? at(k).index : undefined);
    const rules = [
      group('Result First!', { title: 'Title of ' + (at(0) ? at(0).index : '') }, 'high', [idx(0), idx(1)], 0),
      group('plan_before_coding', {}, 'medium', [idx(2)], 2),
      group('with_unknown', {}, 'low', [999999, idx(3)], 3),
      group('duplicate_member', {}, 'high', [idx(0), idx(4)], 4),
    ].filter((g) => g.members.length > 0);
    json = JSON.stringify({ rules });
  }
  const result = mode === 'fenced' ? '\`\`\`json\\n' + json + '\\n\`\`\`' : mode === 'garbage' ? 'Sorry, here are some thoughts.' : json;
  const reply = () => process.stdout.write(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, result,
    usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50,
      output_tokens_details: { thinking_tokens: 20 } },
    total_cost_usd: 0.0125, duration_ms: 4200, num_turns: 1, modelUsage: { 'claude-fake-1': {} },
  }));
  // With a part set to fail, successes answer a little later, so a failure running alongside always lands first.
  if (process.env.FAKE_CLAUDE_FAIL_ON || process.env.FAKE_CLAUDE_MERGE_FAIL_ON) setTimeout(reply, 200);
  else reply();
});
`;

/** A temp dir holding an executable `claude`. Put only this dir on PATH: the script names node by full path. */
export async function makeFakeClaude(): Promise<{ dir: string; claude: string; log: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-fake-claude-'));
  const claude = path.join(dir, 'claude');
  await writeFile(claude, `#!${process.execPath}\n${SCRIPT}`, 'utf8');
  await chmod(claude, 0o755);
  return { dir, claude, log: path.join(dir, 'calls.jsonl') };
}

export interface FakeCall {
  part: number;
  args: string[];
  claudecode: string | null;
  stdinChars: number;
}

export async function readCalls(log: string): Promise<FakeCall[]> {
  try {
    return (await readFile(log, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as FakeCall);
  } catch {
    return [];
  }
}

export interface FakeMergeCall {
  category: string | null;
  args: string[];
  stdinChars: number;
  prompt: string;
}

export async function readMergeCalls(log: string): Promise<FakeMergeCall[]> {
  try {
    return (await readFile(log, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as FakeMergeCall);
  } catch {
    return [];
  }
}
