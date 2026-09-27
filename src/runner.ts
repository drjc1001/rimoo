import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, constants, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest, ManifestChunk } from './chunks.ts';

/** The seven categories the prompt asks for (prompt-template.ts). */
export const CATEGORIES = [
  'communication',
  'planning',
  'implementation',
  'testing',
  'debugging',
  'architecture',
  'ai_collaboration',
] as const;
export type Category = (typeof CATEGORIES)[number];
export const CONFIDENCE = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE)[number];

/** Longest quote kept, in characters. */
export const MAX_QUOTE = 300;
/** 079's hand-made scan ran 4 subagents at once without being rate limited. */
export const MAX_CONCURRENCY = 4;

/**
 * Above either of these, `rimoo analyze` suggests narrowing the run or splitting it over several sittings.
 * The author's full year of history is 24 chunks and about 1.26M tokens; these are about 1.6 times that.
 * To revisit once a real run has shown how much of a 5-hour plan window a chunk uses.
 */
export const LARGE_HISTORY_TOKENS = 2_000_000;
export const LARGE_HISTORY_CHUNKS = 40;

/** Replaces Claude Code's own system prompt, so a call carries a few hundred tokens instead of 24,000. */
export const SYSTEM_PROMPT =
  "You are reading one developer's own messages to find their working habits. Reply with JSON only, exactly in the shape the message asks for.";

export interface Evidence {
  id: number;
  ts: string | null;
  quote: string;
}

export interface Finding {
  category: Category;
  rule: string;
  frequency: number;
  confidence: Confidence;
  evidence: Evidence[];
  trigger: string | null;
}

export interface Dropped {
  /** Findings removed whole: a field out of shape, or none of their evidence left. */
  findings: number;
  /** Evidence removed for an unknown id or no quote, counted also when its finding was then dropped. */
  evidence: number;
}

export interface Usage {
  input: number;
  cacheCreation: number;
  cacheRead: number;
  output: number;
  /** Part of output spent thinking, when the model reports it. */
  thinking: number;
  /** input + cacheCreation + cacheRead + output. */
  total: number;
}

/** findings/NNN.json */
export interface ChunkFindings {
  chunk: number;
  /** Fingerprint of prompts/NNN.md, so a finished chunk is only reused while its prompt is unchanged. */
  promptSha256: string;
  model: string | null;
  usage: Usage;
  costUsd: number;
  durationMs: number;
  findings: Finding[];
  dropped: Dropped;
}

/** findings/usage.json */
export interface UsageSummary {
  chunksRun: number;
  chunksSkipped: number;
  /** Chunks that failed this run (the run stops at the first); they are not in the totals and run again next time. */
  chunksFailed: number[];
  /** Every finished chunk in the manifest, this run's and earlier ones'. */
  tokens: Usage;
  costUsd: number;
  durationMs: number;
  findings: number;
  dropped: Dropped;
}

const num = (i: number): string => String(i).padStart(3, '0');
export const findingsFile = (outDir: string, index: number): string =>
  path.join(outDir, 'findings', `${num(index)}.json`);

// ---------------------------------------------------------------------------------------------- findClaude

/**
 * The `claude` executable on PATH, or null. On Windows it also looks for claude.cmd and claude.exe
 * (npm installs a .cmd shim there) and reads PATH whatever its case.
 */
export async function findClaude(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  const win = platform === 'win32';
  const key = win ? Object.keys(env).find((k) => k.toUpperCase() === 'PATH') : 'PATH';
  const dirs = (key === undefined ? '' : (env[key] ?? '')).split(win ? ';' : ':').filter(Boolean);
  const names = win ? ['claude.exe', 'claude.cmd', 'claude'] : ['claude'];
  for (const dir of dirs) {
    for (const name of names) {
      const file = path.join(dir.replace(/^"(.*)"$/, '$1'), name);
      try {
        if (!(await stat(file)).isFile()) continue;
        if (!win) await access(file, constants.X_OK);
        return file;
      } catch {
        // not here
      }
    }
  }
  return null;
}

// ----------------------------------------------------------------------------------------- validateFindings

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function cut(s: string, max: number): string {
  const cs = [...s];
  return cs.length > max ? cs.slice(0, max).join('') : s;
}

/** An evidence id as the model wrote it: 123 or "123". */
function toId(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v);
  return null;
}

