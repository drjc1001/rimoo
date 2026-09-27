---
id: T-004
title: 用本機 `claude -p` 跑每段分析、驗證證據、可續跑
type: feature
source: rimoo_mvp_spec.md §7、§20 需求 5～6
priority: P0
created: 2026-09-27
---
## 需求
- 偵測 PATH 上的 `claude`（本機 2.1.283 有 `-p`／`--output-format json`）；沒有 → 印說明並退回 `--prepare-only`（只產 T-003 的 chunks＋prompts，讓使用者在 Claude Code 裡自己跑）。
- 跑之前印估算（段數 × 每段字元數）並問 y/N（`--yes` 跳過）。本機全量約 23 段、每段約 8 萬字元；先 `--sample 2` 試兩段，OK 才全量。
- 預設一次跑 1 段，`--concurrency` 最多 4（依據：079 掃描同時開 4 個子代理沒被限流）。
- 解析回傳 JSON；每條 finding 的 evidence id 必須存在於該段，不存在的丟掉並印丟掉幾條（不靜默）。存 `rimoo-out/findings/NNN.json`。
- 續跑：已有 findings 的段跳過；`--force` 重跑。
- **實際用量要讓使用者看到**（Jasper 2026-09-27 提的：不講清楚花費，用了覺得沒用會被罵）：每段跑完讀 `claude -p --output-format json` 回傳的 `usage`（input＋cache_creation＋cache_read＋output）與 `total_cost_usd`，印該段實際 tokens 與定價換算；`--sample` 跑完印「N 段實際 X tokens → 全 M 段外推 Y，manifest 估算是 Z」再問要不要全跑；全部跑完在終端與 `rimoo-out/findings/usage.json` 留總計。
- 估算（`tokens.ts`）與實測差超過三成，就把換算率改成實測值並記在票裡。
- 測試：用假的 `claude` 可執行檔（回固定 JSON）跑整條路徑；證據驗證的 fixture。
## 被誰擋住
- T-003。
- Jasper 點頭用訂閱額度跑全量（約 23 次呼叫）。
## 驗收
- `--sample 2` 在本機產出 2 份 findings，每份 ≥ 10 條、每條 ≥ 2 則原句且 id 都查得到。
- 中途 Ctrl-C 再跑會從沒做完的段接續。

## 自驗 2026-09-27（Opus）
結論：程式與測試都做完，真的 `claude` 一次都沒呼叫（測試全用假的，真實資料只跑到 `--prepare-only`）。第一次真跑（`--sample 2`）要等 Jasper 點頭，由主代理執行。

### 1. 指令結果
- `npm test`：80／80 綠（原 53＋新 27）。`npm run typecheck` 綠、`npm run build` 綠。
- 既有測試只改了常數：`tokens.test.ts` 的 24,000 → 1,700，另外 `chunks.test.ts` 兩行也寫死 `2 * 24_000`，一併改成 `2 * 1_700`（不改會紅）。

