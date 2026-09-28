import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Manifest } from './chunks.ts';
import { buildMergePrompt } from './merge-template.ts';
import {
  callClaude,
  CATEGORIES,
  CONFIDENCE,
  findingsFile,
  finishedChunk,
  isObject,
  MAX_CONCURRENCY,
  parseReply,
  sha256,
  writeJson,
  zeroUsage,
  type Category,
  type ChunkFindings,
  type Confidence,
  type Evidence,
  type Usage,
} from './runner.ts';
import { estimateChunkTokens, estimateTokens } from './tokens.ts';

/** Most quotes kept per merged rule. */
export const MAX_EVIDENCE = 5;

/** A chunk's finding, numbered across all chunks. */
export interface FlatFinding {
  /** 1-based, across every chunk's findings in chunk order. */
  index: number;
  chunk: number;
  category: Category;
  rule: string;
  frequency: number;
  confidence: Confidence;
  trigger: string | null;
  evidence: Evidence[];
}

export interface MergedRule {
  /** snake_case, unique across all rules; workstyle.json uses it. */
  key: string;
  category: Category;
  /** Short phrase for SKILL.md; null when the model gave none. */
  title: string | null;
  /** The title in English, for the share card with --lang en; written into merged.json once translated. */
  titleEn?: string | undefined;
  rule: string;
  confidence: Confidence;
  /** Sum of the members' frequency. */
  frequency: number;
  /** Distinct chunks the members came from. */
  chunks: number;
  /** Indexes of the findings folded into this rule. */
  members: number[];
  /** Up to MAX_EVIDENCE quotes, one id once, by date. */
  evidence: Evidence[];
  /** The first member's trigger that is not empty. */
  trigger: string | null;
}

export interface MergeDropped {
  /** Member indexes that are not a finding of that category. */
  unknown: number;
  /** Member indexes already taken by an earlier group. */
  duplicate: number;
  /** Groups dropped whole: out of shape, or no member left. */
  groups: number;
}

/** merged.json */
export interface Merged {
  generatedAt: string;
  /** Fingerprint of every findings file read, so an unchanged set is not merged again. */
  findingsSha256: string;
  chunksAnalyzed: number;
  chunksTotal: number;
  /** Findings that went in. */
  findings: number;
  usage: Usage;
  costUsd: number;
  durationMs: number;
  dropped: MergeDropped;
  /** Ranked: chunks descending, then frequency descending. */
  rules: MergedRule[];
}

export interface LoadedFindings {
  findings: FlatFinding[];
  chunksAnalyzed: number;
  chunksTotal: number;
  findingsSha256: string;
}

/**
 * Read findings/NNN.json of every manifest chunk that is finished (its prompt unchanged); chunks without one are
 * skipped and only counted. Quote dates are taken from chunks/NNN.jsonl, not from what the model copied.
 */
export async function loadFindings(outDir: string, manifest: Manifest): Promise<LoadedFindings> {
  const findings: FlatFinding[] = [];
  const hashed: string[] = [];
  let analyzed = 0;
  for (const chunk of manifest.chunks) {
    const done: ChunkFindings | null = await finishedChunk(outDir, chunk);
    if (done === null) continue;
    analyzed++;
    hashed.push(`${chunk.index}\n${await readFile(findingsFile(outDir, chunk.index), 'utf8')}`);
    const ts = new Map<number, string>();
    try {
      for (const line of (await readFile(path.join(outDir, chunk.file), 'utf8')).split('\n')) {
        if (line.trim() === '') continue;
        const row = JSON.parse(line) as { id: number; ts: string };
        ts.set(row.id, row.ts);
      }
    } catch {
      // keep the dates the model copied
    }
    for (const f of done.findings) {
      findings.push({
        index: findings.length + 1,
        chunk: chunk.index,
        category: f.category,
        rule: f.rule,
        frequency: f.frequency,
        confidence: f.confidence,
        trigger: f.trigger,
        evidence: f.evidence.map((e) => ({ ...e, ts: ts.get(e.id) ?? e.ts })),
      });
    }
  }
  return {
    findings,
    chunksAnalyzed: analyzed,
    chunksTotal: manifest.totalChunks,
    findingsSha256: sha256(hashed.join('\n')),
  };
}

// ------------------------------------------------------------------------------------------------ validate

/** A group as the model wrote it, after checking. Members are this category's indexes, each once. */
export interface MergeGroup {
  key: string | null;
  title: string | null;
  rule: string;
  confidence: Confidence | null;
  members: number[];
}

function toIndex(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v);
  return null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Keep the groups in shape; drop member indexes that are not in `valid` or already used, and count them.
 * raw is the parsed reply: {"rules":[...]} (a bare array is accepted too).
 */
