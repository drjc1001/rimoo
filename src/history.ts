import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import path from 'node:path';

/** One prompt the user typed into Claude Code. Pasted contents are counted, never kept. */
export interface Prompt {
  /** 1-based line number in history.jsonl. Stable id so later findings can cite it. */
  id: number;
  display: string;
  /** Milliseconds since epoch. */
  timestamp: number;
  project: string;
  sessionId: string;
  pasteCount: number;
}

export interface ParseResult {
  /** Lines read from the file, blank lines included. */
  totalLines: number;
  prompts: Prompt[];
  /** Line numbers that could not be read as a prompt. */
  badLines: number[];
  /** Exact duplicates removed (same display and timestamp). */
  duplicates: number;
}

/**
 * The command name when the prompt is a slash command ("/compact", "/model opus"), else null.
 * A path typed as a prompt ("/data/repos/app") is not a command.
 */
export function slashCommand(display: string): string | null {
  const trimmed = display.trim();
  const m = /^\/[a-z0-9][\w:-]*/i.exec(trimmed);
  if (!m) return null;
  // "/data/repos/app" and "/notes.md" are paths; "/btw預期…" and "/btw," are commands typed without a space.
  const next = trimmed[m[0].length];
  if (next === '/' || next === '.') return null;
  return m[0].toLowerCase();
}

export interface LocateOptions {
  override?: string | undefined;
  env?: NodeJS.ProcessEnv;
  home?: string;
}

/**
 * Where Claude Code keeps history.jsonl:
 *   $CLAUDE_CONFIG_DIR/history.jsonl when that variable is set (Claude Code honours it),
 *   otherwise <home>/.claude/history.jsonl, where <home> is $HOME, then %USERPROFILE% (Windows).
 */
export function locateHistory(opts: LocateOptions = {}): string {
  if (opts.override) return path.resolve(opts.override);
  const env = opts.env ?? process.env;
  if (env.CLAUDE_CONFIG_DIR) return path.join(env.CLAUDE_CONFIG_DIR, 'history.jsonl');
  const home = opts.home ?? env.HOME ?? env.USERPROFILE ?? homedir();
  return path.join(home, '.claude', 'history.jsonl');
}

/**
 * Read one line as a prompt. Lenient on purpose: older Claude Code versions wrote fewer fields,
 * so only `display` and `timestamp` are required. Returns null for anything unreadable.
 */
export function parseLine(line: string, id: number): Prompt | null {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  const rec = obj as Record<string, unknown>;
  if (typeof rec.display !== 'string') return null;
  if (typeof rec.timestamp !== 'number' || !Number.isFinite(rec.timestamp)) return null;
  const project = typeof rec.project === 'string' ? rec.project : '';
  const sessionId = typeof rec.sessionId === 'string' ? rec.sessionId : '';
  const pasted = rec.pastedContents;
  const pasteCount =
    typeof pasted === 'object' && pasted !== null && !Array.isArray(pasted) ? Object.keys(pasted).length : 0;
  return { id, display: rec.display, timestamp: rec.timestamp, project, sessionId, pasteCount };
}

/** Stream history.jsonl line by line. Unreadable lines are counted, never silently dropped. */
export async function parseHistory(filePath: string): Promise<ParseResult> {
  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  const prompts: Prompt[] = [];
  const badLines: number[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (line.trim() === '') continue;
    const prompt = parseLine(line, lineNo);
    if (!prompt) {
      badLines.push(lineNo);
      continue;
    }
    const key = `${prompt.timestamp}\u0000${prompt.display}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    prompts.push(prompt);
  }
  return { totalLines: lineNo, prompts, badLines, duplicates };
}
