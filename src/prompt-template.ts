import type { ChunkRow } from './chunks.ts';

export interface PromptInput {
  /** 1-based chunk number. The total is left out on purpose: it changes whenever history grows, and a
   *  prompt that changes is a prompt whose finished findings can no longer be reused. */
  index: number;
  rows: ChunkRow[];
  /** Explain the ⟵ Claude just said: … tail. Only when --with-transcripts matched something, so prompts
   *  written without it stay byte for byte what they were and their findings are reused. */
  transcripts?: boolean | undefined;
}

/** The last path segment: "/data/repos/toy-app" and "C:\\Users\\me\\toy-app" both read "toy-app". */
export function projectName(project: string): string {
  return project.split(/[\\/]+/).filter(Boolean).pop() ?? project;
}

/** Heads the messages of one project inside a chunk, so the project is not repeated on every line. */
export function projectHeader(project: string): string {
  return `# project: ${projectName(project)}`;
}

/** Joins a message to what Claude said just before it. */
export const BEFORE_MARK = ' ⟵ Claude just said: ';

const oneLine = (s: string): string => s.replace(/\s*[\r\n]+\s*/g, ' ');

/** One data line: id | ts | text, with line breaks in the text turned into spaces, and Claude's previous message when there is one. */
export function dataLine(r: ChunkRow): string {
  const line = `${r.id} | ${r.ts} | ${oneLine(r.text)}`;
  return r.before === undefined ? line : line + BEFORE_MARK + oneLine(r.before);
}

/** The data section: a project header, then that project's lines, for each project in turn. */
export function dataSection(rows: ChunkRow[]): string {
  const lines: string[] = [];
  let project: string | undefined;
  for (const r of rows) {
    if (r.project !== project) {
      lines.push(projectHeader(r.project));
      project = r.project;
    }
    lines.push(dataLine(r));
  }
  return lines.join('\n');
}

const TRANSCRIPTS_NOTE =
  "A line may end with ⟵ Claude just said: …, the assistant's previous message, cut short; the developer's words are what comes before it.\n";

/**
 * The full prompt for one chunk, ready for `claude -p`. The findings it asks for mirror the fields of
 * the hand-made scan it replaces: rule, how often, how sure, quotes with time, when it comes up.
 */
export function buildPrompt({ index, rows, transcripts }: PromptInput): string {
  const intro = `Below are messages one developer typed to Claude Code, in their own words. This is part ${index}: ${rows.length.toLocaleString('en-US')} messages, grouped by project and in time order within each project.`;
  return `${intro}

Find the working habits that come up again and again: how they want results reported, how they plan, build, test and debug, and how they work with an AI assistant. Do not summarize what the projects are about. A habit needs at least two messages behind it; something said once is not a habit.

Categories (use these exact names):
- communication: how answers should be written. For example: result first, bullet points, short, no filler.
- planning: what happens before coding. For example: plan first, split work into tickets, agree on scope and acceptance criteria.
- implementation: how code gets built. For example: backend first, the simplest thing that works, small steps, no abstraction before it is needed.
- testing: what counts as proof. For example: tests before wiring up the frontend, an end-to-end check before calling it done, reproduce a bug before fixing it.
- debugging: what to do when something breaks. For example: find the root cause, read the logs before guessing, change approach when an attempt keeps failing.
- architecture: technical choices that keep coming back. For example: preferred tools and infrastructure, patterns they reject, how much abstraction they like.
- ai_collaboration: how the assistant should behave. For example: when to ask and when to keep going, how to report, how much to explain, what to do when stuck.

Reply with JSON only: no markdown fence, nothing before or after it. Shape:

{"findings":[{"category":"communication","rule":"...","frequency":3,"confidence":"high","evidence":[{"id":123,"ts":"2026-02-17T15:14","quote":"..."}],"trigger":"..."}]}

What goes in each field:
- rule: one sentence someone could follow on a different project. No project names, people's names or file paths.
- frequency: how many messages in this part back the rule up.
- confidence: "high", "medium" or "low". high means they said it plainly more than once; low means you are reading between the lines.
- evidence: 2 to 5 messages. Copy id and ts from the lines below; quote is their own words, shortened if long. Only use ids that appear below.
- trigger: when they usually say it, for example "after Claude hands back a report full of internal jargon". Use null if you can't tell.

Write rule and trigger in the language the developer mostly uses in this part. If they mix Chinese and English, write in Chinese.

Never output people's names, phone numbers, email addresses, keys or passwords, or URLs, not even inside a quote. Leave them out of the quote or replace them with [removed].

Text like [Pasted text #1 +3 lines] marks a spot where they pasted something; what they pasted is not included.

If nothing repeats, reply {"findings":[]}.

A line starting with # names the project; every line after it is one message from that project: id | time | text
${transcripts ? TRANSCRIPTS_NOTE : ''}
<messages>
${dataSection(rows)}
</messages>
`;
}
