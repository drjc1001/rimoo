import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_OVERHEAD_TOKENS, OUTPUT_PER_INPUT, estimateChunkTokens, estimateTokens } from './tokens.ts';

test('estimateTokens: CJK characters weigh about 1.6, others about 0.34', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcdefghij'), 3); // 10 × 0.34 = 3.4
  assert.equal(estimateTokens('你好世界'), 6); // 4 × 1.6 = 6.4
  assert.equal(estimateTokens('merge 好了'), 5); // 6 × 0.34 + 2 × 1.6 = 5.24
  assert.equal(estimateTokens('ｆｕｌｌ'), 6); // full-width forms count as CJK: 4 × 1.6
  assert.equal(CALL_OVERHEAD_TOKENS, 500);
});

test('estimateChunkTokens: prompt + call overhead + output share', () => {
  assert.equal(OUTPUT_PER_INPUT, 0.45);
  assert.equal(estimateChunkTokens(10_000), 10_000 + 500 + 4_500);
  assert.equal(estimateChunkTokens(0), 500);
});
