import type { Category, Confidence } from './runner.ts';

/** One finding as the merge prompt shows it. Evidence stays out: it is joined back locally by index. */
export interface MergeLine {
  /** 1-based, numbered across every chunk's findings. */
  index: number;
  chunk: number;
  rule: string;
  frequency: number;
  confidence: Confidence;
  trigger: string | null;
}

/** What each category means, the same wording as the chunk prompt (prompt-template.ts). */
export const CATEGORY_MEANING: Record<Category, string> = {
  communication: 'how answers should be written',
  planning: 'what happens before coding',
  implementation: 'how code gets built',
  testing: 'what counts as proof',
  debugging: 'what to do when something breaks',
  architecture: 'technical choices that keep coming back',
  ai_collaboration: 'how the assistant should behave',
};

const flat = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '/');

/** One data line: index | part | frequency | confidence | rule | trigger ("-" when none). */
export function mergeLine(f: MergeLine): string {
  return `${f.index} | ${f.chunk} | ${f.frequency} | ${f.confidence} | ${flat(f.rule)} | ${f.trigger === null ? '-' : flat(f.trigger)}`;
}

/**
 * The prompt that folds one category's findings into rules. One call per category: categories never overlap,
 * each prompt stays small, and the calls can run side by side.
 */
export function buildMergePrompt(category: Category, findings: MergeLine[]): string {
  return `Below are working habits found in one developer's messages to Claude Code, all in the category "${category}" (${CATEGORY_MEANING[category]}). The history was read in several parts, one part at a time, so the same habit often shows up more than once in different words.

Group the findings that describe the same habit, and write each group as one rule.

Reply with JSON only: no markdown fence, nothing before or after it. Shape:

{"rules":[{"key":"result_first","title":"...","rule":"...","confidence":"high","moment":"plan","members":[3,17,42]}]}

What goes in each field:
- members: the index numbers of the findings in this group, from the first column below. Put each index in at most one group. A finding that matches no other gets a group of its own.
- rule: one sentence that covers every member, someone could follow it on a different project. Write it as an instruction to the AI assistant, in the imperative: "Put the result first, then the details", "結論先講，再給細節". Not as a description of the developer ("he wants the result first"). Write it in the language the members are written in; if they mix Chinese and English, write in Chinese. No project names, people's names or file paths.
- title: the rule as a short imperative phrase of 2 to 6 words (or up to 12 Chinese characters), in the same language as rule. For example: "Result first", "結論先講".
- key: the habit in 3 to 5 English words, lowercase snake_case, different for every group. For example: result_first, plan_before_coding, reuse_existing_code.
- confidence: "high", "medium" or "low". high means the members together show it plainly; low means it rests on reading between the lines.
- moment: when the rule applies. One of: "plan" (before planning, estimating or opening tickets), "build" (before writing code or drawing a screen), "deliver" (before reporting, handing over, writing to a client or claiming something is done), "deploy" (before touching a production system or its data), "always" (at any time). Pick the single best fit; "always" when none stands out.

Only group findings when following one means following the other. Two habits that are merely related, or that happen in the same situation, stay apart.

Each line below is one finding: index | part it was found in | frequency (messages in that part backing it) | confidence | rule | trigger ("-" when unknown)

<findings>
${findings.map(mergeLine).join('\n')}
</findings>
`;
}