/**
 * Keep the findings that are in shape and only the evidence whose id is really in the chunk.
 * raw is the parsed reply: {"findings":[...]} (a bare array is accepted too).
 */
export function validateFindings(
  raw: unknown,
  validIds: Set<number>,
): { findings: Finding[]; dropped: Dropped } {
  const list = Array.isArray(raw) ? raw : isObject(raw) && Array.isArray(raw.findings) ? raw.findings : null;
  if (list === null) throw new Error('reply has no "findings" list');
  const findings: Finding[] = [];
  const dropped: Dropped = { findings: 0, evidence: 0 };
  for (const f of list) {
    if (
      !isObject(f) ||
      !(CATEGORIES as readonly unknown[]).includes(f.category) ||
      typeof f.rule !== 'string' ||
      f.rule.trim() === '' ||
      typeof f.frequency !== 'number' ||
      !Number.isFinite(f.frequency) ||
      !(CONFIDENCE as readonly unknown[]).includes(f.confidence) ||
      !Array.isArray(f.evidence)
    ) {
      dropped.findings++;
      continue;
    }
    const evidence: Evidence[] = [];
    for (const e of f.evidence) {
      const id = isObject(e) ? toId(e.id) : null;
      if (!isObject(e) || id === null || !validIds.has(id) || typeof e.quote !== 'string') {
        dropped.evidence++;
        continue;
      }
      evidence.push({ id, ts: typeof e.ts === 'string' ? e.ts : null, quote: cut(e.quote, MAX_QUOTE) });
    }
    if (evidence.length === 0) {
      dropped.findings++;
      continue;
    }
    findings.push({
      category: f.category as Category,
      rule: f.rule.trim(),
      frequency: f.frequency,
      confidence: f.confidence as Confidence,
      evidence,
      trigger: typeof f.trigger === 'string' && f.trigger.trim() !== '' ? f.trigger.trim() : null,
    });
  }
  return { findings, dropped };
}

/** Parse the model's reply: as is, then with a ```json fence around it stripped. Throws when neither parses. */
export function parseReply(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const m = /```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```/.exec(text);
    if (!m) throw new Error('not JSON');
    return JSON.parse(m[1]!);
  }
}

// ------------------------------------------------------------------------------------------------ runChunk

export interface RunChunkOptions {
  claude: string;
  outDir: string;
  chunk: ManifestChunk;
  model?: string | undefined;
  env?: NodeJS.ProcessEnv;
}

interface Spawned {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[], input: string, env: NodeJS.ProcessEnv, cwd: string): Promise<Spawned> {
  return new Promise((resolve, reject) => {
    // npm puts a .cmd shim on Windows, which only runs through the shell; quote for cmd.exe so the empty
    // --tools value and the system prompt's spaces survive. (Not yet tried on a real Windows machine.)
    const shell = /\.cmd$/i.test(cmd);
    const q = (a: string): string => `"${a.replace(/"/g, '""')}"`;
    const child = shell
      ? spawn(q(cmd), args.map(q), { env, cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: true })
      : spawn(cmd, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    child.stdin.on('error', () => {}); // exited before reading everything; the exit code tells the story
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }),
    );
    child.stdin.end(input, 'utf8');
  });
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  // Write then rename, so Ctrl-C never leaves a half-written file that a resumed run would trust.
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(tmp, file);
}

export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

async function chunkIds(outDir: string, chunk: ManifestChunk): Promise<Set<number>> {
  const ids = new Set<number>();
  for (const line of (await readFile(path.join(outDir, chunk.file), 'utf8')).split('\n')) {
    if (line.trim() === '') continue;
    ids.add((JSON.parse(line) as { id: number }).id);
  }
  return ids;
}

export interface CallClaudeOptions {
  claude: string;
  /** Where mcp-none.json is written. */
  outDir: string;
  /** Sent on stdin. */
  prompt: string;
  model?: string | undefined;
  env?: NodeJS.ProcessEnv;
  /** Heads every error message, e.g. "chunk 3" (default "claude"). */
  label?: string | undefined;
}

export interface ClaudeReply {
  /** The model's answer, as it wrote it. */
  text: string;
  usage: Usage;
  costUsd: number;
  durationMs: number;
  /** The model that answered, as Claude Code reports it; the --model asked for, or null, when it does not. */
  model: string | null;
}

/**
 * One `claude -p` call with Rimoo's own system prompt, no tools and no MCP servers.
 * Throws with what claude said when it exits without a successful JSON result.
 */
