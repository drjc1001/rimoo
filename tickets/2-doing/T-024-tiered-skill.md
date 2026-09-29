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
