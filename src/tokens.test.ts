import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALL_OVERHEAD_TOKENS, estimateTokens } from './tokens.ts';

test('estimateTokens: CJK characters weigh about 1.3, others about 0.28', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('abcdefghij'), 3); // 10 × 0.28 = 2.8
  assert.equal(estimateTokens('你好世界'), 5); // 4 × 1.3 = 5.2
  assert.equal(estimateTokens('merge 好了'), 4); // 6 × 0.28 + 2 × 1.3 = 4.28
  assert.equal(estimateTokens('ｆｕｌｌ'), 5); // full-width forms count as CJK: 4 × 1.3
  assert.equal(CALL_OVERHEAD_TOKENS, 24_000);
});
