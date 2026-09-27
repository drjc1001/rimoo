import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Prompt } from './history.ts';
import { prepareChunks, writeChunks, type Manifest } from './chunks.ts';
import { buildMergePrompt } from './merge-template.ts';
import {
  combine,
  joinEvidence,
  keyFromRule,
  loadFindings,
  MAX_EVIDENCE,
  mergedFile,
  planMerge,
  rankRules,
  runMerge,
  snakeKey,
  validateMerge,
  type FlatFinding,
  type Merged,
} from './merge.ts';
import { SYSTEM_PROMPT } from './runner.ts';
import { makeFakeClaude, readMergeCalls } from './fake-claude.test.ts';
import { FIXTURE_RULES, quoteOf, writeFindingsFixture } from './findings-fixture.test.ts';

const posixOnly = process.platform === 'win32' ? 'the fake claude is a POSIX script' : false;

/** An out dir with three chunks of four instructions and the fixture's findings for them. */
async function fixture(): Promise<{ outDir: string; manifest: Manifest; ids: number[][] }> {
  const outDir = await mkdtemp(path.join(tmpdir(), 'rimoo-merge-'));
  const ps: Prompt[] = Array.from({ length: 12 }, (_, i) => ({
    id: 100 + i,
    display: `instruction number ${i} for the toy app`,
    timestamp: new Date(2026, 2, 12 - i, 12).getTime(), // later ids are earlier days
    project: '/repos/a',
    sessionId: 's',
    pasteCount: 0,
  }));
  const opts = { chunkSize: 4 };
  const manifest = await writeChunks(outDir, prepareChunks(ps, opts), opts);
  const ids = await writeFindingsFixture(outDir, manifest);
  return { outDir, manifest, ids };
}

const flat = (index: number, over: Partial<FlatFinding> = {}): FlatFinding => ({
  index,
  chunk: 1,
  category: 'communication',
  rule: `rule ${index}`,
  frequency: 1,
  confidence: 'medium',
  trigger: null,
  evidence: [{ id: index * 10, ts: `2026-01-${String(index).padStart(2, '0')}T10:00`, quote: 'q' }],
  ...over,
});

// ------------------------------------------------------------------------------------------- loadFindings

