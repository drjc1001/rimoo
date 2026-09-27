import { slashCommand, type Prompt } from './history.ts';
import { localDate } from './stats.ts';

/** Default for --similarity. Chosen on the author's own history, see ticket T-002. */
export const DEFAULT_SIMILARITY = 0.8;
/** After politeness words are removed, text this short is a reply habit ("go ahead", "繼續"), not an instruction. */
export const SHORT_REPLY_LIMIT = 8;
/** Keys shorter than this have too few trigrams to compare fairly; they are grouped exactly only. */
export const MIN_FUZZY_LENGTH = 12;

export interface RepeatedGroup {
  /** Matching key: normalized text with politeness words removed. */
  key: string;
  /** The normalized wording typed most often in this group; what the terminal shows. */
  label: string;
  count: number;
  /** Number of distinct projects. */
  projects: number;
  /** Local dates, YYYY-MM-DD. */
  first: string;
  last: string;
  /** Up to 3 distinct original prompts, in the order they were typed. */
  examples: string[];
  /** Line numbers in history.jsonl. */
  ids: number[];
  /** Other keys folded into this group as near-duplicates (instructions only). */
  variants?: string[];
}

export interface Repeated {
  instructions: RepeatedGroup[];
  shortReplies: RepeatedGroup[];
  slashCommands: RepeatedGroup[];
}

export interface RepeatedExport extends Repeated {
  /** Groups seen only once are left out of the file; this says how many there were. */
  singletons: { instructions: number; shortReplies: number; slashCommands: number };
}

export interface GroupOptions {
  /** Trigram Jaccard threshold, 0 to 1. */
  similarity: number;
}

// Half- and full-width sentence punctuation.
const PUNCT = '.,!?;:。，！？；：';
const EDGE = new RegExp(`^[\\s${PUNCT}]+|[\\s${PUNCT}]+$`, 'gu');
const TRAILING = new RegExp(`[\\s${PUNCT}]+$`, 'u');
// Claude Code replaces pasted blocks with this placeholder in history.jsonl.
const PASTE_PLACEHOLDER = /\[pasted text #\d+(?: \+\d+ lines?)?\]/g;
const EN_POLITE = new Set(['please', 'yes', 'ok', 'okay', 'and', 'then']);
const ZH_POLITE = ['請', '幫我', '麻煩', '謝謝'];

const length = (s: string): number => [...s].length;

/**
 * Lowercase, drop paste placeholders, treat commas as spaces, collapse whitespace, trim,
 * drop trailing punctuation. "Merged, help me deploy [Pasted text #1 +3 lines]." → "merged help me deploy".
 */
export function normalize(display: string): string {
  return display
    .toLowerCase()
    .replace(PASTE_PLACEHOLDER, ' ')
    .replace(/[,，]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING, '');
}

/**
 * Remove politeness words: English ones anywhere as whole words ("merged and please help me deploy"
 * → "merged help me deploy"), Chinese ones only at either end since there are no word boundaries.
 */
export function stripPoliteness(normalized: string): string {
  let s = normalized
    .split(' ')
    .filter((w) => !EN_POLITE.has(w))
    .join(' ')
    .replace(EDGE, '');
  for (;;) {
    const before = s;
    for (const w of ZH_POLITE) {
      if (s.startsWith(w)) s = s.slice(w.length).replace(EDGE, '');
      if (s.endsWith(w)) s = s.slice(0, s.length - w.length).replace(EDGE, '');
    }
    if (s === before) return s;
  }
}

export function trigrams(s: string): Set<string> {
  const chars = [...s];
  const out = new Set<string>();
  for (let i = 0; i + 3 <= chars.length; i++) out.add(chars[i]! + chars[i + 1]! + chars[i + 2]!);
  return out;
}

/** |A ∩ B| / |A ∪ B|; two empty sets count as identical. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let common = 0;
  for (const t of small) if (large.has(t)) common++;
  return common / (a.size + b.size - common);
}

interface Acc {
  key: string;
  count: number;
  projects: Set<string>;
  first: number;
  last: number;
  examples: string[];
  ids: number[];
  variants: string[];
  /** Normalized wording → how often it was typed. */
  labels: Map<string, number>;
}

function add(map: Map<string, Acc>, key: string, label: string, p: Prompt): void {
  let g = map.get(key);
  if (!g) {
    g = {
      key,
      count: 0,
      projects: new Set(),
      first: Infinity,
      last: -Infinity,
      examples: [],
      ids: [],
      variants: [],
      labels: new Map(),
    };
    map.set(key, g);
  }
  g.count++;
  g.projects.add(p.project);
  g.first = Math.min(g.first, p.timestamp);
  g.last = Math.max(g.last, p.timestamp);
  if (g.examples.length < 3 && !g.examples.includes(p.display)) g.examples.push(p.display);
  g.ids.push(p.id);
  g.labels.set(label, (g.labels.get(label) ?? 0) + 1);
}

