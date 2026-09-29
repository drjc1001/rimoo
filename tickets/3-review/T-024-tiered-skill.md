---
id: T-024
title: SKILL.md 只放前 12 條，全部規則另存 rules.md；安裝改成整個資料夾
type: feature
source: Jasper 2026-09-29「147 條太多，jasper-taste 是十條鐵則在前」；拍板 2 ok
priority: P1
created: 2026-09-29
---
## 需求
- 現況：SKILL.md 平鋪 147 條，載入就是一大坨；jasper-taste 的結構是十條鐵則＋細則另檔。
- 改法：
  - `SKILL.md`＝表頭＋用法三行（T-023）＋前 12 條（照現有排序：出現段數優先、再則數，跟 report／share 一致）＋最後一行「Full list: rules.md (147 rules)」。12 這個數：jasper-taste 十條、spec §8 十條，取一點餘裕；不超過一屏。
  - 新匯出 `rules.md`：全部規則，格式同現在的 SKILL.md 正文（編號、粗體標題、規則），閘 `all`。
  - `EXPORT_FILES` 加 `rules.md`；README「What you get」對應改。
  - 安裝（`install.ts`）從「一個檔」改成「一組檔」：`{ 'SKILL.md': …, 'rules.md': … }` 都寫進 `~/.claude/skills/<name>/`；`same`＝全部相同、`exists`＝任一不同；`--force-skill` 整組換。舊版只裝過 SKILL.md 的使用者再裝一次會是 `exists`，提示照舊。
  - 外掛 SKILL.md 檔案清單加 `rules.md`。
- 不改合併、不改分析。

## 被誰擋住
- T-023（用法三行）。同一條分支。

## 驗收
- `node --test`：SKILL.md 恰好 12 條且是排序前 12；`rules.md` 條數＝規則總數；閘有作用；安裝寫兩個檔、`same`／`exists`／`force` 三態對兩個檔都成立。
- Jasper 本機：`rimoo-out/` 用凍結輸入重出（零重跑）→ `--install-skill --force-skill` 換掉現在的 147 條版 → 新對話 `/my-workstyle` 載入的是 12 條＋用法。

## 自驗 2026-09-29（Opus）
- 改的檔：`src/exports.ts`（`TOP_SKILL_RULES = 12`、`renderSkillMd` 分層、新 `renderRulesMd`、`EXPORT_FILES` 加 `rules.md`、`GATE` `'all'`、`onWritten` 回呼）、`src/install.ts`（`installSkill({ files, name, env, force })` 整組：先全部比對再寫，`path` 改回傳資料夾）、`src/analyze.ts`（用匯出時已過閘的 SKILL.md／rules.md 安裝，不再讀檔）、`src/args.ts` 與 `README.md`（說明加 rules.md）。
- 測試：`npm run typecheck` exit 0；`npm test` exit 0，164 個全過（原 159）。新增：SKILL.md 恰 12 條且＝portable 前 12、最後一行指向 rules.md；rules.md 條數＝portable 數；rules.md 過閘；安裝兩檔、只改 rules.md 也算 exists 且 SKILL.md 沒動、舊版只有 SKILL.md 的情況、force 整組換。
- 沒做：Jasper 本機凍結輸入重出與 `--force-skill` 換掉 147 條版（要他本機跑）。
- 附帶：`--skill-name foo` 時，SKILL.md 的 `name:` 與用法行也寫成 `foo`（原本固定 my-workstyle）。

## 審後自驗 2026-09-29（Fable）
- typecheck 0；測試 164／164；`claude plugin validate --strict` 外掛與 skills 都過。
- 補一處：已裝了不同規則時，「接下來」第 1 行改講 `--force-skill`／`--skill-name`（原本會叫人再加 `--install-skill`，等於繞圈）；中英各一句，測試對應改。
- 真機：用凍結輸入重出 `rimoo-out/`（零重跑）→ `--install-skill --force-skill` 換掉 147 條版 → `~/.claude/skills/my-workstyle/` 現在是 SKILL.md（用法三行＋12 條＋「全部規則見 rules.md」）與 rules.md（147 條）；這個對話當場就看到新的 `/my-workstyle`。
- 沒驗：外掛「最後一行是安裝問句」要 Jasper 在對話裡 `/rimoo` 看（0.3.0 發了之後）。
