import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { Prompt } from './history.ts';

/**
 * Prompts shorter than this get Claude's previous message attached: they are replies ("不對", "why", "the second
 * one") that make no sense alone, while longer prompts carry their own instruction. Measured on the author's
 * history (2026-09-27): under 40 characters is 37% of the prompts kept for analysis and adds about 610,000 tokens
 * to a full run; under 80 would be 65% and 930,000.
 */
export const SHORT_PROMPT = 40;
/** Longest piece of Claude's previous message kept, in characters: enough to see what was asked or reported. */
export const BEFORE_MAX = 200;

/** One prompt a person typed, as the session transcript recorded it. */
export interface Turn {
  /** What was typed, trimmed, system reminders removed. */
  text: string;
  /** Milliseconds since epoch; NaN when the line had no readable timestamp. */
  ts: number;
  /** The last text Claude wrote before this prompt in the same session, '' when there was none. */
  before: string;
}

export interface Loaded {
  /** Typed prompts per session id, in file order. */
  sessions: Map<string, Turn[]>;
  /** Session files found under the folder. */
  files: number;
  /** Session files opened: those whose session id appears in the history. */
  opened: number;
  /** Typed prompts found in the opened files. */
  turns: number;
}

export interface LoadOptions {
  /** The projects folder Claude Code keeps next to history.jsonl. */
  dir: string;
  /** Only files named after one of these sessions are opened. */
  sessionIds: Iterable<string>;
  onProgress?: ((p: { opened: number; toOpen: number; file: string }) => void) | undefined;
}

/** Claude Code keeps one transcript per session in projects/<project>/<sessionId>.jsonl, next to history.jsonl. */
export function transcriptsDir(historyPath: string): string {
  return path.join(path.dirname(historyPath), 'projects');
}

/** Start of text Claude Code inserts on the person's behalf: interruptions, commands, reminders, summaries. */
const SKIP_PREFIX = [
  '[Request interrupted',
  'This session is being continued',
  '<command-name>',
  '<local-command',
  '<system-reminder',
  '<task-notification',
  'Caveat: The messages below',
  '<command-message>',
];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function textBlocks(content: unknown[]): string {
  return content
    .filter((b): b is Rec => isRec(b) && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n');
}

/**
 * The text of a user line when a person typed it, else null. Tool results, notifications, commands and
 * interruptions are Claude Code talking, not the person.
 */
export function typedText(rec: Rec): string | null {
  const message = isRec(rec.message) ? rec.message : {};
  const content = message.content;
  const origin = isRec(rec.origin) ? rec.origin.kind : undefined;
  const source = rec.promptSource;
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    if (content.some((b) => isRec(b) && b.type === 'tool_result')) return null;
    text = textBlocks(content);
  } else {
    return null;
  }
  text = text.trim();
  if (text === '' || SKIP_PREFIX.some((p) => text.startsWith(p))) return null;
  if (origin !== undefined && origin !== 'human' && source !== 'typed') return null;
  // Older transcripts carry neither field; there only a plain string counts as typed.
  if (origin === undefined && source === undefined && typeof content !== 'string') return null;
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
  return text === '' ? null : text;
}

/** Text Claude wrote on an assistant line; tool calls and thinking are left out. */
export function assistantText(rec: Rec): string {
  const message = isRec(rec.message) ? rec.message : {};
  return Array.isArray(message.content) ? textBlocks(message.content).trim() : '';
}

