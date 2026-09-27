import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Prompt } from './history.ts';
import {
  BEFORE_MAX,
  SHORT_PROMPT,
  attachTranscripts,
  isShort,
  loadTranscripts,
  transcriptsDir,
  typedText,
} from './transcripts.ts';
import { runAnalyze } from './analyze.ts';
import type { Manifest } from './chunks.ts';

const T0 = Date.UTC(2026, 8, 1, 3, 0);
const iso = (ms: number): string => new Date(ms).toISOString();

const user = (content: unknown, ts: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'user', message: { role: 'user', content }, timestamp: iso(ts), ...extra });
const assistant = (content: unknown[], ts: number) =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content }, timestamp: iso(ts) });

const LONG_REPLY = 'Done. ' + '測試全部通過，'.repeat(60) + '\nWant me to open the PR?';
const SHORT = 'why is the test still red?';
const LONG = 'please rewrite the importer so that it streams the file line by line instead of reading it all at once, and add a test';

/** One session the history knows (s-known) with noise around two typed prompts, one it does not (s-other). */
async function fixture(dir: string): Promise<{ projects: string; history: string }> {
  const projects = path.join(dir, 'projects');
  await mkdir(path.join(projects, '-repos-a'), { recursive: true });
  await mkdir(path.join(projects, '-repos-b'), { recursive: true });
  const known = [
    JSON.stringify({ type: 'mode', mode: 'normal', sessionId: 's-known' }),
    user(LONG, T0, { origin: { kind: 'human' } }),
    assistant([{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }], T0 + 1000),
    user([{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }], T0 + 2000),
    assistant([{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: LONG_REPLY }], T0 + 3000),
    user('<system-reminder>The task tools have not been used recently.</system-reminder>', T0 + 4000),
    user('[Request interrupted by user]', T0 + 4500, { origin: { kind: 'human' } }),
    user([{ type: 'text', text: 'a scheduled task finished' }], T0 + 4700, { origin: { kind: 'task-notification' } }),
    'not json at all',
    user(`${SHORT}\n<system-reminder>ignore me</system-reminder>`, T0 + 5000, { promptSource: 'typed' }),
  ];
  await writeFile(path.join(projects, '-repos-a', 's-known.jsonl'), known.join('\n') + '\n');
  await writeFile(
    path.join(projects, '-repos-b', 's-other.jsonl'),
    [assistant([{ type: 'text', text: 'other' }], T0), user('something else typed', T0 + 1, { origin: { kind: 'human' } })].join('\n') + '\n',
  );
  await writeFile(path.join(projects, '-repos-b', 'notes.txt'), 'not a session\n');
  const history = path.join(dir, 'history.jsonl');
  const rec = (display: string, timestamp: number, sessionId: string) =>
    JSON.stringify({ display, pastedContents: {}, timestamp, project: '/repos/a', sessionId });
  await writeFile(
    history,
    [
      rec(LONG, T0, 's-known'),
      rec(`  ${SHORT}  `, T0 + 5100, 's-known'),
      rec('typed where no transcript survived', T0 + 9000, 's-gone'),
    ].join('\n') + '\n',
  );
  return { projects, history };
}

const prompt = (id: number, display: string, timestamp: number, sessionId: string): Prompt => ({
  id,
  display,
  timestamp,
  project: '/repos/a',
  sessionId,
  pasteCount: 0,
});

test('typedText: keeps what a person typed, drops what Claude Code inserted', () => {
  const rec = (s: string) => JSON.parse(s) as Record<string, unknown>;
  assert.equal(typedText(rec(user('hello there', T0))), 'hello there');
  assert.equal(typedText(rec(user([{ type: 'text', text: 'hi' }], T0, { origin: { kind: 'human' } }))), 'hi');
  assert.equal(typedText(rec(user([{ type: 'text', text: 'hi' }], T0))), null, 'blocks without origin are not typed');
  assert.equal(typedText(rec(user([{ type: 'tool_result', content: 'x' }], T0, { origin: { kind: 'human' } }))), null);
  assert.equal(typedText(rec(user('queued note', T0, { origin: { kind: 'task-notification' } }))), null);
  assert.equal(typedText(rec(user('queued note', T0, { origin: { kind: 'peer' }, promptSource: 'typed' }))), 'queued note');
  assert.equal(typedText(rec(user('<command-name>/compact</command-name>', T0))), null);
  assert.equal(typedText(rec(user('<system-reminder>x</system-reminder>', T0))), null);
  assert.equal(typedText(rec(user('fix it <system-reminder>x</system-reminder>', T0))), 'fix it');
});

test('loadTranscripts: opens only sessions in the history, streams them, pairs each prompt with Claude’s last text', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const { projects, history } = await fixture(dir);
    assert.equal(transcriptsDir(history), projects);
    const opened: string[] = [];
    const loaded = await loadTranscripts({
      dir: projects,
      sessionIds: ['s-known', 's-gone'],
      onProgress: (p) => opened.push(path.basename(p.file)),
    });
    assert.equal(loaded.files, 2, 'notes.txt is not a session file');
    assert.equal(loaded.opened, 1);
    assert.deepEqual(opened, ['s-known.jsonl'], 's-other is not in the history, so it is never opened');
    assert.equal(loaded.turns, 2);
    const turns = loaded.sessions.get('s-known')!;
    assert.deepEqual(
      turns.map((t) => t.text),
      [LONG, SHORT],
    );
    assert.equal(turns[0]!.before, '');
    assert.equal(turns[1]!.ts, T0 + 5000);
    const before = turns[1]!.before;
    assert.equal([...before].length, BEFORE_MAX);
    assert.ok(before.startsWith('…') && before.endsWith('Want me to open the PR?'), before);
    assert.doesNotMatch(before, /\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadTranscripts: a missing folder is an empty result, not an error', async () => {
  const loaded = await loadTranscripts({ dir: path.join(tmpdir(), 'rimoo-no-such-folder'), sessionIds: ['x'] });
  assert.deepEqual({ files: loaded.files, opened: loaded.opened, turns: loaded.turns }, { files: 0, opened: 0, turns: 0 });
});