test('loadFindings: flattens every chunk in order, numbers from 1, real dates from the chunks, skips missing', async () => {
  const { outDir, manifest, ids } = await fixture();
  try {
    const loaded = await loadFindings(outDir, manifest);
    assert.equal(loaded.chunksAnalyzed, 3);
    assert.equal(loaded.chunksTotal, 3);
    assert.deepEqual(
      loaded.findings.map((f) => [f.index, f.chunk, f.category, f.rule]),
      [
        [1, 1, 'communication', FIXTURE_RULES.A],
        [2, 1, 'planning', FIXTURE_RULES.P],
        [3, 2, 'communication', FIXTURE_RULES.B],
        [4, 2, 'testing', FIXTURE_RULES.T],
        [5, 2, 'communication', FIXTURE_RULES.C],
        [6, 3, 'communication', FIXTURE_RULES.D],
        [7, 3, 'communication', FIXTURE_RULES.E],
      ],
    );
    // The model wrote ts "x"; the chunk file knows the real minute.
    const rows = (await readFile(path.join(outDir, 'chunks', '001.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
    const first = loaded.findings[0]!.evidence.find((e) => e.id === ids[0]![0])!;
    assert.equal(first.ts, rows.find((r: { id: number }) => r.id === ids[0]![0]).ts);
    assert.match(loaded.findingsSha256, /^[0-9a-f]{64}$/);

    await unlink(path.join(outDir, 'findings', '002.json'));
    const fewer = await loadFindings(outDir, manifest);
    assert.equal(fewer.chunksAnalyzed, 2);
    assert.equal(fewer.chunksTotal, 3);
    assert.deepEqual(fewer.findings.map((f) => [f.index, f.chunk]), [[1, 1], [2, 1], [3, 3], [4, 3]]);
    assert.notEqual(fewer.findingsSha256, loaded.findingsSha256);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------------------------------- the prompt

test('buildMergePrompt: one category, a numbered line per finding, no quotes', () => {
  const findings = [
    flat(3, { rule: '先講結論', frequency: 4, confidence: 'high', trigger: '看到長報告 | 之後', chunk: 2 }),
    flat(9, { rule: 'line\nbreak' }),
  ];
  const p = buildMergePrompt('communication', findings);
  assert.match(p, /all in the category "communication" \(how answers should be written\)/);
  assert.match(p, /\n<findings>\n3 \| 2 \| 4 \| high \| 先講結論 \| 看到長報告 \/ 之後\n9 \| 1 \| 1 \| medium \| line break \| -\n<\/findings>\n$/);
  assert.match(p, /"members":\[3,17,42\]/);
  assert.match(p, /Put each index in at most one group/);
  assert.doesNotMatch(p, /This is part/); // the fake tells chunk prompts from merge prompts by it
  assert.doesNotMatch(p, /\bq\b|2026-01/); // evidence stays out
});

// ---------------------------------------------------------------------------------------------- validate

test('validateMerge: unknown and repeated indexes are dropped and counted; empty or shapeless groups dropped', () => {
  const raw = {
    rules: [
      { key: 'a', rule: 'A', confidence: 'high', members: [1, '2'] },
      { key: 'b', rule: 'B', confidence: 'sure', members: [99, 3] },
      { key: 'c', rule: 'C', confidence: 'low', members: [1, 4] },
      { key: 'd', rule: 'D', confidence: 'low', members: [2] },
      { key: 'e', rule: '', members: [5] },
      { key: 'f', rule: 'F', members: 'all' },
      'nonsense',
    ],
  };
  const { groups, dropped } = validateMerge(raw, new Set([1, 2, 3, 4, 5]));
  assert.deepEqual(
    groups.map((g) => [g.key, g.rule, g.confidence, g.members]),
    [
      ['a', 'A', 'high', [1, 2]],
      ['b', 'B', null, [3]],
      ['c', 'C', 'low', [4]],
    ],
  );
  assert.deepEqual(dropped, { unknown: 1, duplicate: 2, groups: 4 });
  assert.equal(validateMerge([{ rule: 'x', members: [1] }], new Set([1])).groups.length, 1);
  assert.throws(() => validateMerge({ findings: [] }, new Set()), /no "rules" list/);
});

// --------------------------------------------------------------------------------------------- combine

test('combine: frequency adds up, chunks counted, evidence joined, first trigger kept, leftovers stand alone', () => {
  const findings = [
    flat(1, { chunk: 1, frequency: 3, confidence: 'high', evidence: [
      { id: 1, ts: '2026-03-05T10:00', quote: 'a' }, { id: 2, ts: '2026-03-01T10:00', quote: 'b' },
      { id: 3, ts: '2026-03-09T10:00', quote: 'c' }, { id: 4, ts: null, quote: 'd' },
    ] }),
    flat(2, { chunk: 2, frequency: 2, trigger: 'after a long report', evidence: [
      { id: 2, ts: '2026-03-01T10:00', quote: 'b again' }, { id: 5, ts: '2026-02-01T10:00', quote: 'e' },
      { id: 6, ts: '2026-04-01T10:00', quote: 'f' },
    ] }),
    flat(3, { chunk: 2, frequency: 4, trigger: 'later trigger' }),
    flat(4, { rule: '不要客套話', confidence: 'low' }),
    flat(5, { rule: 'Keep answers short, always', confidence: 'high' }),
  ];
  const rules = combine(findings, [
    { key: 'Result First!', title: 'Result first', rule: 'Put the result first', confidence: null, members: [2, 1, 3] },
  ]);
  const [merged, alone4, alone5] = rules;
  assert.equal(merged!.key, 'result_first');
  assert.equal(merged!.frequency, 9);
  assert.equal(merged!.chunks, 2);
  assert.deepEqual(merged!.members, [1, 2, 3]);
  assert.equal(merged!.confidence, 'high'); // none given: the surest member's
  assert.equal(merged!.trigger, 'after a long report');
  assert.equal(merged!.evidence.length, MAX_EVIDENCE);
  // A member at a time (1, 2, 30, then 1's next…), one id once, then by date; id 4, undated, did not make it.
  assert.deepEqual(merged!.evidence.map((e) => e.id), [30, 5, 2, 1, 3]);
  assert.equal(merged!.evidence.filter((e) => e.id === 2).length, 1);
  assert.deepEqual([alone4!.key, alone4!.members, alone4!.confidence], ['rule_4', [4], 'low']);
  assert.equal(alone5!.key, 'keep_answers_short_always');
  assert.equal(alone5!.title, null);
});

test('joinEvidence: every member heard before any gives a second quote; at most five', () => {
  const m = (index: number, ids: number[]) => flat(index, { evidence: ids.map((id) => ({ id, ts: `2026-05-${10 + id}T00:00`, quote: '' })) });
  assert.deepEqual(joinEvidence([m(1, [1, 2, 3, 4, 5, 6]), m(2, [7]), m(3, [8])]).map((e) => e.id), [1, 2, 3, 7, 8]);
});

test('snakeKey and keyFromRule', () => {
  assert.equal(snakeKey('Plan Before Coding!'), 'plan_before_coding');
  assert.equal(snakeKey('one two three four five six'), 'one_two_three_four_five');
  assert.equal(snakeKey('結論先講'), null);
  assert.equal(keyFromRule('先 plan 再寫', 7), 'rule_7');
  assert.equal(keyFromRule('Test before wiring up the frontend', 7), 'test_before_wiring_up');
});

test('rankRules: chunks, then frequency, then confidence; repeated keys get _2, _3', () => {
  const findings = [
    flat(1, { chunk: 1, frequency: 9 }),
    flat(2, { chunk: 1, frequency: 2 }),
    flat(3, { chunk: 2, frequency: 1 }),
    flat(4, { chunk: 1, frequency: 2, confidence: 'high', category: 'testing' }),
  ];
  const rules = combine(findings, [
    { key: 'same', title: null, rule: 'x', confidence: 'low', members: [1] },
    { key: 'same', title: null, rule: 'y', confidence: 'low', members: [2, 3] },
  ]);
  const ranked = rankRules(rules);
  assert.deepEqual(ranked.map((r) => [r.key, r.chunks, r.frequency]), [
    ['same', 2, 3],
    ['same_2', 1, 9],
    ['rule_4', 1, 2],
  ]);
});

// -------------------------------------------------------------------------------------------- runMerge

test('runMerge: one call per category, validated, joined back, ranked, written to merged.json', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest, ids } = await fixture();
  const mergeLog = path.join(fake.dir, 'merge.jsonl');
  try {
    const env = { PATH: fake.dir, FAKE_CLAUDE_MERGE_LOG: mergeLog, CLAUDECODE: '1' };
    const plan = await planMerge({ outDir, manifest });
    assert.equal(plan.cached, null);
    assert.deepEqual(plan.calls.map((c) => [c.category, c.findings.map((f) => f.index)]), [
      ['communication', [1, 3, 5, 6, 7]],
      ['planning', [2]],
      ['testing', [4]],
    ]);
    assert.ok(plan.calls.every((c) => c.estimate > 0));
    const progress: string[] = [];
    const merged = await runMerge({
      claude: fake.claude, outDir, plan, concurrency: 2, model: 'opus', env, now: new Date('2026-09-27T01:00:00Z'),
      onProgress: (p) => progress.push(`${p.category}:${p.findings}→${p.rules}`),
    });
    assert.deepEqual(progress.sort(), ['communication:5→4', 'planning:1→1', 'testing:1→1']);

    const calls = await readMergeCalls(mergeLog);
    assert.deepEqual(calls.map((c) => c.category).sort(), ['communication', 'planning', 'testing']);
    const comm = calls.find((c) => c.category === 'communication')!;
    assert.deepEqual(comm.args.slice(0, 7), ['-p', '--setting-sources', '', '--output-format', 'json', '--system-prompt', SYSTEM_PROMPT]);
    assert.deepEqual(comm.args.slice(-2), ['--model', 'opus']);
    assert.match(comm.prompt, /\n1 \| 1 \| 5 \| high \| 結論先講，理由放後面。 \| -\n3 \| 2 \| 3 \| high \| 先講結論。 \| 看到長篇回報後\n/);
    for (const id of ids.flat()) assert.ok(!comm.prompt.includes(quoteOf(id)), 'no quote goes to the merge prompt');

    const onDisk = JSON.parse(await readFile(mergedFile(outDir), 'utf8')) as Merged;
    assert.deepEqual(onDisk, merged);
    assert.equal(merged.generatedAt, '2026-09-27T01:00:00.000Z');
    assert.equal(merged.findingsSha256, plan.findingsSha256);
    assert.deepEqual([merged.chunksAnalyzed, merged.chunksTotal, merged.findings], [3, 3, 7]);
    assert.equal(merged.usage.total, 3 * 1160);
    assert.equal(merged.costUsd, 0.0375);
    // communication: 999999 unknown, 1 repeated; planning and testing: 999999 unknown, own index repeated,
    // and two groups each left with no member.
    assert.deepEqual(merged.dropped, { unknown: 3, duplicate: 3, groups: 4 });
    assert.deepEqual(
      merged.rules.map((r) => [r.key, r.category, r.rule, r.confidence, r.frequency, r.chunks, r.members]),
      [
        ['result_first', 'communication', FIXTURE_RULES.A, 'high', 8, 2, [1, 3]],
        ['result_first_2', 'planning', FIXTURE_RULES.P, 'high', 4, 1, [2]],
        ['plan_before_coding', 'communication', FIXTURE_RULES.C, 'medium', 4, 1, [5]],
        ['duplicate_member', 'communication', FIXTURE_RULES.E, 'high', 3, 1, [7]],
        ['result_first_3', 'testing', FIXTURE_RULES.T, 'high', 2, 1, [4]],
        ['with_unknown', 'communication', FIXTURE_RULES.D, 'low', 2, 1, [6]],
      ],
    );
    const top = merged.rules[0]!;
    assert.equal(top.title, 'Title of 1');
    assert.equal(top.trigger, '看到長篇回報後');
    // 4 quotes from A and 5 from B (one of them A's first again): 8 ids, 5 kept, by real date.
    assert.equal(top.evidence.length, MAX_EVIDENCE);
    assert.equal(new Set(top.evidence.map((e) => e.id)).size, MAX_EVIDENCE);
    const dates = top.evidence.map((e) => e.ts!);
    assert.deepEqual(dates, [...dates].sort());
    assert.ok(dates.every((d) => /^2026-03-\d\dT12:00$/.test(d)));
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('planMerge: same findings reuse merged.json without calling; --force or a changed findings file merges again', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  const mergeLog = path.join(fake.dir, 'merge.jsonl');
  try {
    const env = { PATH: fake.dir, FAKE_CLAUDE_MERGE_LOG: mergeLog };
    const first = await runMerge({ claude: fake.claude, outDir, plan: await planMerge({ outDir, manifest }), env });
    assert.equal((await readMergeCalls(mergeLog)).length, 3);

    const again = await planMerge({ outDir, manifest });
    assert.deepEqual(again.cached, first);
    assert.deepEqual(again.calls, []);
    assert.deepEqual(await runMerge({ claude: fake.claude, outDir, plan: again, env }), first);
    assert.equal((await readMergeCalls(mergeLog)).length, 3);

    const forced = await planMerge({ outDir, manifest, force: true });
    assert.equal(forced.cached, null);
    await runMerge({ claude: fake.claude, outDir, plan: forced, env });
    assert.equal((await readMergeCalls(mergeLog)).length, 6);

    const f3 = path.join(outDir, 'findings', '003.json');
    const done = JSON.parse(await readFile(f3, 'utf8'));
    done.findings.pop();
    await writeFile(f3, JSON.stringify(done, null, 2) + '\n');
    const changed = await planMerge({ outDir, manifest });
    assert.equal(changed.cached, null);
    assert.equal(changed.findings.length, 6);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test('runMerge: a failing category or a reply that is not JSON writes no merged.json', { skip: posixOnly }, async () => {
  const fake = await makeFakeClaude();
  const { outDir, manifest } = await fixture();
  try {
    const plan = await planMerge({ outDir, manifest });
    await assert.rejects(
      runMerge({ claude: fake.claude, outDir, plan, env: { PATH: fake.dir, FAKE_CLAUDE_MERGE_FAIL_ON: 'planning' } }),
      /^Error: merge planning: Claude usage limit reached$/,
    );
    await assert.rejects(stat(mergedFile(outDir)));
    const raw = path.join(outDir, 'merge-communication.raw.txt');
    await assert.rejects(
      runMerge({ claude: fake.claude, outDir, plan, env: { PATH: fake.dir, FAKE_CLAUDE_MODE: 'garbage' } }),
      (err: Error) => err.message.startsWith('merge communication: the reply was not the JSON asked for') && err.message.includes(raw),
    );
    assert.equal(await readFile(raw, 'utf8'), 'Sorry, here are some thoughts.');
    await assert.rejects(stat(mergedFile(outDir)));
    // A fenced reply is fine.
    const merged = await runMerge({ claude: fake.claude, outDir, plan, env: { PATH: fake.dir, FAKE_CLAUDE_MODE: 'fenced' } });
    assert.equal(merged.rules.length, 6);
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});