export function validateMerge(raw: unknown, valid: Set<number>): { groups: MergeGroup[]; dropped: MergeDropped } {
  const list = Array.isArray(raw) ? raw : isObject(raw) && Array.isArray(raw.rules) ? raw.rules : null;
  if (list === null) throw new Error('reply has no "rules" list');
  const dropped: MergeDropped = { unknown: 0, duplicate: 0, groups: 0 };
  const used = new Set<number>();
  const groups: MergeGroup[] = [];
  for (const g of list) {
    const rule = isObject(g) ? str(g.rule) : null;
    if (!isObject(g) || rule === null || !Array.isArray(g.members)) {
      dropped.groups++;
      continue;
    }
    const members: number[] = [];
    for (const m of g.members) {
      const i = toIndex(m);
      if (i === null || !valid.has(i)) dropped.unknown++;
      else if (used.has(i)) dropped.duplicate++;
      else {
        used.add(i);
        members.push(i);
      }
    }
    if (members.length === 0) {
      dropped.groups++;
      continue;
    }
    groups.push({
      key: str(g.key),
      title: str(g.title),
      rule,
      confidence: (CONFIDENCE as readonly unknown[]).includes(g.confidence) ? (g.confidence as Confidence) : null,
      members,
    });
  }
  return { groups, dropped };
}

// ------------------------------------------------------------------------------------------------- combine

/** "Plan before coding!" → "plan_before_coding"; null when nothing English is left. */
export function snakeKey(s: string, maxWords = 5): string | null {
  const words = s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, maxWords);
  return words.length > 0 ? words.join('_') : null;
}

/** A key for a finding no group took: the rule's first English words when it has two or more, else rule_<index>. */
export function keyFromRule(rule: string, index: number): string {
  const words = rule.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? [];
  return words.length >= 2 ? words.slice(0, 4).join('_') : `rule_${index}`;
}

const rank = (c: Confidence): number => CONFIDENCE.indexOf(c);

/**
 * Up to MAX_EVIDENCE quotes, one per id: taken a member at a time in turn so every member is heard, then by date
 * (undated last).
 */
export function joinEvidence(members: FlatFinding[]): Evidence[] {
  const seen = new Set<number>();
  const picked: Evidence[] = [];
  const queues = members.map((m) => [...m.evidence]);
  while (picked.length < MAX_EVIDENCE && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      while (q.length > 0) {
        const e = q.shift()!;
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        picked.push(e);
        break;
      }
      if (picked.length >= MAX_EVIDENCE) break;
    }
  }
  return picked.sort((a, b) => (a.ts ?? '￿').localeCompare(b.ts ?? '￿') || a.id - b.id);
}

/** Groups plus one group per finding no group took, joined back with their evidence, keys made unique. */
export function combine(findings: FlatFinding[], groups: MergeGroup[]): MergedRule[] {
  const byIndex = new Map(findings.map((f) => [f.index, f]));
  const taken = new Set(groups.flatMap((g) => g.members));
  const all: MergeGroup[] = [
    ...groups,
    ...findings
      .filter((f) => !taken.has(f.index))
      .map((f) => ({ key: null, title: null, rule: f.rule, confidence: f.confidence, members: [f.index] })),
  ];
  const rules: MergedRule[] = [];
  for (const g of all) {
    const members = g.members.map((i) => byIndex.get(i)!).sort((a, b) => a.index - b.index);
    const first = members[0]!;
    rules.push({
      key: (g.key === null ? null : snakeKey(g.key)) ?? keyFromRule(g.rule, first.index),
      category: first.category,
      title: g.title,
      rule: g.rule,
      confidence: g.confidence ?? members.map((m) => m.confidence).sort((a, b) => rank(a) - rank(b))[0]!,
      frequency: members.reduce((a, m) => a + m.frequency, 0),
      chunks: new Set(members.map((m) => m.chunk)).size,
      members: members.map((m) => m.index),
      evidence: joinEvidence(members),
      trigger: members.find((m) => m.trigger !== null)?.trigger ?? null,
    });
  }
  return rules;
}

/** Chunks descending, frequency descending; then confidence, category order and first member, so ties stay put. */
export function rankRules(rules: MergedRule[]): MergedRule[] {
  const sorted = [...rules].sort(
    (a, b) =>
      b.chunks - a.chunks ||
      b.frequency - a.frequency ||
      rank(a.confidence) - rank(b.confidence) ||
      CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
      a.members[0]! - b.members[0]!,
  );
  const used = new Map<string, number>();
  for (const r of sorted) {
    const seen = used.get(r.key) ?? 0;
    used.set(r.key, seen + 1);
    if (seen > 0) r.key = `${r.key}_${seen + 1}`;
  }
  return sorted;
}

// --------------------------------------------------------------------------------------------------- merge

export const mergedFile = (outDir: string): string => path.join(outDir, 'merged.json');

export interface MergeCall {
  category: Category;
  findings: FlatFinding[];
  prompt: string;
  /** Estimated tokens, prompt plus overhead plus output. */
  estimate: number;
}

