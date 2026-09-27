import type { Manifest, ManifestChunk } from './chunks.ts';
import { LARGE_HISTORY_CHUNKS, LARGE_HISTORY_TOKENS, type Progress, type UsageSummary } from './runner.ts';
import { CALL_OVERHEAD_TOKENS } from './tokens.ts';
import type { RepeatedGroup, Repeated } from './repeated.ts';
import type { Stats } from './stats.ts';
import type { Merged, MergeProgress } from './merge.ts';

export const n = (v: number): string => v.toLocaleString('en-US');

function bar(value: number, max: number, width = 24): string {
  if (max <= 0) return '';
  return '▇'.repeat(Math.max(value > 0 ? 1 : 0, Math.round((value / max) * width)));
}

/** The stats part of `rimoo analyze`; the caller appends the repeated tables and `formatSaved`. */
export function formatSummary(stats: Stats, topProjects = 10): string {
  const lines: string[] = [];
  lines.push('Rimoo — Remember how you work.');
  lines.push('');
  lines.push(`Read ${stats.source}`);
  lines.push(
    `  ${n(stats.lines)} lines · ${n(stats.duplicatesRemoved)} duplicate${stats.duplicatesRemoved === 1 ? '' : 's'} removed · ${n(stats.unreadableLines)} unreadable`,
  );
  const range = stats.dateRange ? `${stats.dateRange.first} → ${stats.dateRange.last}` : 'no dates';
  lines.push(`  ${n(stats.prompts)} prompts · ${n(stats.projects)} projects · ${range}`);
  lines.push(`  ${n(stats.slashCommands)} slash commands · ${n(stats.withPaste)} with pasted content`);
  lines.push('');

  const top = stats.perProject.slice(0, topProjects);
  lines.push(`Prompts per project (top ${top.length} of ${n(stats.projects)})`);
  const widest = Math.max(...top.map((p) => n(p.prompts).length), 1);
  for (const p of top) lines.push(`  ${n(p.prompts).padStart(widest)}  ${p.project}`);
  lines.push('');

  lines.push('Prompts per month');
  const max = Math.max(...stats.perMonth.map((m) => m.prompts), 0);
  const widestMonth = Math.max(...stats.perMonth.map((m) => n(m.prompts).length), 1);
  for (const m of stats.perMonth) {
    lines.push(`  ${m.month}  ${n(m.prompts).padStart(widestMonth)}  ${bar(m.prompts, max)}`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

const clip = (s: string, max = 80): string => {
  const chars = [...s];
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : s;
};

function table(title: string, groups: RepeatedGroup[], top: number): string[] {
  const shown = groups.slice(0, top);
  const lines = [`${title} (top ${top})`];
  if (shown.length === 0) lines.push('  (none)');
  const wCount = Math.max(...shown.map((g) => n(g.count).length), 1);
  const wProj = Math.max(...shown.map((g) => n(g.projects).length), 1);
  for (const g of shown) {
    lines.push(
      `  ${n(g.count).padStart(wCount)}  ${n(g.projects).padStart(wProj)}  ${g.first} → ${g.last}  ${clip(g.label)}`,
    );
  }
  lines.push('');
  return lines;
}

/** Rows read: times · projects · first → last · the instruction as most often typed. */
export function formatRepeated(r: Repeated): string {
  return [
    ...table('Most repeated instructions', r.instructions, 20),
    ...table('Short replies', r.shortReplies, 10),
    ...table('Slash commands', r.slashCommands, 10),
  ].join('\n');
}

/** What was prepared for the language-model pass; promptDir is how the caller wants the folder shown. */
export function formatPrepared(m: Manifest, promptDir: string): string {
  const d = m.dropped;
  const plural = (v: number, one: string, many: string): string => `${n(v)} ${v === 1 ? one : many}`;
  const lines = ['Prepared for analysis'];
  lines.push(
    `  ${plural(m.candidates, 'prompt', 'prompts')} kept · dropped ${plural(d.slash, 'slash command', 'slash commands')}, ` +
      `${plural(d.short, 'short reply', 'short replies')}, ${n(d.empty)} empty or paste-only`,
  );
  if (m.chunks.length === 0) {
    lines.push('  Nothing to analyze with these filters');
  } else {
    const largest = Math.max(...m.chunks.map((c) => c.chars));
    const sampled = m.chunks.length < m.totalChunks ? ` (first ${n(m.chunks.length)} of ${n(m.totalChunks)})` : '';
    lines.push(
      `  ${plural(m.chunks.length, 'chunk', 'chunks')} of up to ${n(m.chunkSize)} prompts or ${n(m.maxChars)} characters${sampled}` +
        ` · largest ${n(largest)} characters`,
    );
    const e = m.estimateFull;
    lines.push(
      `  About ${n(e.totalTokens)} tokens to analyze all ${n(m.totalChunks)} ${m.totalChunks === 1 ? 'chunk' : 'chunks'}` +
        ' (estimate; a run reports the real count)',
    );
    lines.push(
      `    = ${n(e.promptTokens)} in the prompts + ${n(e.calls)} calls × ${n(CALL_OVERHEAD_TOKENS)} overhead` +
        ` + about ${n(e.outputTokens)} of output (the answers and the model's thinking)`,
    );
    if (m.chunks.length < m.totalChunks) {
      lines.push(
        `  This sample of ${n(m.chunks.length)} ${m.chunks.length === 1 ? 'chunk' : 'chunks'}: about ${n(m.estimate.totalTokens)} tokens`,
      );
    }
    lines.push(`  Prompts written to ${promptDir}/ (one ready-to-run prompt per chunk)`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

export function formatSaved(files: string[]): string {
  if (files.length <= 2) return `Saved ${files.join(' and ')}\n`;
  return `Saved ${files.slice(0, -1).join(', ')} and ${files[files.length - 1]}\n`;
}

/** Two extra lines under the estimate when the history is large; empty otherwise. */
export function formatLargeHistory(m: Manifest): string {
  if (m.estimateFull.totalTokens <= LARGE_HISTORY_TOKENS && m.totalChunks <= LARGE_HISTORY_CHUNKS) return '';
  return (
    '  This is a large history.\n' +
    '  Narrow it with --since <date> or --project <text>, or run it in several sittings: finished chunks are kept' +
    ' and the next run picks up where this one stopped.\n\n'
  );
}

const usd = (v: number): string => `$${v.toFixed(2)}`;

/** 5 s → "5 s", 429,000 → "7 min 9 s", 11,200,000 → "3 h 7 min". */
export function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} s`;
  if (total < 3600) return `${Math.floor(total / 60)} min ${total % 60} s`;
  return `${Math.floor(total / 3600)} h ${Math.floor((total % 3600) / 60)} min`;
}

/** 41 s, 3 min 5 s */
export function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

const plural = (v: number, one: string, many: string): string => `${n(v)} ${v === 1 ? one : many}`;

/** "31 findings (2 dropped, 3 quotes dropped)", leaving out whatever is zero. */
function findingsText(findings: number, dropped: { findings: number; evidence: number }): string {
  const extra: string[] = [];
  if (dropped.findings > 0) extra.push(`${n(dropped.findings)} dropped`);
  if (dropped.evidence > 0) extra.push(`${plural(dropped.evidence, 'quote', 'quotes')} dropped`);
  return `${plural(findings, 'finding', 'findings')}${extra.length > 0 ? ` (${extra.join(', ')})` : ''}`;
}

/** What is about to run, printed before the y/N question. */
export function formatRunPlan(toRun: ManifestChunk[], kept: number, estimate: number): string {
  const lines = ['Analyze with Claude Code'];
  lines.push(
    `  ${plural(toRun.length, 'chunk', 'chunks')} to run · about ${n(estimate)} tokens (estimate)` +
      (kept > 0 ? ` · ${n(kept)} already done, kept` : ''),
  );
  return lines.join('\n') + '\n';
}

/** One line per chunk as it finishes. */
export function formatProgress(p: Progress): string {
  const head = `chunk ${p.chunk.index}/${p.total}`;
  if (p.kind === 'skipped') return `  ${head} · already done, kept\n`;
  if (p.kind === 'failed') return `  ${head} · failed: ${p.error.message}\n`;
  const r = p.result;
  return `  ${head} · ${n(r.usage.total)} tokens · ${usd(r.costUsd)} · ${seconds(r.durationMs)} · ${findingsText(r.findings.length, r.dropped)}\n`;
}

export interface RunTotalInput {
  summary: UsageSummary;
  manifest: Manifest;
  /** Where findings are kept, as the caller wants it shown. */
  findingsDir: string;
  /** Estimated tokens for the chunks that have findings, to compare with what they really used. */
  estimateFinished: number;
}

/** Totals after a run, the --sample extrapolation, and what to do after a failure. */
export function formatRunTotal({ summary: s, manifest: m, findingsDir, estimateFinished }: RunTotalInput): string {
  const lines: string[] = [];
  const finished = s.chunksRun + s.chunksSkipped;
  lines.push('');
  lines.push(
    `Analyzed ${plural(s.chunksRun, 'chunk', 'chunks')} this run` +
      (s.chunksSkipped > 0 ? `, ${n(s.chunksSkipped)} kept from before` : '') +
      (s.chunksFailed.length > 0 ? `, ${n(s.chunksFailed.length)} failed` : ''),
  );
  lines.push(
    `  ${plural(finished, 'chunk', 'chunks')} finished: ${n(s.tokens.total)} tokens · ${usd(s.costUsd)} · ${findingsText(s.findings, s.dropped)}`,
  );
  lines.push(
    `    = ${n(s.tokens.input)} input + ${n(s.tokens.cacheCreation)} cache writes + ${n(s.tokens.cacheRead)} cache reads + ${n(s.tokens.output)} output` +
      (s.tokens.thinking > 0 ? ` (${n(s.tokens.thinking)} of it thinking)` : ''),
  );
  lines.push("  Cost is Claude Code's own figure at API prices; on a Claude subscription it counts toward your plan's usage instead.");
  if (s.chunksFailed.length > 0) {
    lines.push(`  Finished chunks are kept in ${findingsDir}/; run the same command again to continue.`);
  } else if (m.chunks.length < m.totalChunks && finished > 0) {
    const all = estimateFinished > 0 ? Math.round((s.tokens.total / estimateFinished) * m.estimateFull.totalTokens) : 0;
    lines.push(
      `  ${plural(finished, 'chunk', 'chunks')} used ${n(s.tokens.total)} tokens (estimate was ${n(estimateFinished)}); ` +
        `all ${n(m.totalChunks)} chunks ≈ ${n(all)} at this rate`,
    );
    const perChunk = (v: number): number => v / finished;
    lines.push(
      `  About ${usd(perChunk(s.costUsd) * m.totalChunks)} and ${duration(perChunk(s.durationMs) * m.totalChunks)} for all ${n(m.totalChunks)} chunks` +
        ` one at a time; --concurrency 4 runs up to 4 at once, --model <name> changes the model`,
    );
    lines.push('  Run again without --sample to analyze the rest; finished chunks are kept.');
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

/** What the merge is about to do, printed before it runs (and before the y/N question when one is asked). */
export function formatMergePlan(findings: number, calls: number, estimate: number): string {
  return (
    `Merge findings into rules with Claude Code\n` +
    `  ${plural(findings, 'finding', 'findings')} · ${plural(calls, 'call', 'calls')} (one per category) · about ${n(estimate)} tokens (estimate)\n`
  );
}

/** One line per category as its merge call finishes. */
export function formatMergeProgress(p: MergeProgress): string {
  const d = p.dropped;
  const extra: string[] = [];
  if (d.unknown > 0) extra.push(`${plural(d.unknown, 'unknown index', 'unknown indexes')} dropped`);
  if (d.duplicate > 0) extra.push(`${plural(d.duplicate, 'repeated index', 'repeated indexes')} dropped`);
  if (d.groups > 0) extra.push(`${plural(d.groups, 'group', 'groups')} dropped`);
  return (
    `  ${p.category} · ${n(p.usage.total)} tokens · ${usd(p.costUsd)} · ${seconds(p.durationMs)} · ` +
    `${plural(p.findings, 'finding', 'findings')} → ${plural(p.rules, 'rule', 'rules')}` +
    (extra.length > 0 ? ` (${extra.join(', ')})` : '') +
    '\n'
  );
}

/** After the merge: its totals, or that an earlier merge of the same findings was reused. */
export function formatMergeTotal(m: Merged, reused: boolean): string {
  if (reused) {
    return `Findings unchanged since the last merge; kept its ${plural(m.rules.length, 'rule', 'rules')}. Pass --force to merge again.\n\n`;
  }
  return (
    `  Merged ${plural(m.findings, 'finding', 'findings')} into ${plural(m.rules.length, 'rule', 'rules')}: ` +
    `${n(m.usage.total)} tokens · ${usd(m.costUsd)}\n\n`
  );
}