const fold = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Markdown dressing carries no meaning here and eats the character budget. */
const stripMarkdown = (s: string): string => s.replace(/[#*_`~>|]+/g, ' ').replace(/^\s*[-•]\s+/gm, ' ');

/**
 * The end of Claude's message, not the start: the question or conclusion the developer is answering is usually
 * the last thing said. Cut to max characters, with a leading … when something was dropped.
 */
export function tail(s: string, max: number): string {
  const cs = [...s];
  return cs.length > max ? '…' + cs.slice(cs.length - (max - 1)).join('') : s;
}

/** Typed prompts in one transcript, each with Claude's last text before it. Read line by line. */
async function readTranscript(file: string): Promise<Turn[]> {
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  const turns: Turn[] = [];
  let last = '';
  for await (const line of rl) {
    // Cheap test first: most lines are tool output, snapshots and metadata.
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) continue;
    let rec: unknown;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRec(rec) || rec.isSidechain === true) continue;
    if (rec.type === 'assistant') {
      const a = assistantText(rec);
      if (a !== '') last = a;
    } else if (rec.type === 'user') {
      const text = typedText(rec);
      if (text === null) continue;
      const ts = typeof rec.timestamp === 'string' ? Date.parse(rec.timestamp) : NaN;
      turns.push({ text, ts, before: tail(fold(stripMarkdown(last)), BEFORE_MAX) });
    }
  }
  return turns;
}

/**
 * Read the transcripts of the given sessions. Files of other sessions are counted but never opened, and
 * each file is streamed, so a folder of several gigabytes costs only what the history points at.
 * A missing or unreadable folder gives an empty result.
 */
export async function loadTranscripts({ dir, sessionIds, onProgress }: LoadOptions): Promise<Loaded> {
  const wanted = new Set(sessionIds);
  const loaded: Loaded = { sessions: new Map(), files: 0, opened: 0, turns: 0 };
  let projects: string[];
  try {
    projects = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return loaded;
  }
  const toOpen: { file: string; sessionId: string }[] = [];
  for (const project of projects.sort()) {
    let names: string[];
    try {
      names = await readdir(path.join(dir, project));
    } catch {
      continue;
    }
    for (const name of names.sort()) {
      if (!name.endsWith('.jsonl')) continue;
      loaded.files++;
      const sessionId = name.slice(0, -'.jsonl'.length);
      if (wanted.has(sessionId)) toOpen.push({ file: path.join(dir, project, name), sessionId });
    }
  }
  for (const { file, sessionId } of toOpen) {
    let turns: Turn[];
    try {
      turns = await readTranscript(file);
    } catch {
      continue;
    }
    loaded.opened++;
    loaded.turns += turns.length;
    const list = loaded.sessions.get(sessionId);
    if (list) list.push(...turns);
    else loaded.sessions.set(sessionId, turns);
    onProgress?.({ opened: loaded.opened, toOpen: toOpen.length, file });
  }
  return loaded;
}

/** Whether a prompt is short enough to need Claude's previous message to be understood. */
export function isShort(display: string): boolean {
  return [...fold(display)].length < SHORT_PROMPT;
}

/**
 * Find each prompt's turn: same session, same text once trimmed; the closest time decides between
 * repeats ("yes" typed twice in one session). Time alone is never enough.
 * The map holds every matched prompt id; its value is Claude's previous message for short prompts
 * that have one, undefined otherwise.
 */
export function attachTranscripts(prompts: Prompt[], loaded: Loaded): Map<number, string | undefined> {
  const out = new Map<number, string | undefined>();
  const index = new Map<string, Map<string, Turn[]>>();
  for (const [sessionId, turns] of loaded.sessions) {
    const byText = new Map<string, Turn[]>();
    for (const t of turns) {
      const list = byText.get(t.text);
      if (list) list.push(t);
      else byText.set(t.text, [t]);
    }
    index.set(sessionId, byText);
  }
  for (const p of prompts) {
    const same = index.get(p.sessionId)?.get(p.display.trim());
    if (!same) continue;
    const gap = (t: Turn): number => (Number.isNaN(t.ts) ? Infinity : Math.abs(t.ts - p.timestamp));
    let best = same[0]!;
    for (const t of same) if (gap(t) < gap(best)) best = t;
    out.set(p.id, isShort(p.display) && best.before !== '' ? best.before : undefined);
  }
  return out;
}
