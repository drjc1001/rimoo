import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Merged, MergedRule } from './merge.ts';
import { CATEGORIES, type Category, type Evidence } from './runner.ts';
import { localDate, type Stats } from './stats.ts';
import { formatRemoved, redact, type Hit, type HitKind } from './privacy.ts';
import { monthsBetween, renderCard, type CardSize } from './card.ts';
import { DEFAULT_SKILL_NAME } from './install.ts';

/** How many rules the summary lists. */
export const TOP_RULES = 10;
/** Quotes per rule in report.md. */
export const REPORT_QUOTES = 3;
/** Patterns listed in share.txt. */
export const SHARE_RULES = 5;
/** Rules in SKILL.md; the rest are in rules.md. */
export const TOP_SKILL_RULES = 12;

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

/** Whether the text has Chinese characters. */
export const hasCjk = (s: string): boolean => CJK.test(s);

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
    skill: {
      what: (rules: number, prompts: number) => `What this is: ${count(rules, 'rule', 'rules')} extracted from ${n(prompts)} Claude Code prompts by Rimoo.`,
      how: (name: string) =>
        `How to use: type /${name} at the start of a Claude Code session; Claude follows these rules for that session. ` +
        'To have them always on in a project, copy CLAUDE.md into its root.',
      more: 'More: the full list is in rules.md next to this file.',
      full: (rules: number) => `Full list: rules.md (${count(rules, 'rule', 'rules')})`,
    },
    next: {
      title: 'Next',
      installed: (name: string) => `1. In a new Claude Code session, type /${name}: Claude follows these rules for that session.`,
      notInstalled: (name: string) => `1. Run again with --install-skill, then type /${name} in a new Claude Code session.`,
      exists: (name: string) =>
        `1. /${name} is already installed with other rules. Run again with --install-skill --force-skill to replace it, or --skill-name <other> to keep both.`,
      claudeMd: (file: string) => `2. To have them on all the time in one project, copy ${file} into that project's root folder.`,
      png: (file: string) => `3. ${file} is ready to post; share.txt is the text version.`,
      html: (file: string) => `3. Open ${file} in a browser and take a screenshot to post it; share.txt is the text version.`,
    },
    share: {
      title: 'My AI coding workstyle',
      prompts: (v: number) => `${count(v, 'prompt', 'prompts')} analyzed`,
      projects: (v: number) => count(v, 'project', 'projects'),
      top: 'Top patterns:',
      footer: 'Found with Rimoo — npx rimoo analyze',
    },
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
    skill: {
      what: (rules: number, prompts: number) => `這是什麼：Rimoo 從 ${n(prompts)} 則 Claude Code 歷史訊息抽出的 ${n(rules)} 條規則。`,
      how: (name: string) =>
        `怎麼用：在 Claude Code 對話開頭輸入 /${name}，這次對話 Claude 就照這些規則做。` +
        '想在某個專案一直套用，把 CLAUDE.md 複製到那個專案的根目錄。',
      more: '更多：全部規則在同一個資料夾的 rules.md。',
      full: (rules: number) => `全部規則見 rules.md（${n(rules)} 條）`,
    },
    next: {
      title: '接下來',
      installed: (name: string) => `1. 開一個新的 Claude Code 對話，輸入 /${name}：這次對話 Claude 就照這些規則做。`,
      notInstalled: (name: string) => `1. 加上 --install-skill 再跑一次，然後在新的 Claude Code 對話輸入 /${name}。`,
      exists: (name: string) => `1. /${name} 已經裝了另一版規則。加上 --install-skill --force-skill 再跑一次就換掉；想兩份都留用 --skill-name 取別的名字。`,
      claudeMd: (file: string) => `2. 想在某個專案一直套用，把 ${file} 複製到那個專案的根目錄。`,
      png: (file: string) => `3. ${file} 可以直接貼出去；share.txt 是文字版。`,
      html: (file: string) => `3. 用瀏覽器打開 ${file} 截圖就能貼出去；share.txt 是文字版。`,
    },
    share: {
      title: '我跟 AI 寫程式的習慣',
      prompts: (v: number) => `分析了 ${n(v)} 則訊息`,
      projects: (v: number) => `${n(v)} 個專案`,
      top: '最常出現的習慣：',
      footer: '用 Rimoo 整理：npx rimoo analyze',
    },
  },
} as const;

/** CLAUDE.md and SKILL.md keep rules stated plainly, or said medium-surely at least 3 times. */
export function isPortable(r: MergedRule): boolean {
  return r.confidence === 'high' || (r.confidence === 'medium' && r.frequency >= 3);
}

