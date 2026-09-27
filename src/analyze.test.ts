import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runAnalyze } from './analyze.ts';
import { Readable } from 'node:stream';
import { readdir } from 'node:fs/promises';
import { makeFakeClaude, readCalls, readMergeCalls } from './fake-claude.test.ts';
import { FIXTURE_RULES, quoteOf, writeFindingsFixture } from './findings-fixture.test.ts';
import type { Manifest } from './chunks.ts';

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
    assert.match(out, /Prepared for analysis\n {2}0 prompts kept · dropped 1 slash command, 1 short reply, 0 empty or paste-only\n {2}Nothing to analyze/);
    assert.match(
      out,
      /Saved custom-out\/stats\.json, custom-out\/repeated\.json and custom-out\/manifest\.json\n$/,
    );
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

// ------------------------------------------------------------------------ T-004: running Claude Code (fake)

const posixOnly = process.platform === 'win32' ? 'the fake claude is a POSIX script' : false;

/** A history of six instructions, cut into three chunks with chunkSize 2. */
async function historyFixture(dir: string): Promise<string> {
  const file = path.join(dir, 'h.jsonl');
  const lines = [1, 2, 3, 4, 5, 6].map((i) =>
    JSON.stringify({
      display: `instruction number ${i} for the toy app`,
      timestamp: new Date(2026, 6, 10 + i, 12).getTime(),
      project: '/r/toy-app',
    }),
  );
  await writeFile(file, lines.join('\n') + '\n');
  return file;
}

const tty = (answer: string) => Object.assign(Readable.from([answer]), { isTTY: true });
const pipe = () => Object.assign(Readable.from([]), { isTTY: false });

