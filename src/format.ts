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

export function formatSaved(files: string[]): string {
  return `Saved ${files.join(' and ')}\n`;
}
