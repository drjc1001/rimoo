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
- 測試：用假的 `claude` 可執行檔（回固定 JSON）跑整條路徑；證據驗證的 fixture。
## 被誰擋住
- T-003。
- Jasper 點頭用訂閱額度跑全量（約 23 次呼叫）。
## 驗收
- `--sample 2` 在本機產出 2 份 findings，每份 ≥ 10 條、每條 ≥ 2 則原句且 id 都查得到。
- 中途 Ctrl-C 再跑會從沒做完的段接續。
