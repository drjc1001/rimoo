/**
 * The privacy gate: find paths, emails, URLs, phone numbers, secrets and the user's own project names in text
 * headed for a file that may be shared, and replace them with `[removed]`. Line by line, so a removal never
 * moves the lines after it. Client names that never appear in a project folder name are not recognised;
 * the merge prompt asks the model to leave names out, and report.md (kept local) is where quotes live.
 */

export const HIT_KINDS = ['secret', 'url', 'email', 'path', 'phone', 'project'] as const;
export type HitKind = (typeof HIT_KINDS)[number];

export interface Hit {
  /** 1-based line in the text. */
  line: number;
  kind: HitKind;
  /** What was found, as written. */
  text: string;
}

export interface ScanOptions {
  /** Leave file paths and project names alone. */
  allowPaths?: boolean | undefined;
  /** Only these kinds (default: all six). */
  kinds?: readonly HitKind[] | undefined;
  /** The user's project folder names, removed wherever they appear (see `projectNames`). */
  names?: readonly string[] | undefined;
}

/** Shortest project name still worth removing: "app" or "web" would hit ordinary words. */
export const MIN_NAME = 4;

/**
 * What to remove for a list of project paths: each folder name, plus the name without a leading number
 * ("068_吉野環保科技" also gives "吉野環保科技"). Purely numeric or very short names are left out.
 */
export function projectNames(projects: readonly string[]): string[] {
  const out = new Set<string>();
  for (const project of projects) {
    const base = project.split(/[\\/]+/).filter(Boolean).pop() ?? '';
    for (const name of [base, base.replace(/^\d+[_-]?/, '')]) {
      if ([...name].length >= MIN_NAME && /[^\d_.-]/.test(name) && name !== '(unknown)') out.add(name);
    }
  }
  // Longest first, so "toy-app-tickets" is one removal, not "toy-app" plus a tail.
  return [...out].sort((a, b) => b.length - a.length);
}

export const REMOVED = '[removed]';

/** Before `/` in a path: not a word character, dot, colon, slash, tilde or dash (so not `1/2`, `2026/09/27`, `a.com/x/y`). */
const PATH_START = String.raw`(?<![\w.:/~\\-])`;

/**
 * Patterns in priority order: where two overlap, the earlier kind wins (a URL is one URL, not a URL and a path).
 * All are global; `check`, when given, drops a match that only looks the part.
 */
const PATTERNS: { kind: HitKind; re: RegExp; check?: (m: string) => boolean }[] = [
  { kind: 'secret', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'secret', re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  { kind: 'secret', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'secret', re: /\bghp_[A-Za-z0-9]{20,}/g },
  { kind: 'secret', re: /\bxox[bap]-[A-Za-z0-9-]{10,}/g },
  { kind: 'secret', re: /\bAIza[0-9A-Za-z_-]{30,}/g },
  { kind: 'secret', re: /(?<![0-9A-Za-z])[0-9a-fA-F]{32,}(?![0-9A-Za-z])/g },
  {
    kind: 'secret',
    re: /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/=])/g,
    // Base64 mixes cases and digits; a long path or identifier rarely does all three without a separator.
    check: (m) => /[A-Z]/.test(m) && /[a-z]/.test(m) && /\d/.test(m) && !m.startsWith('/') && !/\/\//.test(m),
  },
  { kind: 'url', re: /\bhttps?:\/\/[^\s<>"'`，。、；：！？（）「」『』【】]+/g },
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { kind: 'path', re: new RegExp(PATH_START + String.raw`\/[\w.-]+(?:\/[\w.-]+)+\/?`, 'g'), check: (m) => /[A-Za-z]/.test(m) },
  { kind: 'path', re: /(?<![\w/~])~\/[\w.-]+(?:\/[\w.-]+)*\/?/g },
  { kind: 'path', re: /(?<![A-Za-z0-9])[A-Za-z]:[\\/][\w.-]+(?:[\\/][\w .-]*[\w.-])*[\\/]?/g },
  { kind: 'phone', re: /(?<![\w.+/:-])09\d{2}[- ]?\d{3}[- ]?\d{3}(?![\w-])/g },
  { kind: 'phone', re: /(?<![\w+])\+\d{1,3}(?:[- ]?\(?\d\)?){6,14}(?![\w-])/g },
];

/** Trailing punctuation belongs to the sentence, not the URL. */
const trimUrl = (s: string): string => s.replace(/[.,;:!?)\]}'"]+$/, '');