### 2. 假 claude 整條路徑（`analyze --yes`，fixture 6 則、`--chunk-size 2`）
假 claude 每段回三條 finding：一條合法（含一個真 id、一個不存在的 id、400 字的引句）、一條 confidence 亂寫、一條只有不存在的 id。
```
Analyze with Claude Code
  2 chunks to run · about 5,129 tokens (estimate)
  chunk 1/2 · 1,160 tokens · $0.01 · 4 s · 1 finding (2 dropped, 2 quotes dropped)
  chunk 2/2 · 1,160 tokens · $0.01 · 4 s · 1 finding (2 dropped, 2 quotes dropped)

Analyzed 2 chunks this run
  2 chunks finished: 2,320 tokens · $0.03 · 2 findings (4 dropped, 4 quotes dropped)
    = 20 input + 200 cache writes + 2,000 cache reads + 100 output
  Cost is Claude Code's own figure at API prices; on a Claude subscription it counts toward your plan's usage instead.

Saved rimoo-out/stats.json, rimoo-out/repeated.json, rimoo-out/manifest.json and rimoo-out/findings/
```
`findings/001.json`（引句 300 個 x 省略）：
```json
{
  "chunk": 1,
  "promptSha256": "eee7c5799ec3e4627742a6aa152c8a27f7c1bf2213f44e81e56112043370d5de",
  "model": "claude-fake-1",
  "usage": { "input": 10, "cacheCreation": 100, "cacheRead": 1000, "output": 50, "total": 1160 },
  "costUsd": 0.0125,
  "durationMs": 4200,
  "findings": [
    { "category": "communication", "rule": "Put the result first", "frequency": 3, "confidence": "high",
      "evidence": [ { "id": 2, "ts": "2026-03-01T12:00", "quote": "xxx…（300 字）" } ],
      "trigger": "after a long report" }
  ],
  "dropped": { "findings": 2, "evidence": 2 }
}
```
`findings/usage.json`：
```json
{ "chunksRun": 2, "chunksSkipped": 0, "chunksFailed": [],
  "tokens": { "input": 20, "cacheCreation": 200, "cacheRead": 2000, "output": 100, "total": 2320 },
  "costUsd": 0.025, "durationMs": 8400, "findings": 2, "dropped": { "findings": 4, "evidence": 4 } }
```
失敗就停（`FAKE_CLAUDE_FAIL_ON=2 --force`，離開碼 1）：
```
  chunk 1/2 · 1,160 tokens · $0.01 · 4 s · 1 finding (2 dropped, 2 quotes dropped)
  chunk 2/2 · failed: chunk 2: Claude usage limit reached

Analyzed 1 chunk this run, 1 failed
  ...
  Finished chunks are kept in rimoo-out/findings/; run the same command again to continue.
```
`--sample 1 --yes`（離開碼 0）：
```
  1 chunk used 1,160 tokens (estimate was 2,575); all 2 chunks ≈ 2,311 at this rate
  Run again without --sample to analyze the rest; finished chunks are kept.
```
其他離開碼：非 TTY 沒 `--yes` → 2（印估算＋「Pass --yes to run.」）；`--concurrency 5` → 2；`--prepare-only` → 0；找不到 `claude` → 0。都有測試。

### 3. 真實資料 `--prepare-only`（`node dist/cli.js analyze --out /tmp/rimoo-t004 --prepare-only`，離開碼 0）
```
Prepared for analysis
  21,104 prompts kept · dropped 871 slash commands, 1,737 short replies, 339 empty or paste-only
  24 chunks of up to 1,000 prompts or 120,000 characters · largest 119,966 characters
  About 1,256,123 tokens to analyze all 24 chunks (estimate; a run reports the real count)
    = 1,215,323 in the prompts + 24 calls × about 1,700 that Claude Code adds itself
  Prompts written to /tmp/rimoo-t004/prompts/ (one ready-to-run prompt per chunk)
```
全 24 段約 1.26M tokens（T-003 時是 1.79M，差在每次固定開銷 24,000 → 1,700）。大 history 提醒沒出現（門檻 200 萬 tokens 或 40 段）；用 `--chunk-size 400` 切成 53 段時會出現兩行提醒，已確認。

### 4. 不確定或偏離票的地方
1. **沒接 stdin 就只做到切段**：`runAnalyze`／`main` 沒被傳入 stdin 時，行為同 `--prepare-only`。`cli.ts` 有傳 `process.stdin`。這樣既有測試不用改，也保證既有測試不會碰到 PATH 上真的 `claude`。替代做法是在兩個既有測試加 `--prepare-only`，請主代理裁。
2. **續跑多一道檢查**：`findings/NNN.json` 多存一個 `promptSha256`，只有該段 prompt 沒變才跳過。理由：history 每天在長、段落會位移，只看檔案在不在會把舊段的結果當成新段的。代價：新加的訊息落在前面的專案時，後面的段會重跑。
3. **`usage.json` 的總計＝所有已完成的段**（這次跑的＋之前留下的），不是只算這次；另外多一個 `chunksFailed` 欄位。終端總計也是這個口徑，第一行分開寫「這次跑了幾段、之前留下幾段、失敗幾段」。
4. `model` 取回傳 `modelUsage` 的鍵（實際用的模型），沒有才用 `--model` 的值。
5. 引句欄不是字串的 evidence 也丟；id 寫成字串 `"123"` 視為 123。`dropped.evidence` 也算進「整條 finding 因此被丟」的那些引句。
6. 進度行前面縮兩格，放在「Analyze with Claude Code」標題下，跟終端其他區塊一致。
7. 票寫 `--sample` 跑完「再問要不要全跑」；照主代理指示只印提示，不再問一次。
8. 金額只到小數兩位（`$0.01`），並加一行說明：金額是 Claude Code 自己按 API 價換算的；用訂閱的話是扣方案額度，不另外收費。
9. 假 claude 的第一行寫 node 的絕對路徑，不是 `#!/usr/bin/env node`：這樣 PATH 可以只放假 claude 的目錄，真的 `claude`（`~/.local/bin`）不可能被找到。helper 檔叫 `src/fake-claude.test.ts`（不進 build；`node --test` 會載入但裡面沒有測試）。
10. Windows 的 `claude.cmd` 要走 shell，已經替每個參數加引號，讓空的 `--tools ""` 和系統提示裡的空格不會壞；沒有在真的 Windows 上試過。
11. 大 history 提醒的兩行印在「Prepared for analysis」區塊下面，中間隔一行空白。
12. 估算準不準（票：差超過三成就改換算率）要等第一次真跑 `--sample 2` 才知道，這次沒動 `TOKENS_PER_*`。

