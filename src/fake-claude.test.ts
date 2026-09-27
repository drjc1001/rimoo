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
 * FAKE_CLAUDE_FAIL_ON=<part> switches to error for that part only. FAKE_CLAUDE_LOG=<file> appends one JSON
 * line per call: { part, args, claudecode, stdinChars }.
 */
const SCRIPT = `
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const part = Number((/This is part (\\d+) of/.exec(input) || [])[1] || 0);
  if (process.env.FAKE_CLAUDE_LOG) {
    fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({
      part, args: process.argv.slice(2), claudecode: process.env.CLAUDECODE ?? null, stdinChars: input.length,
    }) + '\\n');
  }
  let mode = process.env.FAKE_CLAUDE_MODE || 'ok';
  if (Number(process.env.FAKE_CLAUDE_FAIL_ON) === part) mode = 'error';
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
  const json = JSON.stringify({ findings });
  const result = mode === 'fenced' ? '\`\`\`json\\n' + json + '\\n\`\`\`' : mode === 'garbage' ? 'Sorry, here are some thoughts.' : json;
  process.stdout.write(JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, result,
    usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50,
      output_tokens_details: { thinking_tokens: 20 } },
    total_cost_usd: 0.0125, duration_ms: 4200, num_turns: 1, modelUsage: { 'claude-fake-1': {} },
  }));
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