test('attachTranscripts: same session and same text; short prompts get Claude’s last text, long ones do not', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const { projects } = await fixture(dir);
    const loaded = await loadTranscripts({ dir: projects, sessionIds: ['s-known'] });
    const ps = [
      prompt(1, LONG, T0, 's-known'),
      prompt(2, `  ${SHORT}  `, T0 + 5100, 's-known'),
      prompt(3, SHORT, T0 + 5100, 's-other'),
      prompt(4, 'why is the test still red', T0 + 5000, 's-known'),
    ];
    const m = attachTranscripts(ps, loaded);
    assert.deepEqual([...m.keys()], [1, 2], 'a different session or different words never match, whatever the time');
    assert.equal(m.get(1), undefined, 'long prompt: matched, but stands on its own');
    assert.equal(m.get(2), loaded.sessions.get('s-known')![1]!.before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('attachTranscripts: a prompt typed twice in one session takes the turn closest in time', () => {
  const loaded = {
    sessions: new Map([
      [
        's',
        [
          { text: 'yes, go on with that', ts: T0, before: 'first question' },
          { text: 'yes, go on with that', ts: T0 + 3_600_000, before: 'second question' },
        ],
      ],
    ]),
    files: 1,
    opened: 1,
    turns: 2,
  };
  const m = attachTranscripts(
    [prompt(1, 'yes, go on with that', T0 + 100, 's'), prompt(2, 'yes, go on with that', T0 + 3_600_100, 's')],
    loaded,
  );
  assert.equal(m.get(1), 'first question');
  assert.equal(m.get(2), 'second question');
});

test('isShort: under SHORT_PROMPT characters once whitespace is folded', () => {
  assert.ok(isShort('x'.repeat(SHORT_PROMPT - 1)));
  assert.ok(!isShort('x'.repeat(SHORT_PROMPT)));
  assert.ok(isShort(`  ${'測'.repeat(SHORT_PROMPT - 1)}\n\n`));
});

const capture = () => {
  const out: string[] = [];
  return { out, stdout: (t: string) => out.push(t), stderr: (t: string) => out.push(t) };
};

test('runAnalyze --with-transcripts: short prompt carries ⟵ Claude just said, manifest and terminal report the match', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const { history } = await fixture(dir);
    const c = capture();
    const code = await runAnalyze({ historyPath: history, cwd: dir, withTranscripts: true, prepareOnly: true, ...c });
    assert.equal(code, 0);
    const out = c.out.join('');
    assert.match(out, /Prepared for analysis\n.*\n {2}Transcripts: matched 2 of 3 prompts \(67%\) from 1 session file\n/);
    const manifest = JSON.parse(await readFile(path.join(dir, 'rimoo-out', 'manifest.json'), 'utf8')) as Manifest;
    assert.deepEqual(manifest.transcripts, { enabled: true, files: 2, opened: 1, candidates: 3, matched: 2, attached: 1 });
    const text = await readFile(path.join(dir, 'rimoo-out', 'prompts', '001.md'), 'utf8');
    assert.match(text, /A line may end with ⟵ Claude just said: …, the assistant's previous message, cut short;/);
    const lines = text.split('\n').filter((l) => / \| 2026-/.test(l));
    assert.equal(lines.length, 3);
    assert.match(lines[1]!, new RegExp(`^2 \\| \\S+ \\| +${SHORT.replace('?', '\\?')} + ⟵ Claude just said: …測試全部通過，`));
    assert.ok(lines[1]!.endsWith('Want me to open the PR?'), lines[1]);
    assert.doesNotMatch(lines[0]!, /⟵/);
    assert.doesNotMatch(lines[2]!, /⟵/);
    const row = JSON.parse((await readFile(path.join(dir, 'rimoo-out', 'chunks', '001.jsonl'), 'utf8')).split('\n')[1]!);
    assert.equal([...row.before].length, BEFORE_MAX);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runAnalyze: without the flag the prompts are exactly what they were, and nothing is said about transcripts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const { history } = await fixture(dir);
    const c = capture();
    await runAnalyze({ historyPath: history, cwd: dir, prepareOnly: true, ...c });
    const out = c.out.join('');
    assert.doesNotMatch(out, /Transcripts/);
    const manifest = JSON.parse(await readFile(path.join(dir, 'rimoo-out', 'manifest.json'), 'utf8')) as Manifest;
    assert.equal(manifest.transcripts, null);
    const text = await readFile(path.join(dir, 'rimoo-out', 'prompts', '001.md'), 'utf8');
    assert.doesNotMatch(text, /⟵/);
    assert.match(text, /id \| time \| text\n\n<messages>\n/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('runAnalyze --with-transcripts: no projects folder is one line on the terminal, and the run goes on', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'rimoo-'));
  try {
    const { history, projects } = await fixture(dir);
    await rm(projects, { recursive: true, force: true });
    const c = capture();
    const code = await runAnalyze({ historyPath: history, cwd: dir, withTranscripts: true, prepareOnly: true, ...c });
    assert.equal(code, 0);
    assert.match(c.out.join(''), /\n {2}Transcripts: no session files for this history in projects; going on without them\n/);
    const text = await readFile(path.join(dir, 'rimoo-out', 'prompts', '001.md'), 'utf8');
    assert.doesNotMatch(text, /⟵/, 'nothing matched, so the prompt is the one written without the flag');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
