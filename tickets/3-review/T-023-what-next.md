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

## 自驗 2026-09-29（Opus）
- 改的檔：`src/exports.ts`（`TEXT.skill` 用法三行、`TEXT.next`、`formatNext`，中英雙語）、`src/analyze.ts`（安裝步驟後印 Next；有 share.png 印 png，沒有印 share.html；語言跟規則語言）、`src/install.ts`（`installed` 改成只印資料夾，拿掉 `claudeMd`、`hint` 兩行）、`README.md`「Use it」改三步。
- 測試：`npm run typecheck` exit 0；`npm test` exit 0，164 個全過。analyze 測試涵蓋：英文與中文兩種 Next、裝／已裝／沒裝／exists／安裝失敗的第 1 行、沒 Chrome 時第 3 行是 share.html、有 Chrome 時是 share.png。
- 跟票不同、請裁：
  1. 拿掉兩行重複：原本的 `Pass --install-skill to add these rules…` 提示、`CLAUDE.md: copy …` 那行、沒 Chrome 時的 `Open share.html … screenshot` 那行，都跟 Next 講同一件事，已刪。`Could not make share.png: 原因` 保留。
  2. `Installed …` 改成只印 `Installed ~/.claude/skills/my-workstyle/`，「新對話打 /my-workstyle」交給 Next 第 1 行講，不重複。
  3. exists 時第 1 行照票寫「加上 --install-skill 再跑一次」，但上一行已說要加 `--force-skill` 或 `--skill-name`，照第 1 行做會再碰到 exists。建議之後改成 exists 專用措辭。
- 沒做：Jasper 打 `/my-workstyle` 第一眼看到用法（要他本機裝完看）。

## 審後自驗 2026-09-29（Fable）
- typecheck 0；測試 164／164；`claude plugin validate --strict` 外掛與 skills 都過。
- 補一處：已裝了不同規則時，「接下來」第 1 行改講 `--force-skill`／`--skill-name`（原本會叫人再加 `--install-skill`，等於繞圈）；中英各一句，測試對應改。
- 真機：用凍結輸入重出 `rimoo-out/`（零重跑）→ `--install-skill --force-skill` 換掉 147 條版 → `~/.claude/skills/my-workstyle/` 現在是 SKILL.md（用法三行＋12 條＋「全部規則見 rules.md」）與 rules.md（147 條）；這個對話當場就看到新的 `/my-workstyle`。
- 沒驗：外掛「最後一行是安裝問句」要 Jasper 在對話裡 `/rimoo` 看（0.3.0 發了之後）。
