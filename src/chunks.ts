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
  /** Claude's previous message, cut to BEFORE_MAX characters; only on short prompts, only with --with-transcripts. */
  before?: string;
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
  /** From attachTranscripts: matched prompt ids, with Claude's previous message for the short ones. */
  transcripts?: Map<number, string | undefined> | undefined;
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
  /** Candidates found in a transcript, and how many of them carry Claude's previous message; null without transcripts. */
  transcripts: { matched: number; attached: number } | null;
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
  /** --with-transcripts: session files found and opened, candidates found in them, and how many carry Claude's previous message. Null without the flag. */
  transcripts: TranscriptsSummary | null;
}

export interface TranscriptsSummary {
  enabled: true;
  files: number;
  opened: number;
  candidates: number;
  matched: number;
  attached: number;
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

/** Rows of one chunk as the prompt shows them: by project, then time, so each project gets one header. */
function groupByProject(rows: ChunkRow[]): ChunkRow[] {
  return [...rows].sort((a, b) => a.project.localeCompare(b.project) || a.ts.localeCompare(b.ts) || a.id - b.id);
}

/**
 * Filter, keep instructions only, and cut into consecutive chunks of at most chunkSize rows whose prompt file
 * stays within maxChars. Chunk membership follows time: history only ever grows at the end, so new prompts
 * change the last chunk and leave every earlier chunk, and its finished findings, exactly as they were.
 * Inside a chunk the rows are grouped by project for the prompt.
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
  kept.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  let matched = 0;
  let attached = 0;
  const rows: ChunkRow[] = kept.map((p) => {
    const row: ChunkRow = {
      id: p.id,
      ts: localDateTime(p.timestamp),
      project: p.project === '' ? '(unknown)' : p.project,
      text: cut(p.display, MAX_TEXT),
    };
    if (opts.transcripts?.has(p.id)) {
      matched++;
      const before = opts.transcripts.get(p.id);
      if (before !== undefined) {
        row.before = before;
        attached++;
      }
    }
    return row;
  });
  const transcripts = opts.transcripts === undefined ? null : { matched, attached };
  const withBefore = attached > 0;
  const maxChars = opts.maxChars ?? MAX_CHUNK_CHARS;
  // Instructions around the data, with room for the part numbers and message count to grow.
  const overhead = chars(buildPrompt({ index: 1, rows: [], transcripts: withBefore })) + 20;
  const all: ChunkRow[][] = [];
  let current: ChunkRow[] = [];
  let size = overhead;
  let projects = new Set<string>();
  for (const row of rows) {
    const lineCost = chars(dataLine(row)) + 1;
    const headerCost = chars(projectHeader(row.project)) + 1;
    let cost = lineCost + (projects.has(row.project) ? 0 : headerCost);
    if (current.length > 0 && (current.length >= opts.chunkSize || size + cost > maxChars)) {
      all.push(groupByProject(current));
      current = [];
      size = overhead;
      projects = new Set();
      cost = lineCost + headerCost;
    }
    current.push(row);
    projects.add(row.project);
    size += cost;
  }
  if (current.length > 0) all.push(groupByProject(current));
  return {
    candidates: rows.length,
    dropped,
    totalChunks: all.length,
    chunks: opts.sample === undefined ? all : all.slice(0, opts.sample),
    all,
    transcripts,
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
  /** Session files found and opened by loadTranscripts, when --with-transcripts is on. */
  sessionFiles?: { files: number; opened: number } | undefined,
): Promise<Manifest> {
  const withBefore = (prepared.transcripts?.attached ?? 0) > 0;
  const chunkDir = path.join(outDir, 'chunks');
  const promptDir = path.join(outDir, 'prompts');
  for (const dir of [chunkDir, promptDir]) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }
  const entries: ManifestChunk[] = [];
  for (const [i, rows] of prepared.chunks.entries()) {
    const index = i + 1;
    const file = `chunks/${num(index)}.jsonl`;
    const promptFile = `prompts/${num(index)}.md`;
    const prompt = buildPrompt({ index, rows, transcripts: withBefore });
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
    estimateTokens(buildPrompt({ index: prepared.chunks.length + j + 1, rows, transcripts: withBefore })),
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
    transcripts:
      prepared.transcripts === null
        ? null
        : {
            enabled: true,
            files: sessionFiles?.files ?? 0,
            opened: sessionFiles?.opened ?? 0,
            candidates: prepared.candidates,
            matched: prepared.transcripts.matched,
            attached: prepared.transcripts.attached,
          },
  };
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}
