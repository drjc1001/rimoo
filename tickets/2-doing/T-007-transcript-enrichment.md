---
id: T-007
title: 逐字稿補強：從 ~/.claude/projects 補上「Claude 前一句說了什麼」
type: feature
source: rimoo_mvp_spec.md §5「Optional later input」；079 extract_turns.py
priority: P2
created: 2026-09-27
---
## 需求
- 移植 `079_wenchi_cram_school/analyze/taste/extract_turns.py`：讀 `~/.claude/projects/**/*.jsonl`，只留人打的 user turn（origin.kind＝human 或 promptSource＝typed），用 sessionId＋時間戳對回 history 的每一則，附前一則助手訊息前 500 字元。
- 目錄存在就自動開，`--no-transcripts` 關；對不到的則照舊、不報錯。
- chunks 多一欄 `prev_assistant`，prompt 模板改成「他在回應什麼」；findings 的 `trigger` 欄因此才有料。
- 本機 `~/.claude/projects` 現在有 40 個專案目錄（history 有 61 個），對得到的比例要印出來。
## 被誰擋住
- T-005 跑通；拍板點 3（要不要進 MVP）。
## 驗收
- 印出對到比例（本機 X%）；有 prev_assistant 的 findings，trigger 欄非空的比例明顯高於沒有的（附兩個數字）。