function absorb(into: Acc, g: Acc): void {
  into.count += g.count;
  for (const p of g.projects) into.projects.add(p);
  into.first = Math.min(into.first, g.first);
  into.last = Math.max(into.last, g.last);
  for (const e of g.examples) if (into.examples.length < 3 && !into.examples.includes(e)) into.examples.push(e);
  into.ids.push(...g.ids);
  into.variants.push(g.key);
  for (const [label, c] of g.labels) into.labels.set(label, (into.labels.get(label) ?? 0) + c);
}

const byCount = (a: { count: number; key: string }, b: { count: number; key: string }): number =>
  b.count - a.count || a.key.localeCompare(b.key);

/**
 * Fold near-identical instructions together. Groups seen at least twice are seeds, taken by count;
 * each seed joins the most similar existing cluster or starts its own. Groups seen once are then
 * compared with cluster representatives only, so the cost is (unique keys × seeds), not all pairs.
 */
function mergeNear(groups: Acc[], similarity: number): Acc[] {
  const fuzzy = groups.filter((g) => length(g.key) >= MIN_FUZZY_LENGTH);
  const exactOnly = groups.filter((g) => length(g.key) < MIN_FUZZY_LENGTH);
  const seeds = fuzzy.filter((g) => g.count >= 2).sort(byCount);
  const singles = fuzzy.filter((g) => g.count < 2);
  const clusters: { grams: Set<string>; into: Acc }[] = [];

  const best = (g: Acc): (typeof clusters)[number] | undefined => {
    const grams = trigrams(g.key);
    let hit: (typeof clusters)[number] | undefined;
    let score = -1;
    for (const c of clusters) {
      // Jaccard can never reach the threshold when one set is much larger than the other.
      const lo = Math.min(grams.size, c.grams.size);
      const hi = Math.max(grams.size, c.grams.size);
      if (hi > 0 && lo / hi < similarity) continue;
      const s = jaccard(grams, c.grams);
      if (s >= similarity && s > score) {
        hit = c;
        score = s;
      }
    }
    return hit;
  };

  const loose: Acc[] = [];
  for (const g of seeds) {
    const c = best(g);
    if (c) absorb(c.into, g);
    else {
      const into: Acc = {
        ...g,
        projects: new Set(g.projects),
        examples: [...g.examples],
        ids: [...g.ids],
        variants: [],
        labels: new Map(g.labels),
      };
      clusters.push({ grams: trigrams(g.key), into });
    }
  }
  for (const g of singles) {
    const c = best(g);
    if (c) absorb(c.into, g);
    else loose.push(g);
  }
  return [...clusters.map((c) => c.into), ...loose, ...exactOnly];
}

function finish(g: Acc, withVariants: boolean): RepeatedGroup {
  let label = g.key;
  let most = -1;
  for (const [text, c] of g.labels) {
    if (c > most) {
      most = c;
      label = text;
    }
  }
  const out: RepeatedGroup = {
    key: g.key,
    label,
    count: g.count,
    projects: g.projects.size,
    first: localDate(g.first),
    last: localDate(g.last),
    examples: g.examples,
    ids: [...g.ids].sort((a, b) => a - b),
  };
  if (withVariants) out.variants = g.variants;
  return out;
}

export function groupRepeated(prompts: Prompt[], opts: GroupOptions): Repeated {
  const slash = new Map<string, Acc>();
  const short = new Map<string, Acc>();
  const instr = new Map<string, Acc>();
  for (const p of [...prompts].sort((a, b) => a.id - b.id)) {
    const command = slashCommand(p.display);
    if (command !== null) {
      add(slash, command, command, p);
      continue;
    }
    const norm = normalize(p.display);
    if (norm === '') continue;
    const stripped = stripPoliteness(norm);
    if (stripped === '') add(short, norm, norm, p);
    else if (length(stripped) <= SHORT_REPLY_LIMIT) add(short, stripped, norm, p);
    else add(instr, stripped, norm, p);
  }
  return {
    instructions: mergeNear([...instr.values()], opts.similarity)
      .map((g) => finish(g, true))
      .sort(byCount),
    shortReplies: [...short.values()].map((g) => finish(g, false)).sort(byCount),
    slashCommands: [...slash.values()].map((g) => finish(g, false)).sort(byCount),
  };
}

/** What goes into repeated.json: only groups seen at least twice, plus a count of the rest. */
export function forExport(r: Repeated): RepeatedExport {
  const keep = (gs: RepeatedGroup[]): RepeatedGroup[] => gs.filter((g) => g.count >= 2);
  const instructions = keep(r.instructions);
  const shortReplies = keep(r.shortReplies);
  const slashCommands = keep(r.slashCommands);
  return {
    instructions,
    shortReplies,
    slashCommands,
    singletons: {
      instructions: r.instructions.length - instructions.length,
      shortReplies: r.shortReplies.length - shortReplies.length,
      slashCommands: r.slashCommands.length - slashCommands.length,
    },
  };
}
