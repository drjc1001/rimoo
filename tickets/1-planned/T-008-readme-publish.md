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
- LICENSE（MIT，Jasper 定）。`package.json` 的 name＝`rimoo`（2026-09-27 npm 404，沒人用）、`files` 只含 dist。
- `npm publish` 前在乾淨目錄 `npx rimoo analyze` 跑一次。
## 被誰擋住
- Jasper：GitHub 帳號／組織、授權條款、發佈時間。
## 驗收
- 另一台或乾淨目錄 `npx rimoo analyze` 能跑到 T-001 的統計；npm 頁面看得到 README。
