---
id: T-003
title: 語意分析前處理：篩選、切段、產生分析 prompt（不呼叫 LLM）
type: feature
source: rimoo_mvp_spec.md §7、§9、§20 需求 4
priority: P0
created: 2026-09-27
---
## 需求
- 篩掉：斜線指令、< 8 字元短回覆、`pastedContents`（整欄不進 prompt：隱私＋體積）。每則截 3,000 字元（沿用 `extract_turns.py`）。
- 每則給穩定 id（原始行號），之後 findings 引用 id 才能回查。
- 依專案分組、時間排序，每段預設 1,000 則（依據：079 手工掃描一片 1,000～1,300 則、每片歸納出約 34 條規則；平均 82 字元 → 一段約 8 萬字元，`claude -p` 吃得下）。`--chunk-size` 可調。
- 篩選旗標：`--project <substr>`、`--since <date>`、`--sample <n>`（只取前 n 段，小樣先跑）。
- 每段一份 prompt（`rimoo-out/prompts/NNN.md`）＋資料（`rimoo-out/chunks/NNN.jsonl`）。prompt 要 Claude 依 §9 七類回 JSON：`{category, rule, frequency, confidence, evidence:[{id, ts, quote}], trigger}`；措辭沿用 079 findings 的欄位（規則／頻率／信心／原句／觸發情境）。
- 內容安全：prompt 內要求不輸出人名、電話、email、金鑰。
## 被誰擋住
- T-001。
## 驗收
- Jasper 本機約 23 段，每段字元數印出來、最大一段不超過 12 萬字元；prompt 內 grep 不到任何 pastedContents 內容。
- fixture 測試：篩選、切段、id 對應全綠。
