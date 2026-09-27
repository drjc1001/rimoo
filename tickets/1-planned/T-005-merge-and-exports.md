---
id: T-005
title: 合併各段 findings、排名、產出 report.md／CLAUDE.md／SKILL.md／workstyle.json
type: feature
source: rimoo_mvp_spec.md §8、§10、§20 需求 7
priority: P0
created: 2026-09-27
---
## 需求
- 合併：再呼叫一次 `claude -p`，把所有 findings 丟進去做同義規則合併、證據數加總、依頻率與專案數排名；超過一次塞不下就兩層合併。
- `report.md`：開頭照 §8（分析了 N 則、M 個專案、前十條），後面七類逐條附原句與日期。**原句只出現在 report.md**。
- `CLAUDE.md`：只放抽象規則，不引原句、不寫路徑與專案名。
- `SKILL.md`：可攜版（frontmatter name／description ＋ 規則），格式仿 `~/.claude/skills/jasper-taste/SKILL.md` 的鐵則段。
- `workstyle.json`：§10 的結構，每類一個字串陣列，snake_case。
- 終端最後印 §8 那段摘要。
- 測試：用 fixture findings 驗四種輸出的格式。
## 被誰擋住
- T-004。
## 驗收
- 四個檔案都在 `rimoo-out/`；workstyle.json 七類都有值。
- **並排表**：Rimoo 前十條 vs `jasper-taste` 十條鐵則，一行一對，附各自證據數；Jasper 看表裁，我只報回收幾條、漏哪幾條。
