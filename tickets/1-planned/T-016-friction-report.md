---
id: T-016
title: 摩擦報告 `friction-report.md`：次數、專案數、每月趨勢；逐字稿窗內用實測 token 與時間
type: feature
source: docs/rimoo_friction_skill_recommendation_spec.md 票 2～5；原 T-013 提案換名字與理由
priority: P2
created: 2026-09-28
---
## 需求
- 從 `friction-events.json` 聚成類別：次數、專案數、日期範圍、每月趨勢、三句例句（過閘）。
- 代價分兩層、標清楚：逐字稿窗內（本機 2026-06-20 起）用每次糾正到下一則人打的訊息之間的助手 usage 與時間戳＝「觀察值」；窗外只給次數，不估。**不用 spec 的 40～70% 可避免比例**（沒依據）；T-012 量到的每次 3.6 分鐘、25,600 output tokens 是這台的基準，寫進 README 當例子，不當常數。
- 金額用 API 定價、講「API-equivalent」，訂閱用戶不是真的省這筆錢（spec §9 同意）。
- `redo_cost.py`（T-012 手工腳本）的量法搬進 TypeScript。

## 被誰擋住
- T-015。

## 驗收
- Jasper 本機：報告的前三類與 T-012 表的數字對得上（268 次／三個月量級）；圖表一張（每月次數）附在票裡他看得懂。
