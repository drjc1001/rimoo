---
id: T-008
title: README、GitHub repo、npm 發佈 `rimoo`
type: docs
source: rimoo_mvp_spec.md §12、§13
priority: P2
created: 2026-09-27
---
## 需求
- README：§13 的四句（名字、tagline、一句說明、`npx rimoo analyze`）＋隱私一段（全部本機、只呼叫你自己的 Claude Code、貼上內容不送出）＋輸出檔案說明。不做 landing page。
- **「會花多少」放在安裝指令旁邊，不藏在後面**（Jasper 2026-09-27）：用真實例子講（約 24,000 則、一年的 history → 24 次呼叫、約 180 萬 tokens，走你自己的 Claude Code 訂閱），建議先 `--sample 2` 看實際用量再全跑；工具本身跑之前也會印估算。實測（2026-09-27，Fable 5.1）：一段約 11 萬 tokens、8 分鐘、定價換算 3.4 美元，輸出佔三成且單價高；README 要寫「模型跟你的 Claude Code 預設走，`--model sonnet` 便宜快很多，`--concurrency 4` 可同時跑 4 段」，數字用小樣實測的，不用估的。
- LICENSE（MIT，Jasper 定）。`package.json` 的 name＝`rimoo`（2026-09-27 npm 404，沒人用）、`files` 只含 dist。
- `npm publish` 前在乾淨目錄 `npx rimoo analyze` 跑一次。
## 被誰擋住
- Jasper：GitHub 帳號／組織、授權條款、發佈時間。
## 驗收
- 另一台或乾淨目錄 `npx rimoo analyze` 能跑到 T-001 的統計；npm 頁面看得到 README。