export async function callClaude(opts: CallClaudeOptions): Promise<ClaudeReply> {
  const { claude, outDir, prompt } = opts;
  const label = opts.label ?? 'claude';
  await mkdir(outDir, { recursive: true });
  // No MCP servers: an empty config plus --strict-mcp-config ignores the user's own.
  const mcpConfig = path.join(outDir, 'mcp-none.json');
  await writeFile(mcpConfig, '{"mcpServers":{}}\n', 'utf8');
  const args = [
    '-p',
    // No user or project CLAUDE.md: the user's own rules must not steer the search for them (T-011).
    '--setting-sources',
    '',
    '--output-format',
    'json',
    '--system-prompt',
    SYSTEM_PROMPT,
    '--tools',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    mcpConfig,
    '--no-session-persistence',
  ];
  if (opts.model !== undefined) args.push('--model', opts.model);
  const env = { ...(opts.env ?? process.env) };
  delete env.CLAUDECODE; // started from inside Claude Code, the child would otherwise see itself as nested
  const started = Date.now();
  // An empty working directory, so no project CLAUDE.md or settings of the caller's own folder come along.
  const cwd = path.join(outDir, 'claude-cwd');
  await mkdir(cwd, { recursive: true });
  const res = await run(claude, args, prompt, env, cwd);

  let reply: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(res.stdout);
    if (!isObject(parsed)) throw new Error('not an object');
    reply = parsed;
  } catch {
    const said = (res.stderr.trim() || res.stdout.trim()).slice(0, 500);
    throw new Error(`${label}: claude exited with code ${res.code} without a JSON result${said ? `: ${said}` : ''}`);
  }
  if (reply.subtype !== 'success' || reply.is_error === true) {
    const why =
      typeof reply.result === 'string' && reply.result.trim() !== ''
        ? reply.result.trim()
        : Array.isArray(reply.errors) && reply.errors.length > 0
          ? reply.errors.map(String).join('; ')
          : `claude reported ${String(reply.subtype ?? 'an error')}`;
    throw new Error(`${label}: ${why.slice(0, 500)}`);
  }
  if (res.code !== 0) {
    const said = res.stderr.trim().slice(0, 500);
    throw new Error(`${label}: claude exited with code ${res.code}${said ? `: ${said}` : ''}`);
  }
  const u = isObject(reply.usage) ? reply.usage : {};
  const usage: Usage = {
    input: count(u.input_tokens),
    cacheCreation: count(u.cache_creation_input_tokens),
    cacheRead: count(u.cache_read_input_tokens),
    output: count(u.output_tokens),
    thinking: isObject(u.output_tokens_details) ? count(u.output_tokens_details.thinking_tokens) : 0,
    total: 0,
  };
  usage.total = usage.input + usage.cacheCreation + usage.cacheRead + usage.output;
  const models = isObject(reply.modelUsage) ? Object.keys(reply.modelUsage) : [];
  return {
    text: typeof reply.result === 'string' ? reply.result : '',
    usage,
    costUsd: count(reply.total_cost_usd),
    durationMs: typeof reply.duration_ms === 'number' ? reply.duration_ms : Date.now() - started,
    model: models.length > 0 ? models.join(', ') : (opts.model ?? null),
  };
}

/** Analyze one chunk with `claude -p` and write findings/NNN.json. */
export async function runChunk(opts: RunChunkOptions): Promise<ChunkFindings> {
  const { outDir, chunk } = opts;
  const findingsDir = path.join(outDir, 'findings');
  await mkdir(findingsDir, { recursive: true });
  const prompt = await readFile(path.join(outDir, chunk.promptFile), 'utf8');
  const ids = await chunkIds(outDir, chunk);
  const label = `chunk ${chunk.index}`;
  const reply = await callClaude({ claude: opts.claude, outDir, prompt, model: opts.model, env: opts.env, label });
  let validated: { findings: Finding[]; dropped: Dropped };
  try {
    validated = validateFindings(parseReply(reply.text), ids);
  } catch {
    const rawFile = path.join(findingsDir, `${num(chunk.index)}.raw.txt`);
    await writeFile(rawFile, reply.text, 'utf8');
    throw new Error(`${label}: the reply was not the JSON asked for; it is saved in ${rawFile}`);
  }
  const result: ChunkFindings = {
    chunk: chunk.index,
    promptSha256: sha256(prompt),
    model: reply.model,
    usage: reply.usage,
    costUsd: reply.costUsd,
    durationMs: reply.durationMs,
    findings: validated.findings,
    dropped: validated.dropped,
  };
  await writeJson(findingsFile(outDir, chunk.index), result);
  return result;
}

