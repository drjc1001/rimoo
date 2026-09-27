import { slashCommand, type ParseResult } from './history.ts';

export interface Stats {
  generatedAt: string;
  source: string;
  lines: number;
  duplicatesRemoved: number;
  unreadableLines: number;
  prompts: number;
  projects: number;
  /** Local calendar dates (YYYY-MM-DD) of the first and last prompt; null when there are none. */
  dateRange: { first: string; last: string } | null;
  /** Descending by prompt count. */
  perProject: { project: string; prompts: number }[];
  /** Ascending, every month between first and last included (zeros kept). */
  perMonth: { month: string; prompts: number }[];
  slashCommands: number;
  withPaste: number;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local calendar date, because "when did I work" is a question about the developer's own day. */
export function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localMonth(ms: number): string {
  return localDate(ms).slice(0, 7);
}

function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

export function computeStats(parsed: ParseResult, source: string, now: Date = new Date()): Stats {
  const { prompts } = parsed;
  const perProjectMap = new Map<string, number>();
  const perMonthMap = new Map<string, number>();
  let first = Number.POSITIVE_INFINITY;
  let last = Number.NEGATIVE_INFINITY;
  let slashCommands = 0;
  let withPaste = 0;

  for (const p of prompts) {
    const project = p.project === '' ? '(unknown)' : p.project;
    perProjectMap.set(project, (perProjectMap.get(project) ?? 0) + 1);
    const month = localMonth(p.timestamp);
    perMonthMap.set(month, (perMonthMap.get(month) ?? 0) + 1);
    if (p.timestamp < first) first = p.timestamp;
    if (p.timestamp > last) last = p.timestamp;
    if (slashCommand(p.display) !== null) slashCommands++;
    if (p.pasteCount > 0) withPaste++;
  }

  const perProject = [...perProjectMap.entries()]
    .map(([project, count]) => ({ project, prompts: count }))
    .sort((a, b) => b.prompts - a.prompts || a.project.localeCompare(b.project));

  const perMonth: Stats['perMonth'] = [];
  if (prompts.length > 0) {
    const lastMonth = localMonth(last);
    for (let m = localMonth(first); ; m = nextMonth(m)) {
      perMonth.push({ month: m, prompts: perMonthMap.get(m) ?? 0 });
      if (m === lastMonth) break;
    }
  }

  return {
    generatedAt: now.toISOString(),
    source,
    lines: parsed.totalLines,
    duplicatesRemoved: parsed.duplicates,
    unreadableLines: parsed.badLines.length,
    prompts: prompts.length,
    projects: perProjectMap.size,
    dateRange: prompts.length > 0 ? { first: localDate(first), last: localDate(last) } : null,
    perProject,
    perMonth,
    slashCommands,
    withPaste,
  };
}
