import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Prompt } from './history.ts';
import { buildPrompt, dataLine, projectHeader } from './prompt-template.ts';
import { CALL_OVERHEAD_TOKENS, OUTPUT_PER_INPUT, estimateTokens } from './tokens.ts';
import { classify } from './repeated.ts';
import { localDate } from './stats.ts';

/** Default --chunk-size. The hand-made scan this replaces read 1,000–1,300 prompts per part. */
export const DEFAULT_CHUNK_SIZE = 1000;
/**
 * Longest prompt file per chunk, in characters. 1,000 prompts average about 150,000 characters on the
 * author's history once short replies are gone, so a chunk also closes when the next line would pass this.
 */
export const MAX_CHUNK_CHARS = 120_000;
/** Longest text kept per prompt, in characters; same cut as the hand-made scan. */
export const MAX_TEXT = 3000;

export interface ChunkRow {
  /** Line number in history.jsonl. */
  id: number;
  /** Local date and time to the minute, e.g. 2026-02-17T15:14. */
  ts: string;
  project: string;
  /** What was typed, cut to MAX_TEXT characters. Paste placeholders stay; pasted contents were never read. */
  text: string;
}

export interface ChunkOptions {
  chunkSize: number;
  /** Close a chunk before its prompt file passes this many characters (default MAX_CHUNK_CHARS). */
  maxChars?: number | undefined;
  /** Keep prompts whose project path contains this. */
  project?: string | undefined;
  /** Keep prompts on or after this local date, YYYY-MM-DD. */
  since?: string | undefined;
  /** Keep only the first n chunks. */
  sample?: number | undefined;
}

export interface Prepared {
  /** Instructions that passed the filters, before --sample. */
  candidates: number;
  /** Prompts that passed --project and --since but are not instructions. */
  dropped: { slash: number; short: number; empty: number };
  /** Chunks before --sample. */
  totalChunks: number;
  /** Chunks kept after --sample, each up to chunkSize rows and maxChars characters. */
  chunks: ChunkRow[][];
  /** Every chunk, before --sample. */
  all: ChunkRow[][];
}

export function tokenEstimate(promptTokens: number[]): TokenEstimate {
  const calls = promptTokens.length;
  const prompt = promptTokens.reduce((a, b) => a + b, 0);
  const overhead = calls * CALL_OVERHEAD_TOKENS;
  const output = Math.round(prompt * OUTPUT_PER_INPUT);
  return { calls, promptTokens: prompt, overheadTokens: overhead, outputTokens: output, totalTokens: prompt + overhead + output };
}

export interface ManifestChunk {
  index: number;
  file: string;
  promptFile: string;
  prompts: number;
  /** Characters in the prompt file (instructions plus data). */
  chars: number;
  /** Estimated tokens for the prompt file, see tokens.ts. */
  tokens: number;
  firstTs: string;
  lastTs: string;
  projects: number;
}

export interface TokenEstimate {
  calls: number;
  /** Tokens in the prompt files themselves. */
  promptTokens: number;
  /** The call's own overhead, times calls. */
  overheadTokens: number;
  /** The model's answers and thinking, OUTPUT_PER_INPUT of the prompt tokens. */
  outputTokens: number;
  totalTokens: number;
}

