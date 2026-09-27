---
id: T-001
title: CLI 骨架＋讀取 history.jsonl＋基本統計（`npx rimoo analyze` 第一次能跑）
type: feature
source: rimoo_mvp_spec.md §5、§6、§20 需求 1～3
priority: P0
created: 2026-09-27
---
## 需求
- `git init`（本地）。TypeScript／Node 22 的 npm 套件 `rimoo`，bin `rimoo`，子命令 `analyze`；零執行期相依（參數解析自己寫），測試用內建 `node --test`。
- 找檔：`$HOME/.claude/history.jsonl`（Windows 用 `%USERPROFILE%`），`--history <path>` 可覆寫。找不到或是空檔 → 訊息講清楚檔案應該在哪、離開碼 1；不要靜默印 0。
- 逐行解析；壞掉的 JSON 行計數並印出來，不吞掉。欄位只有 `display`／`pastedContents`／`timestamp`（毫秒）／`project`／`sessionId`，缺欄位的行算壞行。
- 去完全重複（display＋timestamp 相同）。
- 統計：總則數、專案數、日期範圍、每專案則數、每月則數。終端印摘要，並寫 `rimoo-out/stats.json`。
- 測試：fixture jsonl（含壞行、重複行、Windows 路徑）全綠。
## 被誰擋住
- 無。
## 驗收
- 在 Jasper 本機跑出的數字＝README 基準表：24,030 行、重複 1、61 專案、2025-11-01～2026-09-27。
- 指到不存在的檔 → 離開碼 1 且訊息可讀；fixture 測試全綠。
