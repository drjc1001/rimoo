---
id: T-019
title: 發 npm 0.2.0：外掛與分享圖卡上線（LinkedIn 貼文 9/29 要用）
type: release
source: 1001_Social_post 那邊的 session 轉達 Jasper（2026-09-28）：npm 還是 0.1.0，沒有圖卡、沒有 `--lang`
priority: P0
created: 2026-09-28
---
## 需求
- npm 上的 0.1.0（2026-09-27）沒有 T-014 外掛、T-018 圖卡、`--lang`、`--card-size`。外掛的 `npx -y rimoo@latest` 也抓到舊版。
- 版號 0.2.0（新功能，不是修 bug）：`package.json` 與 `plugin/.claude-plugin/plugin.json` 同步（T-014 定的規矩；`src/plugin.test.ts` 會驗兩邊一致）。
- 發佈由 Jasper 在真實終端機做（passkey 2FA，子程序沒 TTY 只會 EOTP）。

## 被誰擋住
- 無（main 已含 PR #3、#4、#5）。

## 驗收
- `npm pack --dry-run` 列出 `dist/card.js`、`dist/translate-template.js`；沒有 `plugin/`、`tickets/`、`rimoo-out/`。
- 測試全綠；PR merge 後 Jasper `npm publish --access public`。
- 發佈後：`npm view rimoo version` 是 0.2.0；乾淨目錄 `npx rimoo@0.2.0 analyze --help` 列出 `--lang` 與 `--card-size`；`claude plugin update rimoo@rimoo` 後 `claude plugin list` 顯示 0.2.0。

## 自驗 2026-09-28（Fable）
- 版號兩邊都 0.2.0；build exit 0；測試 147／147。
- `npm pack --dry-run`：21 個檔、45.4 kB，含 `dist/card.js`、`dist/translate-template.js`；沒有 `plugin/`、`tickets/`、`rimoo-out/`。
- 發佈與發佈後三項驗收等 Jasper 發完再補。
