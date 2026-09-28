/**
 * --lang en: the top five titles in English for share.txt and the share card, by one small `claude -p` call.
 * The answer is kept in merged.json as each rule's titleEn, so the next export does not ask again.
 */
import type { Merged, MergedRule } from './merge.ts';
import { mergedFile } from './merge.ts';
import { callClaude, isObject, parseReply, writeJson, type ClaudeReply } from './runner.ts';
import { hasCjk, shareRules } from './exports.ts';

export const TRANSLATE_SYSTEM_PROMPT =
  'You translate short habit titles into plain English. Reply with JSON only, exactly in the shape the message asks for.';

/** Most English words per title the prompt asks for. */
export const MAX_TITLE_WORDS = 6;

const source = (r: MergedRule): string => (r.title ?? r.rule).replace(/\s*[\r\n]+\s*/g, ' ').trim();

/** The shared rules that still need an English title: written in Chinese, with no titleEn yet. */
export function needsTranslation(merged: Merged): MergedRule[] {
  return shareRules(merged.rules).filter((r) => r.titleEn === undefined && hasCjk(source(r)));
}

export function buildTranslatePrompt(titles: string[]): string {
  return [
    `Translate each of these ${titles.length} habit titles into English.`,
    `Each one an imperative phrase of at most ${MAX_TITLE_WORDS} words, no full stop at the end, in the same order.`,
    `Reply with JSON only: {"titles": [...]} holding exactly ${titles.length} strings.`,
    '',
    '<titles>',
    JSON.stringify(titles),
    '</titles>',
    '',
  ].join('\n');
}

/** The model's titles, checked: as many as asked, each a string that is not empty. Throws otherwise. */
export function validateTitles(reply: unknown, expected: number): string[] {
  if (!isObject(reply) || !Array.isArray(reply.titles)) throw new Error('the reply has no "titles" list');
  const titles = reply.titles;
  if (titles.length !== expected) throw new Error(`asked for ${expected} titles, got ${titles.length}`);
  return titles.map((t, i) => {
    if (typeof t !== 'string' || t.trim() === '') throw new Error(`title ${i + 1} is empty`);
    return t.replace(/\s*[\r\n]+\s*/g, ' ').trim().replace(/[.。]+$/, '');
  });
}

export interface TranslateOptions {
  claude: string;
  outDir: string;
  merged: Merged;
  model?: string | undefined;
  env?: NodeJS.ProcessEnv;
}

/**
 * Translate the titles that need it with one call, set their titleEn and rewrite merged.json. Returns the call's
 * reply, or null when nothing needed translating (no call made). Throws when the call or its answer fails;
 * merged.json is then left as it was.
 */
export async function translateTitles(opts: TranslateOptions): Promise<ClaudeReply | null> {
  const todo = needsTranslation(opts.merged);
  if (todo.length === 0) return null;
  const reply = await callClaude({
    claude: opts.claude,
    outDir: opts.outDir,
    prompt: buildTranslatePrompt(todo.map(source)),
    model: opts.model,
    env: opts.env,
    label: 'translation',
    systemPrompt: TRANSLATE_SYSTEM_PROMPT,
  });
  let titles: string[];
  try {
    titles = validateTitles(parseReply(reply.text), todo.length);
  } catch (err) {
    throw new Error(`translation: ${err instanceof Error ? err.message : String(err)}`);
  }
  todo.forEach((r, i) => (r.titleEn = titles[i]!));
  await writeJson(mergedFile(opts.outDir), opts.merged);
  return reply;
}