export interface ExportInput {
  merged: Merged;
  stats: Pick<Stats, 'prompts' | 'projects'> & { dateRange?: Stats['dateRange'] | undefined };
  /** Stamped in CLAUDE.md and workstyle.json (default now). */
  now?: Date;
  /** The most repeated instruction (repeated.json's first), for the share card; none leaves it off the card. */
  repeatedTop?: { label: string; count: number } | null | undefined;
  /** Language of share.txt and the share card (default: the rules' own); 'en' uses each rule's titleEn. */
  lang?: Lang | undefined;
  /** share.html's size (default 1080×1080). */
  cardSize?: CardSize | undefined;
  /** The skill name SKILL.md is written for (default my-workstyle). */
  skillName?: string | undefined;
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

function ruleLines(rules: MergedRule[], lang: Lang): string[] {
  return rules.map((r, i) => {
    const { lead, rest } = skillLine(r, lang);
    return `${i + 1}. **${lead}**${rest === '' ? '' : ` ${rest}`}`;
  });
}

/**
 * SKILL.md: a portable skill as the author's own jasper-taste: what it is and how to use it, then the top
 * TOP_SKILL_RULES rules numbered with a bold lead, then a pointer to rules.md for the rest.
 */
export function renderSkillMd(input: ExportInput): string {
  const { merged, stats } = input;
  const lang = rulesLang(merged.rules);
  const t = TEXT[lang];
  const name = input.skillName ?? DEFAULT_SKILL_NAME;
  const rules = merged.rules.filter(isPortable);
  const description = t.description(stats.prompts, rules.slice(0, 3).map((r) => r.key)).replace(/"/g, "'");
  const out = ['---', `name: ${name}`, `description: "${description}"`, '---', '', '# My workstyle', ''];
  out.push(t.skill.what(rules.length, stats.prompts), t.skill.how(name), t.skill.more, '', '## Rules', '');
  out.push(...ruleLines(rules.slice(0, TOP_SKILL_RULES), lang), '', t.skill.full(rules.length), '');
  return out.join('\n');
}

/** rules.md: every portable rule, in the same form as SKILL.md's. */
export function renderRulesMd(input: ExportInput): string {
  const { merged, stats } = input;
  const lang = rulesLang(merged.rules);
  const rules = merged.rules.filter(isPortable);
  return ['# Rules', '', TEXT[lang].intro(stats.prompts), '', ...ruleLines(rules, lang), ''].join('\n');
}

/** The lines printed after the exports and the install step: how to use what was written. */
export function formatNext(opts: {
  lang: Lang;
  name: string;
  installed: boolean;
  /** A different skill of this name is already there, so it was not written. */
  exists?: boolean | undefined;
  claudeMd: string;
  /** share.png when it was made, else share.html. */
  card: string;
  png: boolean;
}): string {
  const t = TEXT[opts.lang].next;
  return [
    t.title,
    opts.installed ? t.installed(opts.name) : opts.exists ? t.exists(opts.name) : t.notInstalled(opts.name),
    t.claudeMd(opts.claudeMd),
    opts.png ? t.png(opts.card) : t.html(opts.card),
    '',
  ].join('\n');
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

/**
 * share.txt (§11): prompts, projects and the top portable rules, short enough to paste into a README or a post.
 * Each rule by its title, or the rule itself without one.
 */
export function renderShare(input: ExportInput): string {
  const { merged, stats } = input;
  const lang = input.lang ?? rulesLang(merged.rules);
  const t = TEXT[lang].share;
  const top = shareRules(merged.rules);
  const line = (r: MergedRule): string => shareTitle(r, lang).replace(/[。.]+$/, '');
  const out = [t.title, '', t.prompts(stats.prompts), t.projects(stats.projects), ''];
  if (top.length > 0) out.push(t.top, ...top.map((r) => `• ${line(r)}`), '');
  out.push(t.footer, '');
  return out.join('\n');
}

/** The rules share.txt and the share card show: the top portable ones. */
export function shareRules(rules: MergedRule[]): MergedRule[] {
  return rules.filter(isPortable).slice(0, SHARE_RULES);
}

/** A rule as share.txt and the card show it: its title (the English one for 'en' when there is one), else the rule. */
export function shareTitle(r: MergedRule, lang: Lang): string {
  return oneLine((lang === 'en' ? r.titleEn : undefined) ?? r.title ?? r.rule);
}

/**
 * share.html: the card. Each piece of text goes through the privacy gate inside renderCard, before it is escaped,
 * so the page as a whole is not scanned again (its CSS and markup would look like paths).
 */
export function renderShareCard(input: ExportInput, opts: Pick<ExportOptions, 'allowPaths' | 'names'> = {}): string {
  const { merged, stats } = input;
  const lang = input.lang ?? rulesLang(merged.rules);
  const top = input.repeatedTop ?? null;
  return renderCard({
    prompts: stats.prompts,
    projects: stats.projects,
    months: monthsBetween(stats.dateRange),
    rules: shareRules(merged.rules).map((r) => ({ text: shareTitle(r, lang), frequency: r.frequency })),
    quote: top === null ? null : { text: top.label, count: top.count },
    lang,
    size: input.cardSize,
    allowPaths: opts.allowPaths,
    names: opts.names,
  });
}

export const EXPORT_FILES = ['report.md', 'CLAUDE.md', 'SKILL.md', 'rules.md', 'workstyle.json', 'share.txt', 'share.html'] as const;
export type ExportFile = (typeof EXPORT_FILES)[number];

export interface ExportOptions {
  /** Keep file paths in the files meant to be shared. */
  allowPaths?: boolean | undefined;
  /** Told, per file, what the privacy gate removed; only called for files with a removal. */
  onRemoved?: ((file: ExportFile, hits: Hit[]) => void) | undefined;
  /** Project names the gate removes (see privacy.ts `projectNames`). */
  names?: readonly string[] | undefined;
  /** Told each file's text as written, after the gate. */
  onWritten?: ((file: ExportFile, text: string) => void) | undefined;
}

/** What the gate removes from each file: report.md keeps the user's own quotes, so only keys and tokens go. */
const GATE: Record<ExportFile, readonly HitKind[] | 'all' | 'none'> = {
  'report.md': ['secret'],
  'CLAUDE.md': 'all',
  'SKILL.md': 'all',
  'rules.md': 'all',
  'workstyle.json': 'all',
  'share.txt': 'all',
  // Gated string by string in renderShareCard, before the escape.
  'share.html': 'none',
};

/** In workstyle.json only the rule text is scanned, not keys, dates or counts. */
const JSON_TEXT_LINE = /^\s*"(rule|title)": "/;

/** Run one file's text through the privacy gate. */
export function gate(
  file: ExportFile,
  text: string,
  allowPaths = false,
  names: readonly string[] = [],
): { text: string; hits: Hit[] } {
  const g = GATE[file];
  if (g === 'none') return { text, hits: [] };
  const opts = { allowPaths, kinds: g === 'all' ? undefined : g, names };
  if (file !== 'workstyle.json') return redact(text, opts);
  const hits: Hit[] = [];
  const lines = text.split('\n').map((line, i) => {
    if (!JSON_TEXT_LINE.test(line)) return line;
    const r = redact(line, opts);
    hits.push(...r.hits.map((h) => ({ ...h, line: i + 1 })));
    return r.text;
  });
  return { text: lines.join('\n'), hits };
}

/** The terminal lines for what the gate removed, one per file; empty when nothing was. */
export function formatGate(removed: { file: ExportFile; hits: Hit[] }[]): string {
  return removed.map(({ file, hits }) => formatRemoved(file, hits)).join('');
}

/**
 * Write the exports into outDir, each through the privacy gate (what it finds becomes `[removed]`, and the
 * file is written anyway); returns their paths in EXPORT_FILES order.
 */
export async function writeExports(outDir: string, input: ExportInput, opts: ExportOptions = {}): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const contents: Record<ExportFile, string> = {
    'report.md': renderReport(input),
    'CLAUDE.md': renderClaudeMd(input),
    'SKILL.md': renderSkillMd(input),
    'rules.md': renderRulesMd(input),
    'workstyle.json': JSON.stringify(renderWorkstyle(input), null, 2) + '\n',
    'share.txt': renderShare(input),
    'share.html': renderShareCard(input, { allowPaths: opts.allowPaths, names: opts.names }),
  };
  const files: string[] = [];
  for (const f of EXPORT_FILES) {
    const { text, hits } = gate(f, contents[f], opts.allowPaths === true, opts.names ?? []);
    const file = path.join(outDir, f);
    await writeFile(file, text, 'utf8');
    if (hits.length > 0) opts.onRemoved?.(f, hits);
    opts.onWritten?.(f, text);
    files.push(file);
  }
  return files;
}
