/**
 * Rough token counts for Claude, so people know what an analysis costs before it runs.
 *
 * Rates come from three `claude -p --output-format json` calls on 2026-09-27, reading the usage field:
 * 2,000 characters of mostly-Chinese text cost 2,118 tokens, 2,000 characters of English cost 562,
 * and an empty call on default settings carried 23,567 tokens of Claude Code's own system prompt.
 * Solved per character: about 1.3 tokens per CJK character, about 0.28 per other character on that tokenizer.
 * The first real run (Claude Fable 5.1, whose tokenizer counts about 1.2 times as many) measured 160,435 input
 * tokens where this predicted 135,914, so both rates are scaled by 1.2. Older models now get a slight
 * over-estimate, which is the safe direction. A run reports the measured numbers.
 */
export const TOKENS_PER_CJK_CHAR = 1.6;
export const TOKENS_PER_OTHER_CHAR = 0.34;
/**
 * Output as a share of input, for the answer plus the model's own thinking. Two real chunks on Claude Fable 5.1
 * (2026-09-27) gave 39,218 / 72,104 and 31,003 / 88,331, together 0.44.
 */
export const OUTPUT_PER_INPUT = 0.45;
/**
 * What one `claude -p` call carries before the prompt itself. On a default Claude Code setup that is
 * about 24,000 (its own system prompt and tool definitions). Rimoo calls it with a custom system prompt,
 * no tools and no MCP servers, which measured 1,659 on 2026-09-27 (custom system prompt, no tools, no MCP).
 */
export const CALL_OVERHEAD_TOKENS = 1_700;

const CJK = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/u;

export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (CJK.test(ch)) cjk++;
    else other++;
  }
  return Math.round(cjk * TOKENS_PER_CJK_CHAR + other * TOKENS_PER_OTHER_CHAR);
}

/** Everything one chunk is expected to cost: its prompt, the call's own overhead, and the output. */
export function estimateChunkTokens(promptTokens: number): number {
  return promptTokens + CALL_OVERHEAD_TOKENS + Math.round(promptTokens * OUTPUT_PER_INPUT);
}