async function withFake(fn: (ctx: { dir: string; history: string; env: NodeJS.ProcessEnv; log: string }) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  const fake = await makeFakeClaude();
  try {
    const history = await historyFixture(dir);
    await fn({ dir, history, env: { PATH: fake.dir, FAKE_CLAUDE_LOG: fake.log }, log: fake.log });
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
}

test('runAnalyze --yes: runs every chunk, prints progress and totals, saves findings/', { skip: posixOnly }, async () => {
  await withFake(async ({ dir, history, env, log }) => {
    const c = capture();
    const code = await runAnalyze({
      historyPath: history, chunkSize: 2, yes: true, env, cwd: dir, stdin: pipe(), stdout: c.stdout, stderr: c.stderr,
    });
    assert.equal(code, 0, c.err.join(''));
    const out = c.out.join('');
    assert.match(out, /Analyze with Claude Code\n {2}3 chunks to run · about [\d,]+ tokens \(estimate\)\n/);
    assert.doesNotMatch(out, /\[y\/N\]/);
    assert.match(out, / {2}chunk 1\/3 · 1,160 tokens · \$0\.01 · 4 s · 1 finding \(2 dropped, 2 quotes dropped\)\n/);
    assert.match(out, / {2}chunk 3\/3 · 1,160 tokens/);
    assert.match(out, /Analyzed 3 chunks this run\n {2}3 chunks finished: 3,480 tokens · \$0\.04 · 3 findings \(6 dropped, 6 quotes dropped\)\n/);
    assert.match(out, / {4}= 30 input \+ 300 cache writes \+ 3,000 cache reads \+ 150 output \(60 of it thinking\)\n/);
    assert.match(out, /counts toward your plan's usage/);
    assert.doesNotMatch(out, /--sample/);
    assert.match(
      out,
      /Saved rimoo-out\/stats\.json, rimoo-out\/repeated\.json, rimoo-out\/manifest\.json, rimoo-out\/findings\/, rimoo-out\/report\.md, rimoo-out\/CLAUDE\.md, rimoo-out\/SKILL\.md and rimoo-out\/workstyle\.json\n$/,
    );
    assert.deepEqual((await readCalls(log)).map((x) => x.part), [1, 2, 3]);
    const files = (await readdir(path.join(dir, 'rimoo-out', 'findings'))).sort();
    assert.deepEqual(files, ['001.json', '002.json', '003.json', 'usage.json']);
    const usage = JSON.parse(await readFile(path.join(dir, 'rimoo-out', 'findings', 'usage.json'), 'utf8'));
    assert.equal(usage.tokens.total, 3480);

    // Second run: everything is kept, nothing is sent, no question asked.
    const again = capture();
    assert.equal(
      await runAnalyze({ historyPath: history, chunkSize: 2, env, cwd: dir, stdin: pipe(), stdout: again.stdout, stderr: again.stderr }),
      0,
    );
    assert.match(again.out.join(''), /All 3 chunks already have findings; pass --force to analyze them again\.\n/);
    assert.match(again.out.join(''), /chunk 2\/3 · already done, kept/);
    assert.equal((await readCalls(log)).length, 3);
  });
});

test('runAnalyze: asks y/N on a terminal; n sends nothing, y runs', { skip: posixOnly }, async () => {
  await withFake(async ({ dir, history, env, log }) => {
    const no = capture();
    const base = { historyPath: history, chunkSize: 2, sample: 1, env, cwd: dir };
    assert.equal(await runAnalyze({ ...base, stdin: tty('n\n'), stdout: no.stdout, stderr: no.stderr }), 0);
    assert.match(no.out.join(''), /Run 1 chunk now\? \[y\/N\] Nothing was sent to Claude\.\n/);
    assert.deepEqual(await readCalls(log), []);

    const yes = capture();
    assert.equal(await runAnalyze({ ...base, stdin: tty('y\n'), stdout: yes.stdout, stderr: yes.stderr }), 0);
    const out = yes.out.join('');
    assert.match(out, /Run 1 chunk now\? \[y\/N\] \s*chunk 1\/3 · 1,160 tokens/);
    // --sample: real use against the estimate, and what all chunks would take at that rate.
    assert.match(out, / {2}1 chunk used 1,160 tokens \(estimate was [\d,]+\); all 3 chunks ≈ [\d,]+ at this rate\n/);
    assert.match(out, / {2}About \$0\.04 and 13 s for all 3 chunks one at a time; --concurrency 4 runs up to 4 at once, --model <name> changes the model\n/);
    assert.match(out, / {2}Run again without --sample to analyze the rest; finished chunks are kept\.\n/);
    assert.equal((await readCalls(log)).length, 1);
  });
});

test('runAnalyze: no terminal and no --yes exits 2 before sending anything', { skip: posixOnly }, async () => {
  await withFake(async ({ dir, history, env, log }) => {
    const c = capture();
    const code = await runAnalyze({ historyPath: history, chunkSize: 2, env, cwd: dir, stdin: pipe(), stdout: c.stdout, stderr: c.stderr });
    assert.equal(code, 2);
    assert.match(c.out.join(''), /3 chunks to run · about [\d,]+ tokens/);
    assert.match(c.err.join(''), /Pass --yes to run\./);
    assert.deepEqual(await readCalls(log), []);
  });
});

test('runAnalyze --prepare-only: stops after the prompts, exit 0, claude never called', { skip: posixOnly }, async () => {
  await withFake(async ({ dir, history, env, log }) => {
    const c = capture();
    const code = await runAnalyze({
      historyPath: history, chunkSize: 2, prepareOnly: true, yes: true, env, cwd: dir, stdin: pipe(), stdout: c.stdout, stderr: c.stderr,
    });
    assert.equal(code, 0);
    assert.doesNotMatch(c.out.join(''), /Analyze with Claude Code/);
    assert.match(c.out.join(''), /and rimoo-out\/manifest\.json\n$/);
    assert.deepEqual(await readCalls(log), []);
  });
});

test('runAnalyze: claude not on PATH points at the prompts and exits 0', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const history = await historyFixture(dir);
    const c = capture();
    const code = await runAnalyze({
      historyPath: history, yes: true, env: { PATH: dir }, cwd: dir, stdin: pipe(), stdout: c.stdout, stderr: c.stderr,
    });
    assert.equal(code, 0);
    assert.match(
      c.out.join(''),
      /Claude Code \(the `claude` command\) was not found on PATH, so nothing was analyzed\.\n {2}The prompts in rimoo-out\/prompts\/ are ready to paste into Claude yourself/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runAnalyze: a failing chunk stops the run, keeps what finished, exits 1', { skip: posixOnly }, async () => {
  await withFake(async ({ dir, history, env, log }) => {
    const c = capture();
    const code = await runAnalyze({
      historyPath: history, chunkSize: 2, yes: true, env: { ...env, FAKE_CLAUDE_FAIL_ON: '2' }, cwd: dir, stdin: pipe(),
      stdout: c.stdout, stderr: c.stderr,
    });
    assert.equal(code, 1);
    const out = c.out.join('');
    assert.match(out, / {2}chunk 2\/3 · failed: chunk 2: Claude usage limit reached\n/);
    assert.match(out, /Analyzed 1 chunk this run, 1 failed\n/);
    assert.match(out, /Finished chunks are kept in rimoo-out\/findings\/; run the same command again to continue\.\n/);
    assert.doesNotMatch(out, /chunk 3\/3/);
    assert.deepEqual((await readCalls(log)).map((x) => x.part), [1, 2]);
    assert.deepEqual((await readdir(path.join(dir, 'rimoo-out', 'findings'))).sort(), ['001.json', 'usage.json']);
  });
});

// ------------------------------------------------------------------------ T-005: merge and exports (fake)

/** withFake, with the three chunks already analyzed (findings from findings-fixture) and a merge log. */
async function withFindings(
  fn: (ctx: { dir: string; history: string; env: NodeJS.ProcessEnv; log: string; mergeLog: string; ids: number[][] }) => Promise<void>,
) {
  await withFake(async ({ dir, history, env, log }) => {
    const c = capture();
    await runAnalyze({ historyPath: history, chunkSize: 2, prepareOnly: true, cwd: dir, stdout: c.stdout, stderr: c.stderr });
    const out = path.join(dir, 'rimoo-out');
    const manifest = JSON.parse(await readFile(path.join(out, 'manifest.json'), 'utf8')) as Manifest;
    const ids = await writeFindingsFixture(out, manifest);
    const mergeLog = path.join(dir, 'merge.jsonl');
    await fn({ dir, history, env: { ...env, FAKE_CLAUDE_MERGE_LOG: mergeLog }, log, mergeLog, ids });
  });
}

test('runAnalyze: chunks done → merge → four exports, the §8 summary and Saved on the terminal', { skip: posixOnly }, async () => {
  await withFindings(async ({ dir, history, env, log, mergeLog, ids }) => {
    const c = capture();
    const code = await runAnalyze({ historyPath: history, chunkSize: 2, yes: true, env, cwd: dir, stdin: pipe(), stdout: c.stdout, stderr: c.stderr });
    assert.equal(code, 0, c.err.join(''));
    const out = c.out.join('');
    assert.match(out, /All 3 chunks already have findings/);
    assert.deepEqual(await readCalls(log), []);
    assert.equal((await readMergeCalls(mergeLog)).length, 3);
    assert.match(out, /Merge findings into rules with Claude Code\n {2}7 findings · 3 calls \(one per category\) · about [\d,]+ tokens \(estimate\)\n/);
    assert.match(out, / {2}communication · 1,160 tokens · \$0\.01 · 4 s · 5 findings → 4 rules \(1 unknown index dropped, 1 repeated index dropped\)\n/);
    assert.match(out, / {2}planning · 1,160 tokens · \$0\.01 · 4 s · 1 finding → 1 rule \(1 unknown index dropped, 1 repeated index dropped, 2 groups dropped\)\n/);
    assert.match(out, / {2}Merged 7 findings into 6 rules: 3,480 tokens · \$0\.04\n/);
    assert.match(
      out,
      new RegExp(
        '\nRimoo analyzed 6 prompts across 1 project\\.\n3 of 3 chunks analyzed\\.\n\nYour strongest working patterns:\n\n' +
          `1\\. ${FIXTURE_RULES.A}（出現於 2 段、8 則）\n` +
          `2\\. ${FIXTURE_RULES.P}（出現於 1 段、4 則）\n`,
      ),
    );
    assert.match(out, /\n6\. 不要客套話。（出現於 1 段、2 則）\n\nSaved /);
    assert.match(
      out,
      /Saved rimoo-out\/stats\.json, rimoo-out\/repeated\.json, rimoo-out\/manifest\.json, rimoo-out\/findings\/, rimoo-out\/report\.md, rimoo-out\/CLAUDE\.md, rimoo-out\/SKILL\.md and rimoo-out\/workstyle\.json\n$/,
    );
    const o = path.join(dir, 'rimoo-out');
    const [report, claudeMd, skill, workstyle] = await Promise.all(
      ['report.md', 'CLAUDE.md', 'SKILL.md', 'workstyle.json'].map((f) => readFile(path.join(o, f), 'utf8')),
    );
    assert.match(report!, /^# Rimoo report\n\nRimoo analyzed 6 prompts across 1 project\./);
    assert.ok(report!.includes(quoteOf(ids[0]![0]!)));
    for (const other of [claudeMd!, skill!, workstyle!]) for (const id of ids.flat()) assert.ok(!other.includes(quoteOf(id)));
    assert.match(claudeMd!, /^# How I work with AI \(generated by Rimoo on \d{4}-\d{2}-\d{2}\)\n/);
    assert.doesNotMatch(claudeMd!, /不要客套話/); // low
    assert.match(skill!, /^---\nname: my-workstyle\ndescription: ".*result_first、result_first_2、plan_before_coding。/);
    const w = JSON.parse(workstyle!);
    assert.deepEqual(w.communication, ['result_first', 'plan_before_coding', 'duplicate_member', 'with_unknown']);
    assert.deepEqual(w.planning, ['result_first_2']);
    assert.equal((JSON.parse(await readFile(path.join(o, 'merged.json'), 'utf8')) as { rules: unknown[] }).rules.length, 6);

    // Same findings: merged.json is reused, nothing is sent, no question asked, the files are written again.
    const again = capture();
    assert.equal(
      await runAnalyze({ historyPath: history, chunkSize: 2, env, cwd: dir, stdin: pipe(), stdout: again.stdout, stderr: again.stderr }),
      0,
      again.err.join(''),
    );
    assert.match(again.out.join(''), /Findings unchanged since the last merge; kept its 6 rules\. Pass --force to merge again\.\n/);
    assert.match(again.out.join(''), /Your strongest working patterns:/);
    assert.equal((await readMergeCalls(mergeLog)).length, 3);

    // --force: chunks and merge run again.
    const forced = capture();
    assert.equal(
      await runAnalyze({ historyPath: history, chunkSize: 2, yes: true, force: true, env, cwd: dir, stdin: pipe(), stdout: forced.stdout, stderr: forced.stderr }),
      0,
    );
    assert.equal((await readCalls(log)).length, 3);
    assert.equal((await readMergeCalls(mergeLog)).length, 4); // the fake's chunk findings are all communication
  });
});

test('runAnalyze: a merge on its own asks first; no terminal exits 2, n sends nothing, y merges', { skip: posixOnly }, async () => {
  await withFindings(async ({ dir, history, env, mergeLog }) => {
    const base = { historyPath: history, chunkSize: 2, env, cwd: dir };
    const piped = capture();
    assert.equal(await runAnalyze({ ...base, stdin: pipe(), stdout: piped.stdout, stderr: piped.stderr }), 2);
    assert.match(piped.out.join(''), /7 findings · 3 calls/);
    assert.match(piped.err.join(''), /Not merging: there is no terminal to ask for a yes\. Pass --yes to run\.\n/);

    const no = capture();
    assert.equal(await runAnalyze({ ...base, stdin: tty('n\n'), stdout: no.stdout, stderr: no.stderr }), 0);
    assert.match(no.out.join(''), /Merge now\? \[y\/N\] Nothing was sent to Claude\.\n/);
    assert.deepEqual(await readMergeCalls(mergeLog), []);
    await assert.rejects(readFile(path.join(dir, 'rimoo-out', 'report.md')));

    const yes = capture();
    assert.equal(await runAnalyze({ ...base, stdin: tty('y\n'), stdout: yes.stdout, stderr: yes.stderr }), 0);
    assert.match(yes.out.join(''), /Merge now\? \[y\/N\] \s*\w+ · 1,160 tokens/);
    assert.equal((await readMergeCalls(mergeLog)).length, 3);
  });
});

test('runAnalyze: a failed chunk means no merge; a failed merge exits 1 and keeps the findings', { skip: posixOnly }, async () => {
  await withFake(async ({ dir, history, env }) => {
    const mergeLog = path.join(dir, 'merge.jsonl');
    const c = capture();
    const code = await runAnalyze({
      historyPath: history, chunkSize: 2, yes: true, env: { ...env, FAKE_CLAUDE_FAIL_ON: '3', FAKE_CLAUDE_MERGE_LOG: mergeLog },
      cwd: dir, stdin: pipe(), stdout: c.stdout, stderr: c.stderr,
    });
    assert.equal(code, 1);
    assert.match(c.out.join(''), /run the same command again to continue\.\n/);
    assert.doesNotMatch(c.out.join(''), /Merge findings/);
    assert.deepEqual(await readMergeCalls(mergeLog), []);
    await assert.rejects(readFile(path.join(dir, 'rimoo-out', 'report.md')));
    assert.match(c.out.join(''), /and rimoo-out\/findings\/\n$/);

    const m = capture();
    const failed = await runAnalyze({
      historyPath: history, chunkSize: 2, yes: true, env: { ...env, FAKE_CLAUDE_MERGE_FAIL_ON: 'communication' },
      cwd: dir, stdin: pipe(), stdout: m.stdout, stderr: m.stderr,
    });
    assert.equal(failed, 1);
    assert.match(m.out.join(''), / {2}Merge failed: merge communication: Claude usage limit reached\n {2}The findings are kept; run the same command again to merge\.\n/);
    assert.equal((await readdir(path.join(dir, 'rimoo-out', 'findings'))).length, 4);
    await assert.rejects(readFile(path.join(dir, 'rimoo-out', 'merged.json')));
  });
});
