---
id: T-010
title: 把對到的「Claude 前一句」存進輸出資料夾，逐字稿被清掉後照用
type: fix
source: T-007 自驗（2026-09-27）
priority: P2
created: 2026-09-27
---
## 需求
- `~/.claude/projects/` 的逐字稿會被 Claude Code 定期清掉（本機只剩 6/20 之後、31 個 session 檔）。`--with-transcripts` 每次重讀，某個舊 session 檔一被清，對應的段 prompt 就變、雜湊對不上、findings 重跑（T-007 模擬拿掉 1 個檔 → 31 段裡 6 段變）。
- 改法：第一次對到的 `{ sessionId, text → before }` 寫進 `rimoo-out/transcripts.jsonl`；之後先讀這份，再讀還在的逐字稿補新的；已存的不因逐字稿消失而丟。
- `--force` 不清這份快取（它不是分析結果，是原始資料的備份）；另給 `--refresh-transcripts` 重讀。
## 被誰擋住
- T-007 merge。
## 驗收
- 模擬：跑一次、刪掉一個 session 檔、再跑 → 段的 prompt 雜湊全部相同。
