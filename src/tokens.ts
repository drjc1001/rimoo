/**
 * Rough token counts for Claude, so people know what an analysis costs before it runs.
 *
 * Rates come from three `claude -p --output-format json` calls on 2026-09-27, reading the usage field:
 * 2,000 characters of mostly-Chinese text cost 2,118 tokens, 2,000 characters of English cost 562,
 * and an empty call carried 23,567 tokens of Claude Code's own system prompt (mostly cache reads).
 * Solved per character: about 1.3 tokens per CJK character, about 0.28 per other character.
 * The first real run reports the measured numbers; this is only for the estimate shown up front.
 */
export const TOKENS_PER_CJK_CHAR = 1.3;
export const TOKENS_PER_OTHER_CHAR = 0.28;
/** What one `claude -p` call carries before the prompt itself, on a default Claude Code setup. */
export const CALL_OVERHEAD_TOKENS = 24_000;

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