export interface Manifest {
  generatedAt: string;
  chunkSize: number;
  maxChars: number;
  filters: { project: string | null; since: string | null; sample: number | null };
  candidates: number;
  dropped: Prepared['dropped'];
  totalChunks: number;
  /** Chunks written by this run (all of them unless --sample). */
  chunks: ManifestChunk[];
  /** What this run's chunks would cost to analyze. */
  estimate: TokenEstimate;
  /** What all totalChunks would cost; same as estimate unless --sample. */
  estimateFull: TokenEstimate;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function localDateTime(ms: number): string {
  const d = new Date(ms);
  return `${localDate(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** YYYY-MM-DD that names a real calendar day. */
export function isDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const chars = (s: string): number => [...s].length;

function cut(s: string, max: number): string {
  const cs = [...s];
  return cs.length > max ? cs.slice(0, max).join('') : s;
}

/**
 * Filter, keep instructions only, sort by project then time, and cut into consecutive chunks of at most
 * chunkSize rows whose prompt file stays within maxChars.
 */
export function prepareChunks(prompts: Prompt[], opts: ChunkOptions): Prepared {
  const dropped = { slash: 0, short: 0, empty: 0 };
  const kept: Prompt[] = [];
  for (const p of prompts) {
    if (opts.project !== undefined && !p.project.includes(opts.project)) continue;
    if (opts.since !== undefined && localDate(p.timestamp) < opts.since) continue;
    const { kind } = classify(p);
    if (kind === 'instruction') kept.push(p);
    else dropped[kind]++;
  }
  kept.sort((a, b) => a.project.localeCompare(b.project) || a.timestamp - b.timestamp || a.id - b.id);
  const rows: ChunkRow[] = kept.map((p) => ({
    id: p.id,
    ts: localDateTime(p.timestamp),
    project: p.project === '' ? '(unknown)' : p.project,
    text: cut(p.display, MAX_TEXT),
  }));
  const maxChars = opts.maxChars ?? MAX_CHUNK_CHARS;
  // Instructions around the data, with room for the part numbers and message count to grow.
  const overhead = chars(buildPrompt({ index: 1, total: 1, rows: [] })) + 20;
  const all: ChunkRow[][] = [];
  let current: ChunkRow[] = [];
  let size = overhead;
  let project: string | undefined;
  for (const row of rows) {
    const lineCost = chars(dataLine(row)) + 1;
    const headerCost = chars(projectHeader(row.project)) + 1;
    let cost = lineCost + (row.project === project ? 0 : headerCost);
    if (current.length > 0 && (current.length >= opts.chunkSize || size + cost > maxChars)) {
      all.push(current);
      current = [];
      size = overhead;
      cost = lineCost + headerCost;
    }
    current.push(row);
    size += cost;
    project = row.project;
  }
  if (current.length > 0) all.push(current);
  return {
    candidates: rows.length,
    dropped,
    totalChunks: all.length,
    chunks: opts.sample === undefined ? all : all.slice(0, opts.sample),
    all,
  };
}

const num = (i: number): string => String(i).padStart(3, '0');

/**
 * Write chunks/NNN.jsonl, prompts/NNN.md and manifest.json under outDir. Old chunks/ and prompts/
 * are cleared first so a smaller run never leaves stale parts behind; nothing else in outDir is touched.
 */
export async function writeChunks(
  outDir: string,
  prepared: Prepared,
  opts: ChunkOptions,
  now: Date = new Date(),
): Promise<Manifest> {
  const chunkDir = path.join(outDir, 'chunks');
  const promptDir = path.join(outDir, 'prompts');
  for (const dir of [chunkDir, promptDir]) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }
  const entries: ManifestChunk[] = [];
  // Numbered against every chunk, so a --sample run writes the same prompt the full run would.
  const total = prepared.totalChunks;
  for (const [i, rows] of prepared.chunks.entries()) {
    const index = i + 1;
    const file = `chunks/${num(index)}.jsonl`;
    const promptFile = `prompts/${num(index)}.md`;
    const prompt = buildPrompt({ index, total, rows });
    await writeFile(path.join(outDir, file), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
    await writeFile(path.join(outDir, promptFile), prompt, 'utf8');
    const times = rows.map((r) => r.ts).sort();
    entries.push({
      index,
      file,
      promptFile,
      prompts: rows.length,
      chars: chars(prompt),
      tokens: estimateTokens(prompt),
      firstTs: times[0]!,
      lastTs: times[times.length - 1]!,
      projects: new Set(rows.map((r) => r.project)).size,
    });
  }
  const estimate = tokenEstimate(entries.map((e) => e.tokens));
  // Chunks cut away by --sample are costed without being written.
  const rest = prepared.all.slice(prepared.chunks.length).map((rows, j) =>
    estimateTokens(buildPrompt({ index: prepared.chunks.length + j + 1, total, rows })),
  );
  const estimateFull = tokenEstimate([...entries.map((e) => e.tokens), ...rest]);
  const manifest: Manifest = {
    generatedAt: now.toISOString(),
    chunkSize: opts.chunkSize,
    maxChars: opts.maxChars ?? MAX_CHUNK_CHARS,
    filters: { project: opts.project ?? null, since: opts.since ?? null, sample: opts.sample ?? null },
    candidates: prepared.candidates,
    dropped: prepared.dropped,
    totalChunks: prepared.totalChunks,
    chunks: entries,
    estimate,
    estimateFull,
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}