interface Span {
  start: number;
  end: number;
  kind: HitKind;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A project name as a pattern: ASCII names match whole words, case-insensitively; others match as written. */
function nameRe(name: string): RegExp {
  const ascii = /^[\x20-\x7e]+$/.test(name);
  return ascii ? new RegExp(`(?<![A-Za-z0-9])${escapeRe(name)}(?![A-Za-z0-9])`, 'gi') : new RegExp(escapeRe(name), 'g');
}

function spansIn(line: string, names: readonly string[]): Span[] {
  const taken: Span[] = [];
  const claim = (start: number, end: number, kind: HitKind): void => {
    if (taken.some((s) => start < s.end && s.start < end)) return;
    taken.push({ start, end, kind });
  };
  for (const { kind, re, check } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of line.matchAll(re)) {
      let text = m[0];
      if (kind === 'url') text = trimUrl(text);
      if (check && !check(text)) continue;
      claim(m.index, m.index + text.length, kind);
    }
  }
  for (const name of names) for (const m of line.matchAll(nameRe(name))) claim(m.index, m.index + m[0].length, 'project');
  return taken.sort((a, b) => a.start - b.start);
}

function wanted(opts: ScanOptions): Set<HitKind> {
  const kinds = new Set<HitKind>(opts.kinds ?? HIT_KINDS);
  if (opts.allowPaths) {
    kinds.delete('path');
    kinds.delete('project');
  }
  return kinds;
}

/** Replace every hit with `[removed]`; returns the new text and what was removed, line by line. */
export function redact(text: string, opts: ScanOptions = {}): { text: string; hits: Hit[] } {
  const kinds = wanted(opts);
  const hits: Hit[] = [];
  const lines = text.split('\n').map((line, i) => {
    // Overlaps are settled over all kinds first, so a URL left in is not half-removed as a path.
    const spans = spansIn(line, kinds.has('project') ? (opts.names ?? []) : []).filter((s) => kinds.has(s.kind));
    if (spans.length === 0) return line;
    let out = '';
    let at = 0;
    for (const s of spans) {
      hits.push({ line: i + 1, kind: s.kind, text: line.slice(s.start, s.end) });
      out += line.slice(at, s.start) + REMOVED;
      at = s.end;
    }
    return out + line.slice(at);
  });
  return { text: lines.join('\n'), hits };
}

/** What `redact` would remove. */
export function scan(text: string, opts: ScanOptions = {}): Hit[] {
  return redact(text, opts).hits;
}

const LABEL: Record<HitKind, [string, string]> = {
  path: ['file path', 'file paths'],
  email: ['email address', 'email addresses'],
  url: ['URL', 'URLs'],
  phone: ['phone number', 'phone numbers'],
  secret: ['key or token', 'keys or tokens'],
  project: ['project name', 'project names'],
};

/** Line numbers listed per kind before the rest is counted as "…". */
const MAX_LINES = 10;

/**
 * The terminal notice for one file, e.g. "  Removed from CLAUDE.md: 2 file paths (lines 12, 40), 1 URL (line 18).
 * Pass --allow-paths to keep paths and project names."; empty when nothing was removed.
 */
export function formatRemoved(file: string, hits: Hit[]): string {
  if (hits.length === 0) return '';
  const parts: string[] = [];
  for (const kind of ['path', 'project', 'email', 'url', 'phone', 'secret'] as const) {
    const of = hits.filter((h) => h.kind === kind);
    if (of.length === 0) continue;
    const lines = [...new Set(of.map((h) => h.line))];
    const shown = lines.slice(0, MAX_LINES).join(', ') + (lines.length > MAX_LINES ? ', …' : '');
    const [one, many] = LABEL[kind];
    parts.push(`${of.length.toLocaleString('en-US')} ${of.length === 1 ? one : many} (${lines.length === 1 ? 'line' : 'lines'} ${shown})`);
  }
  const hint = hits.some((h) => h.kind === 'path' || h.kind === 'project')
    ? ' Pass --allow-paths to keep paths and project names.'
    : '';
  return `  Removed from ${file}: ${parts.join(', ')}.${hint}\n`;
}
