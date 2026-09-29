---
id: T-023
title: 跑完印「接下來」三步；SKILL.md 開頭三行講這是什麼、怎麼用
type: feature
source: Jasper 2026-09-29「整體步驟不清楚，應該一步一步引導使用者」；拍板 1 ok
priority: P1
created: 2026-09-29
---
## 需求
- 現況：裝完只印一行路徑；`/my-workstyle` 打下去使用者不知道發生什麼事、下一步是什麼。
- CLI：匯出與安裝那段之後固定印一段（規則是中文就印中文，否則英文，沿用 `exports.ts` 的 `TEXT` 雙語做法）：
  ```
  Next
  1. In a new Claude Code session, type /my-workstyle: Claude follows these rules for that session.
  2. To have them on all the time in one project, copy rimoo-out/CLAUDE.md into that project's root folder.
  3. rimoo-out/share.png is ready to post; share.txt is the text version.
  ```
  沒裝 skill 時第 1 行改成「Run again with --install-skill, then type /my-workstyle …」。路徑用實際 outDir。
- SKILL.md（`renderSkillMd`）表頭之後加三行：這份是什麼（從幾則歷史抽出的規則）、怎麼用（新對話打 `/my-workstyle`；帶參數的用法等 T-025）、更多在哪（`rules.md`，T-024）。同樣雙語。
- 外掛 SKILL.md：安裝問句回 yes 之後，把上面「接下來」三步照 CLI 印的講給使用者；回 no 也講 1、2 兩步的替代做法。

## 被誰擋住
- 無。跟 T-022、T-024 同一條分支 `T-023-skill-onboarding`。

## 驗收
- `node --test`：CLI 輸出含 `Next` 段三行、路徑正確、裝與沒裝兩種措辭；SKILL.md 含用法三行。
- Jasper 打 `/my-workstyle` 第一眼就看到「怎麼用」。
