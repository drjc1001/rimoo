import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Merged, MergedRule } from './merge.ts';
import { CATEGORIES, type Category, type Evidence } from './runner.ts';
import { localDate, type Stats } from './stats.ts';

/** How many rules the summary lists. */
export const TOP_RULES = 10;
/** Quotes per rule in report.md. */
export const REPORT_QUOTES = 3;

export const CATEGORY_TITLE: Record<Category, string> = {
  communication: 'Communication',
  planning: 'Planning',
  implementation: 'Implementation',
  testing: 'Testing',
  debugging: 'Debugging',
  architecture: 'Architecture',
  ai_collaboration: 'AI collaboration',
};

export type Lang = 'zh' | 'en';

const CJK = /[㐀-䶿一-鿿豈-﫿]/u;

/** The language the rules are written in: Chinese when at least half of them have Chinese characters. */
export function rulesLang(rules: MergedRule[]): Lang {
  if (rules.length === 0) return 'en';
  return rules.filter((r) => CJK.test(r.rule)).length * 2 >= rules.length ? 'zh' : 'en';
}

const n = (v: number): string => v.toLocaleString('en-US');
const count = (v: number, one: string, many: string): string => `${n(v)} ${v === 1 ? one : many}`;

/** Words around headings and field names, which stay English, in the rules' language. */
const TEXT = {
  en: {
    seen: (chunks: number, freq: number) => ` (in ${n(chunks)} ${chunks === 1 ? 'chunk' : 'chunks'}, ${n(freq)} ${freq === 1 ? 'message' : 'messages'})`,
    quote: (date: string, q: string) => `${date === '' ? '' : `${date} `}"${q}"`,
    none: '_No pattern found._',
    intro: (prompts: number) => `These rules were extracted from ${n(prompts)} prompts in my Claude Code history.`,
    description: (prompts: number, keys: string[]) =>
      `My working style with AI coding assistants, extracted from ${n(prompts)} Claude Code prompts` +
      (keys.length > 0 ? `; strongest: ${keys.join(', ')}` : '') +
      '. Use it at the start of any coding session.',
    stop: '.',
  },
  zh: {
    seen: (chunks: number, freq: number) => `（出現於 ${n(chunks)} 段、${n(freq)} 則）`,
    quote: (date: string, q: string) => `${date}「${q}」`,
    none: '（沒有找到）',
    intro: (prompts: number) => `以下是從我 ${n(prompts)} 則 Claude Code 歷史訊息抽出來的工作規則。`,
    description: (prompts: number, keys: string[]) =>
      `從 ${n(prompts)} 則 Claude Code 歷史訊息整理出的個人工作風格` +
      (keys.length > 0 ? `，最明顯的是 ${keys.join('、')}` : '') +
      '。開始寫程式前載入。',
    stop: '。',
  },
} as const;

/** CLAUDE.md and SKILL.md keep rules stated plainly, or said medium-surely at least 3 times. */
export function isPortable(r: MergedRule): boolean {
  return r.confidence === 'high' || (r.confidence === 'medium' && r.frequency >= 3);
}

export interface ExportInput {
  merged: Merged;
  stats: Pick<Stats, 'prompts' | 'projects'>;
  /** Stamped in CLAUDE.md and workstyle.json (default now). */
  now?: Date;
}

/** The §8 summary: prompts and projects, chunks analyzed, the top rules. Also the head of report.md. */
export function formatTopRules({ merged, stats }: ExportInput): string {
  const t = TEXT[rulesLang(merged.rules)];
  const lines = [
    `Rimoo analyzed ${count(stats.prompts, 'prompt', 'prompts')} across ${count(stats.projects, 'project', 'projects')}.`,
    `${n(merged.chunksAnalyzed)} of ${count(merged.chunksTotal, 'chunk', 'chunks')} analyzed.`,
    '',
  ];
  const top = merged.rules.slice(0, TOP_RULES);
  if (top.length === 0) {
    lines.push('No working pattern was found.');
  } else {
    lines.push('Your strongest working patterns:', '');
    top.forEach((r, i) => lines.push(`${i + 1}. ${r.rule}${t.seen(r.chunks, r.frequency)}`));
  }
  return lines.join('\n') + '\n';
}

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ').trim();

function quoteLine(e: Evidence, lang: Lang): string {
  const date = e.ts !== null && /^\d{4}-\d{2}-\d{2}/.test(e.ts) ? e.ts.slice(0, 10) : '';
  return TEXT[lang].quote(date, oneLine(e.quote));
}

const byCategory = (rules: MergedRule[], c: Category): MergedRule[] => rules.filter((r) => r.category === c);

