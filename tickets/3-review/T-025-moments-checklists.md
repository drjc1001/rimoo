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

## 自驗 2026-09-29（Opus）
結論：做完，型別檢查與測試都過（exit 0），測試 164 → 172 個全綠。沒有執行真的 claude，沒碰 git、`~/.claude/skills/`、`~/.rimoo/`、`rimoo-out/`。

改了哪些檔：
1. `src/merge-template.ts`：合併提示多 `"moment":"plan"` 與欄位說明（照票上英文原句）。
2. `src/merge.ts`：`Moment`、`MOMENTS`、`toMoment`；`MergedRule`、`MergeGroup` 多 `moment`；解析回覆時不在表內或缺的一律 `always`；沒被分組的單條也是 `always`；讀到舊 merged.json 時缺的補成 `always`。
3. `src/exports.ts`：`renderChecklist` 與 `CHECKLIST_MOMENTS`；`EXPORT_FILES` 多四張 `checklists/*.md`，閘都是 `all`，寫檔前先建資料夾；SKILL.md 表頭加 `argument-hint`、用法那行改寫、前 12 條後加「When invoked with an argument」段；Next 第 1 行改寫（exists／notInstalled 不動）。
4. `src/install.ts`：每個檔先建自己的資料夾；same／exists／force 比對涵蓋清單。
5. `src/analyze.ts`：`remerge` 只讓合併重做；安裝集合收 `checklists/*`；Saved 那行四張清單只列一次 `rimoo-out/checklists/`。
6. `src/args.ts`：`--remerge` 旗標與 HELP 一行。
7. `src/format.ts`：「Findings unchanged…」那句的提示從 `--force` 改成 `--remerge`（`--force` 會連分段一起重跑，花錢；票外的一句，理由是指到對的旗標）。
8. `plugin/skills/rimoo/SKILL.md`：第 5 步檔案清單加 `~/.rimoo/checklists/`；第 6 步原本就照印 Next，沒改。
9. `README.md`：What you get 加清單一行、Use it 的第 1 行與安裝句、Options 加 `--remerge`。
10. 版號 0.3.0：`package.json`、`plugin/.claude-plugin/plugin.json`、`package-lock.json`（只動版號兩行）。
11. 測試：`merge.test.ts`、`fake-claude.test.ts`（假合併回覆帶 deliver／" Plan "／亂寫／不給）、`exports.test.ts`、`install.test.ts`、`analyze.test.ts`、`args.test.ts`、`plugin.test.ts`、`card.test.ts`（fixture 補欄位）。

證據：
- `npm run typecheck` → TYPECHECK=0；`npm test` → TEST=0，172 pass、0 fail。
- `npm pack --dry-run`：version 0.3.0、total files 22。

沒做到或不確定：
1. `/my-workstyle plan` 在 Claude Code 裡真的只讀那張清單，要 Jasper 本機驗（這裡不能跑真的 claude）。不帶參數時 `$ARGUMENTS` 會被換成空字串，那段指示應該不會觸發，但沒實測。
2. Jasper 現有的 `~/.claude/skills/my-workstyle/` 的 SKILL.md 跟新版不同（用法那行變了），重合併後安裝會回「已經裝了另一版」，要加 `--force-skill`。
3. 重合併（`--remerge --yes`）約 7 次呼叫，等他點頭才跑。

## 審後自驗 2026-09-29（Fable）
- typecheck 0；測試 172／172；`claude plugin validate --strict` 過；`npm pack --dry-run` 0.3.0、22 檔。
- 真機零花費：用凍結輸入重出 `rimoo-out/`，四張清單有產出（現在的 merged.json 沒有 moment，全部當 always，所以四張都是「這個時機還沒有規則」那一句）；SKILL.md 有 `argument-hint`、用法提到 plan／build／deliver／deploy、「When invoked with an argument」段、12 條。
- Opus 兩處票外改動都留：合併沿用時的提示改指 `--remerge`（`--force` 會連分段重跑，指錯很貴）；Saved 那行清單只列資料夾。
- 還沒做：Jasper 那份 `--remerge`（7 次呼叫約 3 美元定價）等他點頭；跑完 `--install-skill --force-skill` 換掉現在裝的版本；他在對話裡 `/my-workstyle plan` 看是不是只讀那張。
