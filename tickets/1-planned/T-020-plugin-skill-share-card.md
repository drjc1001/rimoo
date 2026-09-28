---
id: T-020
title: 外掛 SKILL.md 補圖卡：跑完要講 `share.png`，並問要不要英文標題
type: fix
source: Fable 準備 Jasper 自測時發現（2026-09-28）：SKILL.md 寫在 T-018 之前
priority: P2
created: 2026-09-28
---
## 需求
- `plugin/skills/rimoo/SKILL.md` 第 5 步的檔案清單沒有 `share.html`／`share.png`，使用者不知道有圖；也沒有 `--lang en`，圖卡永遠是規則原本的語言。
- 改法：第 3 步的三選一後面多一問「圖卡標題要英文嗎」（預設不翻，要就在第 4 步加 `--lang en`）；第 5 步列出 `share.png`（沒 Chrome 時說 `share.html` 自己截）。
- 版號：外掛 `version` 釘住才會更新，所以要 0.2.1，`package.json` 同步、npm 也再發 0.2.1（`src/plugin.test.ts` 要求兩邊一致）。發佈前 `npm login`＋`npm whoami`。

- 另補：SKILL.md 要寫明「分析指令只跑一次；中途停了就給 log，不要自己重跑」。2026-09-28 自測時，我給 Jasper 的測試 2 指令少了 `--sample 2`，`--yes` 一帶就變全跑，多跑了 5 段才被我停掉；finished chunks 有留，沒白費，但指令要先自己對過旗標。

## 被誰擋住
- 無。等 Jasper 自測 0.2.0 的結果一起改。

## 驗收
- `src/plugin.test.ts` 多斷言 SKILL.md 提到 `share.png` 與 `--lang en`。
- Jasper 在對話裡打 `/rimoo` 跑完看得到圖的路徑。