export interface MergePlan extends LoadedFindings {
  /** merged.json from an earlier run over the same findings, or null. */
  cached: Merged | null;
  /** One per category that has findings; empty when cached. */
  calls: MergeCall[];
}

/** What a merge would do: the findings, the calls per category, or the merged.json it can reuse. */
export async function planMerge(opts: { outDir: string; manifest: Manifest; force?: boolean | undefined }): Promise<MergePlan> {
  const loaded = await loadFindings(opts.outDir, opts.manifest);
  let cached: Merged | null = null;
  if (!opts.force) {
    try {
      const m = JSON.parse(await readFile(mergedFile(opts.outDir), 'utf8')) as Merged;
      if (m.findingsSha256 === loaded.findingsSha256 && Array.isArray(m.rules)) cached = m;
    } catch {
      // none yet
    }
  }
  const calls: MergeCall[] = [];
  if (cached === null) {
    for (const category of CATEGORIES) {
      const findings = loaded.findings.filter((f) => f.category === category);
      if (findings.length === 0) continue;
      const prompt = buildMergePrompt(category, findings);
      calls.push({ category, findings, prompt, estimate: estimateChunkTokens(estimateTokens(prompt)) });
    }
  }
  return { ...loaded, cached, calls };
}

export interface MergeProgress {
  category: Category;
  findings: number;
  rules: number;
  usage: Usage;
  costUsd: number;
  durationMs: number;
  dropped: MergeDropped;
}

export interface RunMergeOptions {
  claude: string;
  outDir: string;
  plan: MergePlan;
  /** Categories at once, 1 to MAX_CONCURRENCY (default 1). */
  concurrency?: number | undefined;
  model?: string | undefined;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  onProgress?: (p: MergeProgress) => void;
}

/**
 * Merge with one `claude -p` call per category and write merged.json; returns the cached one instead when the plan
 * has it. The first failing call stops the merge (calls already running finish) and nothing is written.
 */
export async function runMerge(opts: RunMergeOptions): Promise<Merged> {
  const { plan, outDir } = opts;
  if (plan.cached !== null) return plan.cached;
  const concurrency = Math.min(MAX_CONCURRENCY, Math.max(1, opts.concurrency ?? 1));
  const results = new Map<Category, { rules: MergedRule[]; progress: MergeProgress }>();
  let next = 0;
  let failure: Error | null = null;
  const worker = async (): Promise<void> => {
    while (failure === null && next < plan.calls.length) {
      const call = plan.calls[next++]!;
      try {
        const label = `merge ${call.category}`;
        const reply = await callClaude({ claude: opts.claude, outDir, prompt: call.prompt, model: opts.model, env: opts.env, label });
        let checked: { groups: MergeGroup[]; dropped: MergeDropped };
        try {
          checked = validateMerge(parseReply(reply.text), new Set(call.findings.map((f) => f.index)));
        } catch {
          const rawFile = path.join(outDir, `merge-${call.category}.raw.txt`);
          await writeFile(rawFile, reply.text, 'utf8');
          throw new Error(`${label}: the reply was not the JSON asked for; it is saved in ${rawFile}`);
        }
        const rules = combine(call.findings, checked.groups);
        const progress: MergeProgress = {
          category: call.category,
          findings: call.findings.length,
          rules: rules.length,
          usage: reply.usage,
          costUsd: reply.costUsd,
          durationMs: reply.durationMs,
          dropped: checked.dropped,
        };
        results.set(call.category, { rules, progress });
        opts.onProgress?.(progress);
      } catch (err) {
        failure ??= err instanceof Error ? err : new Error(String(err));
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(plan.calls.length, 1)) }, worker));
  if (failure !== null) throw failure;

  const usage = zeroUsage();
  const dropped: MergeDropped = { unknown: 0, duplicate: 0, groups: 0 };
  let costUsd = 0;
  let durationMs = 0;
  const rules: MergedRule[] = [];
  for (const category of CATEGORIES) {
    const r = results.get(category);
    if (r === undefined) continue;
    rules.push(...r.rules);
    for (const k of Object.keys(usage) as (keyof Usage)[]) usage[k] += r.progress.usage[k] ?? 0;
    for (const k of Object.keys(dropped) as (keyof MergeDropped)[]) dropped[k] += r.progress.dropped[k];
    costUsd += r.progress.costUsd;
    durationMs += r.progress.durationMs;
  }
  const merged: Merged = {
    generatedAt: (opts.now ?? new Date()).toISOString(),
    findingsSha256: plan.findingsSha256,
    chunksAnalyzed: plan.chunksAnalyzed,
    chunksTotal: plan.chunksTotal,
    findings: plan.findings.length,
    usage,
    costUsd: Math.round(costUsd * 1e6) / 1e6,
    durationMs,
    dropped,
    rules: rankRules(rules),
  };
  await writeJson(mergedFile(outDir), merged);
  return merged;
}
