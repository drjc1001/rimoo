---
id: T-022
title: 外掛跑完一定要問「裝成 /my-workstyle 嗎」，不要被解釋段吃掉
type: fix
source: Jasper 自測 2026-09-29：`/rimoo` 試跑（零花費）後，Claude 花了四點解釋 --sample 的語意、問要不要跑剩下 18 段，沒問安裝那句
priority: P2
created: 2026-09-29
---
## 需求
- 0.2.1 的 SKILL.md 第 6 步是「問要不要裝」，但實測 Claude 在「全部已做過、零花費」的情況下改成解釋與推銷全跑，安裝問句沒出現；使用者不知道下一步。
- 改法：第 5 步的檔案清單與第 6 步的安裝問句合成**同一則訊息的最後一行**，前面不准加別的問題；「要不要跑剩下的段」只在使用者問時才講。試跑的語意（固定前 2 段）寫一句進第 4 步，免得 Claude 自己長篇解釋。
- 另補：安裝碰到「已存在但內容不同」時，問句改成二選一「換名字／取代」，不要三段話。

## 被誰擋住
- 無。版號 0.2.2、要再發 npm（`src/plugin.test.ts` 綁版號一致）。

## 驗收
- Jasper 本機 `/rimoo` → 選 1 → 同一則訊息最後一行就是安裝問句。

## 自驗 2026-09-29（Opus）
- 改的檔：`plugin/skills/rimoo/SKILL.md`（第 4 步加試跑固定前 2 段、重跑不花錢；第 5、6 步合併：檔案清單加 `rules.md`，同一則訊息最後一行就是安裝問句、前面不准問別的、不主動提剩下的段；yes 後照印 Next 三行；已存在改二選一問句；no 講替代做法）、`src/plugin.test.ts`（新增一個測試：含 `rules.md`、`(yes / no)` 在 `Next` 之前、`--force-skill`）。
- 測試：`npm test` exit 0，164 個全過。`claude plugin validate` 沒跑（主代理跑）。
- 沒做：版號 0.2.2 與發 npm（下一張票）；Jasper 本機 `/rimoo` 選 1 看最後一行是不是安裝問句。
- 拿掉原第 5 步「試跑後說再跑 /rimoo 會接著跑剩下的段」，照票改成使用者問才講。

## 審後自驗 2026-09-29（Fable）
- typecheck 0；測試 164／164；`claude plugin validate --strict` 外掛與 skills 都過。
- 補一處：已裝了不同規則時，「接下來」第 1 行改講 `--force-skill`／`--skill-name`（原本會叫人再加 `--install-skill`，等於繞圈）；中英各一句，測試對應改。
- 真機：用凍結輸入重出 `rimoo-out/`（零重跑）→ `--install-skill --force-skill` 換掉 147 條版 → `~/.claude/skills/my-workstyle/` 現在是 SKILL.md（用法三行＋12 條＋「全部規則見 rules.md」）與 rules.md（147 條）；這個對話當場就看到新的 `/my-workstyle`。
- 沒驗：外掛「最後一行是安裝問句」要 Jasper 在對話裡 `/rimoo` 看（0.3.0 發了之後）。
