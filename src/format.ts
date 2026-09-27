import type { Manifest } from './chunks.ts';
import { CALL_OVERHEAD_TOKENS } from './tokens.ts';
import type { RepeatedGroup, Repeated } from './repeated.ts';
import type { Stats } from './stats.ts';

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
      `    = ${n(e.promptTokens)} in the prompts + ${n(e.calls)} calls × about ${n(CALL_OVERHEAD_TOKENS)} that Claude Code adds itself`,
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
