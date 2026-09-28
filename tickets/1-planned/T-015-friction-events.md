---
id: T-015
title: 摩擦事件：分段分析多標一個欄位（類別、證據、信心），不另外多跑一遍
type: feature
source: docs/rimoo_friction_skill_recommendation_spec.md（GPT 討論，2026-09-28）票 1；Fable 對照現況後改法
priority: P2
created: 2026-09-28
---
## 需求
- 「摩擦事件」＝使用者糾正、改方向、限制、重講一次 AI 本來能自己做對的事。現有的分段 `claude -p` 分析已經讀到每一則，多要一個輸出欄位 `friction`：`{ category, promptIds, confidence }`，不新開一個 pass（全量約 217 萬 tokens，多一遍就翻倍）。
- 分類表用 spec §5 的 25 類起手（communication／planning／implementation／testing／debugging／workflow），可擴充；`validateFindings` 驗類別在表內。
- 有 `--with-transcripts` 時「Claude 前一句」已經在 prompt 裡，判定會準很多；沒有時只靠使用者那句，信心要低。
- 產出 `friction-events.json`（每段一份併起來），給 T-016 用。

## 被誰擋住
- T-018 之後；T-014 merge。

## 驗收
- fixture findings 含 friction 欄位能過驗證、缺欄位不算錯（舊 findings 相容）。
- Jasper 本機 2 段小樣：抽 20 個標成摩擦的 prompt 人工看，準的比例寫進票（猜測不算結論）。
