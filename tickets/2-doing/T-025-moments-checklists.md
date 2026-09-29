---
id: T-025
title: 規則標「時機」，產四張清單（plan／build／deliver／deploy），`/my-workstyle plan` 只載那張
type: feature
source: Jasper 2026-09-29「jasper-taste 有 plan、mockup、prod，為何 /my-workstyle 沒有」；拍板 1～3 ok
priority: P1
created: 2026-09-29
---
## 需求
- jasper-taste 的第二層＝四張「什麼時候用」的清單。Rimoo 的規則已有分類與觸發時機，缺的是分到四個時機。
- 合併步驟（`merge-template.ts`）每條規則多一個欄位 `moment`：`plan`（規劃、開票、估算前）、`build`（動手寫程式、畫畫面前）、`deliver`（交報告、對外文字、宣稱完成前）、`deploy`（上正式環境、動正式資料前）、`always`（隨時）。單選；`validateMerged` 驗在表內，缺的視為 `always`（舊 merged.json 相容）。名字用通用的，不用 mockup／prod。
- 匯出：`checklists/plan.md`、`build.md`、`deliver.md`、`deploy.md`（各時機的規則，打勾清單格式，仿 jasper-taste 的 checklists；`always` 的不進清單，留在 SKILL.md／rules.md）。閘 `all`。
- SKILL.md：表頭加 `argument-hint: "[plan|build|deliver|deploy]"`；用法三行改成「不帶參數載前 12 條；`/my-workstyle plan` 只讀 `checklists/plan.md` 逐項照做」；正文加一段給 Claude 的指示：`$ARGUMENTS` 是四個之一就讀對應清單、其他文字當任務。
- 安裝：整個資料夾（含 `checklists/`）。外掛 SKILL.md 的檔案清單與「接下來」對應改。
- 版號 0.3.0（package、lock、plugin），Jasper 發 npm。
- Jasper 這份要重合併一次才有 `moment`（7 次呼叫約 3 美元定價，他點頭才跑）；新使用者不多一次呼叫。需要一個「只重做合併」的旗標：`--remerge`（不重跑分段）。

## 被誰擋住
- T-023、T-024 merge。

## 驗收
- `node --test`：合併 fixture 含 moment 能過、缺 moment 當 always；四張清單各只含對應時機；SKILL.md 有 argument-hint 與指示；安裝含 checklists。
- Jasper 本機：重合併後 `/my-workstyle plan` 只出現規劃類；`/my-workstyle` 不帶參數是前 12 條。