## 審後修正與真實小樣 2026-09-27（Fable）
Opus 的偏離全部接受（續跑比對 prompt 雜湊、用回傳的實際模型名、`usage.json` 算所有已完成段、`--sample` 後只印提示不再問）。Jasper 點頭後在他本機跑了 `--sample 2`（模型＝他的預設 `claude-fable-5-1`，未加 `--model`）：

| 段 | 則數 | 實測輸入 | 估算輸入（舊率） | 輸出 | 定價換算 | 秒數 | findings |
|---|---|---|---|---|---|---|---|
| 1 | 930 | 72,104 | 58,206（×1.24） | 39,218 | 3.40 美元 | 506 | 37（0 丟） |
| 2 | 1,000 | 88,331 | 77,708（×1.14） | 31,003 | 3.32 美元 | 429 | 34（0 丟） |
| 合計 | | 160,435 | 135,914 | 70,221 | 6.72 美元 | 935 | 71 |

- 證據 id 全部對得回 chunks，一條都沒丟；高信心 56／71。規則內容跟 `jasper-taste` 十條鐵則高度重合（沿用既有、講人話、字數硬上限、去技術化、交付鏈、並排對照、為何＝根因、編號逐項回、等等＝轉向、compact 前寫 memory）。
- **輸入估算偏低 18%**：校準用 Haiku 的舊分詞器，Fable 5.1 的新分詞器多約 1.2 倍。`tokens.ts` 兩個換算率 ×1.2（中文 1.6、其他 0.34），舊模型會略高估，是安全的方向。
- **原估算完全沒算輸出**：實測輸出是輸入的 0.54 與 0.35（含模型思考）。新增 `OUTPUT_PER_INPUT = 0.45`，估算＝prompt＋每次 1,700＋輸出 45%。修正後前兩段估 238,832 vs 實測 230,656（＋3.5%）；全 24 段估 2,195,784。
- **Fable 5.1 的代價**：輸出單價是輸入 5 倍，一段 3.4 美元、8 分鐘；全 24 段約 80 美元定價換算、序跑約 3.1 小時。小樣結束後多印一行「全部約多少錢、多久；`--concurrency 4` 可同時跑 4 段、`--model` 可換模型」。模型預設仍跟使用者的 Claude Code 走，不替他選。
- `usage` 多記 `thinking`（回傳的 `output_tokens_details.thinking_tokens`），總計那行印「(N of it thinking)」。這次兩段沒存到這欄（改在跑完之後），下次全跑會有。
- 我自己犯的錯：想用 `claude config get model` 查預設模型，這版沒有此子命令，被當成 prompt 開了一次對話，多燒一小筆額度。
- Windows 沒實測（`.cmd` 走 shell 加引號），留給 T-008 發佈前。
- 真實產出留在 `/data/repos/1011_Project_Rimoo/rimoo-out/findings/001.json`、`002.json`、`usage.json`（gitignore 內），T-005 用它當真實資料。
- 測試 81／81 綠、typecheck 綠、build 綠。你要自己看：`node dist/cli.js analyze --prepare-only`（不花額度）；要跑真的就 `--sample 1 --yes`。
