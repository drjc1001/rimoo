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
- **「會花多少」放在安裝指令旁邊，不藏在後面**（Jasper 2026-09-27）：用真實例子講（約 24,000 則、一年的 history → 24 次呼叫、約 220 萬 tokens（校準後），走你自己的 Claude Code 訂閱），建議先 `--sample 2` 看實際用量再全跑；工具本身跑之前也會印估算。實測（2026-09-27，Fable 5.1）：一段約 11 萬 tokens、8 分鐘、定價換算 3.4 美元，輸出佔三成且單價高；README 要寫「模型跟你的 Claude Code 預設走，`--model sonnet` 便宜快很多，`--concurrency 4` 可同時跑 4 段」，數字用小樣實測的，不用估的。
- LICENSE（MIT，Jasper 定）。`package.json` 的 name＝`rimoo`（2026-09-27 npm 404，沒人用）、`files` 只含 dist。
- `npm publish` 前在乾淨目錄 `npx rimoo analyze` 跑一次。
## 被誰擋住
- Jasper：GitHub 帳號／組織、授權條款、發佈時間。
## 驗收
- 另一台或乾淨目錄 `npx rimoo analyze` 能跑到 T-001 的統計；npm 頁面看得到 README。

## 自驗 2026-09-27（Opus）
結論：README 草稿與 `package.json` 的 `description` 改好；LICENSE、repository／author、npm publish、git 都沒動（留給 Jasper）。
- README 全文 100 行（上限 120）。
- 用到的實測數字與出處：
  - 約 24,000 則、一年：T-001 自驗（24,032 則、2025-11～2026-09；本機 `rimoo-out/stats.json` 現為 24,051）。
  - 24 次呼叫：T-009（24 段）、T-007 表（不開旗標 24 段）。「另加幾次小的合併呼叫」：T-005（每類一次，實測 7 次、35,292 tokens、1.06 美元）。
  - 約 220 萬 tokens：T-004 審後修正（校準後全 24 段估 2,195,784；前兩段估算對實測 +3.5%）、T-007 表（2,197,413）。本票需求寫的「180 萬」是校準前的數字，README 用校準後的。
  - 一段約 11 萬 tokens、8 分鐘、3.40 美元（Fable 5.1）：T-004 小樣第 1 段（72,104＋39,218＝111,322 tokens、506 秒、3.40 美元）。
  - 「--model sonnet 便宜快好幾倍」：沒有實測，照需求寫；待有 sonnet 小樣再補數字。
  - Windows 沒實測：T-004 審後修正。
- grep AI 腔字表（unlock／supercharge／seamless／powerful／effortless／game-changing／leverage／revolution／not just／rather than）與內部代號（Jasper、T-0xx、stage、commit、http 網址、emoji）＝0。模型名只出現在實測那句（照需求）。
- `npm pack --dry-run`：18 個檔，README.md（4.0kB）、package.json、dist/ 下 16 個 .js。

## 審後修正 2026-09-27（Fable）
- README 草稿照收，改一句：「`--model sonnet` 便宜快好幾倍」是推論，我用 Sonnet 5 真跑了 1 段（839 則、119,878 字元）：78,916 tokens、0.49 美元、5 分 3 秒、19 條規則（14 高信心）；輸出 29,400 裡 23,330 是模型思考。跟 Fable 5.1 的 3.40 美元比是約七分之一，時間只快 1.6 倍。README 改成實數。估算 63,528 vs 實測 78,916（＋24%，Sonnet 5 的分詞與輸出比例都比假設高一些，仍在三成內）。
- 全量若用 Sonnet：工具自己外推約 273 萬 tokens、11.81 美元、序跑 2 小時。
- 需求段的「180 萬」是校準前的數字，改成 220 萬。
- **還沒做、等 Jasper 的**：LICENSE（MIT？）、GitHub 帳號／組織、`package.json` 的 repository／author、`npm publish`、乾淨目錄 `npx rimoo analyze` 驗證、Windows 實測。