// -------------------------------------------------------------------------------------------------- runAll

/** A finished findings/NNN.json for this chunk whose prompt has not changed since, or null. */
export async function finishedChunk(outDir: string, chunk: ManifestChunk): Promise<ChunkFindings | null> {
  try {
    const done = JSON.parse(await readFile(findingsFile(outDir, chunk.index), 'utf8')) as ChunkFindings;
    const prompt = await readFile(path.join(outDir, chunk.promptFile), 'utf8');
    return done.promptSha256 === sha256(prompt) ? done : null;
  } catch {
    return null;
  }
}

export type Progress =
  | { kind: 'done'; chunk: ManifestChunk; total: number; result: ChunkFindings }
  | { kind: 'skipped'; chunk: ManifestChunk; total: number }
  | { kind: 'failed'; chunk: ManifestChunk; total: number; error: Error };

export interface RunAllOptions {
  claude: string;
  outDir: string;
  manifest: Manifest;
  /** Chunks at once, 1 to MAX_CONCURRENCY (default 1). */
  concurrency?: number | undefined;
  /** Run chunks that already have findings again. */
  force?: boolean | undefined;
  model?: string | undefined;
  env?: NodeJS.ProcessEnv;
  onProgress?: (p: Progress) => void;
}

export const zeroUsage = (): Usage => ({ input: 0, cacheCreation: 0, cacheRead: 0, output: 0, thinking: 0, total: 0 });

/**
 * Run every manifest chunk in order, skipping finished ones unless force, then write findings/usage.json.
 * The first chunk that fails stops the run: chunks already running finish, no new one starts.
 * Finished chunks stay on disk, so the same command picks up where this one stopped.
 */
export async function runAll(opts: RunAllOptions): Promise<UsageSummary> {
  const { outDir, manifest } = opts;
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, opts.concurrency ?? 1));
  const total = manifest.totalChunks;
  const results = new Map<number, ChunkFindings>();
  const todo: ManifestChunk[] = [];
  let skipped = 0;
  for (const chunk of manifest.chunks) {
    const done = opts.force ? null : await finishedChunk(outDir, chunk);
    if (done) {
      results.set(chunk.index, done);
      skipped++;
      opts.onProgress?.({ kind: 'skipped', chunk, total });
    } else {
      todo.push(chunk);
    }
  }
  const failed: number[] = [];
  let next = 0;
  let stop = false;
  const worker = async (): Promise<void> => {
    while (!stop && next < todo.length) {
      const chunk = todo[next++]!;
      try {
        const result = await runChunk({ claude: opts.claude, outDir, chunk, model: opts.model, env: opts.env });
        results.set(chunk.index, result);
        opts.onProgress?.({ kind: 'done', chunk, total, result });
      } catch (err) {
        // Stop at the first failure: hitting the plan's usage limit fails every call after it too.
        stop = true;
        failed.push(chunk.index);
        opts.onProgress?.({ kind: 'failed', chunk, total, error: err instanceof Error ? err : new Error(String(err)) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(todo.length, 1)) }, worker));

  const summary: UsageSummary = {
    chunksRun: results.size - skipped,
    chunksSkipped: skipped,
    chunksFailed: failed.sort((a, b) => a - b),
    tokens: zeroUsage(),
    costUsd: 0,
    durationMs: 0,
    findings: 0,
    dropped: { findings: 0, evidence: 0 },
  };
  for (const r of results.values()) {
    for (const k of ['input', 'cacheCreation', 'cacheRead', 'output', 'thinking', 'total'] as const) summary.tokens[k] += r.usage[k] ?? 0;
    summary.costUsd += r.costUsd;
    summary.durationMs += r.durationMs;
    summary.findings += r.findings.length;
    summary.dropped.findings += r.dropped.findings;
    summary.dropped.evidence += r.dropped.evidence;
  }
  summary.costUsd = Math.round(summary.costUsd * 1e6) / 1e6;
  await mkdir(path.join(outDir, 'findings'), { recursive: true });
  await writeJson(path.join(outDir, 'findings', 'usage.json'), summary);
  return summary;
}