/** report.md: the summary, then every rule by category with its confidence, trigger and quotes. The only file with quotes. */
export function renderReport(input: ExportInput): string {
  const { merged } = input;
  const lang = rulesLang(merged.rules);
  const t = TEXT[lang];
  const out = ['# Rimoo report', '', formatTopRules(input).trimEnd(), ''];
  for (const c of CATEGORIES) {
    out.push(`## ${CATEGORY_TITLE[c]}`, '');
    const rules = byCategory(merged.rules, c);
    if (rules.length === 0) out.push(t.none, '');
    rules.forEach((r, i) => {
      out.push(`${i + 1}. **${r.rule}**${t.seen(r.chunks, r.frequency)}`);
      out.push(`   - Confidence: ${r.confidence}`);
      if (r.trigger !== null) out.push(`   - Trigger: ${oneLine(r.trigger)}`);
      const quotes = r.evidence.slice(0, REPORT_QUOTES);
      if (quotes.length > 0) {
        out.push('   - Quotes:');
        for (const e of quotes) out.push(`     - ${quoteLine(e, lang)}`);
      }
      out.push('');
    });
  }
  return out.join('\n');
}

/** CLAUDE.md: portable rules only, by category, no quotes. */
export function renderClaudeMd(input: ExportInput): string {
  const { merged, stats } = input;
  const t = TEXT[rulesLang(merged.rules)];
  const date = localDate((input.now ?? new Date()).getTime());
  const out = [`# How I work with AI (generated by Rimoo on ${date})`, '', t.intro(stats.prompts), ''];
  for (const c of CATEGORIES) {
    const rules = byCategory(merged.rules, c).filter(isPortable);
    if (rules.length === 0) continue;
    out.push(`## ${CATEGORY_TITLE[c]}`, '');
    for (const r of rules) out.push(`- ${oneLine(r.rule)}`);
    out.push('');
  }
  return out.join('\n');
}

/**
 * The bold lead of a SKILL.md rule and the sentence after it: the model's title and the rule; without a title,
 * the rule's first clause and the rest; a rule of one clause is all lead.
 */
export function skillLine(r: MergedRule, lang: Lang): { lead: string; rest: string } {
  // Each piece ends in its own language's full stop: an English rule can sit among Chinese ones.
  const stop = (s: string): string => (CJK.test(s) ? TEXT.zh.stop : /[a-z]/i.test(s) ? TEXT.en.stop : TEXT[lang].stop);
  const end = (s: string): string => (/[。.!！?？]$/.test(s) ? s : s + stop(s));
  const rule = oneLine(r.rule);
  if (r.title !== null) return { lead: end(oneLine(r.title)), rest: end(rule) };
  const m = /^(.+?)[，,；;：:]\s*(.+)$/.exec(rule);
  if (m) return { lead: end(m[1]!), rest: end(m[2]!.charAt(0).toUpperCase() + m[2]!.slice(1)) };
  return { lead: end(rule), rest: '' };
}

/** SKILL.md: a portable skill, ranked rules numbered with a bold lead, as the author's own jasper-taste. */
export function renderSkillMd(input: ExportInput): string {
  const { merged, stats } = input;
  const lang = rulesLang(merged.rules);
  const t = TEXT[lang];
  const rules = merged.rules.filter(isPortable);
  const description = t.description(stats.prompts, rules.slice(0, 3).map((r) => r.key)).replace(/"/g, "'");
  const out = ['---', 'name: my-workstyle', `description: "${description}"`, '---', '', '# My workstyle', '', t.intro(stats.prompts), '', '## Rules', ''];
  rules.forEach((r, i) => {
    const { lead, rest } = skillLine(r, lang);
    out.push(`${i + 1}. **${lead}**${rest === '' ? '' : ` ${rest}`}`);
  });
  out.push('');
  return out.join('\n');
}

export interface Workstyle {
  generatedAt: string;
  prompts: number;
  projects: number;
  communication: string[];
  planning: string[];
  implementation: string[];
  testing: string[];
  debugging: string[];
  architecture: string[];
  ai_collaboration: string[];
  rules: Pick<MergedRule, 'key' | 'category' | 'rule' | 'frequency' | 'chunks' | 'confidence'>[];
}

/** workstyle.json: every rule's key under its category, in rank order, and the full list. */
export function renderWorkstyle(input: ExportInput): Workstyle {
  const { merged, stats } = input;
  const keys = (c: Category): string[] => byCategory(merged.rules, c).map((r) => r.key);
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    prompts: stats.prompts,
    projects: stats.projects,
    communication: keys('communication'),
    planning: keys('planning'),
    implementation: keys('implementation'),
    testing: keys('testing'),
    debugging: keys('debugging'),
    architecture: keys('architecture'),
    ai_collaboration: keys('ai_collaboration'),
    rules: merged.rules.map(({ key, category, rule, frequency, chunks, confidence }) => ({
      key,
      category,
      rule,
      frequency,
      chunks,
      confidence,
    })),
  };
}

export const EXPORT_FILES = ['report.md', 'CLAUDE.md', 'SKILL.md', 'workstyle.json'] as const;

/** Write the four exports into outDir; returns their paths in EXPORT_FILES order. */
export async function writeExports(outDir: string, input: ExportInput): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const contents = [
    renderReport(input),
    renderClaudeMd(input),
    renderSkillMd(input),
    JSON.stringify(renderWorkstyle(input), null, 2) + '\n',
  ];
  const files = EXPORT_FILES.map((f) => path.join(outDir, f));
  for (const [i, file] of files.entries()) await writeFile(file, contents[i]!, 'utf8');
  return files;
}
