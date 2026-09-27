---
id: T-006
title: 隱私閘（輸出不帶機敏內容）＋分享用摘要 share.txt
type: feature
source: rimoo_mvp_spec.md §11、§17
priority: P1
created: 2026-09-27
---
## 需求
- 寫檔前掃 CLAUDE.md／SKILL.md／share.txt：路徑（`/data/repos/…`、`~/`）、email、電話、金鑰樣式（sk-、AKIA、ghp_、長 hex／base64）→ 命中就不寫該檔並列出行號；report.md 只擋金鑰樣式（原句本來就要留）。
- `share.txt`：§11 的短版（則數、專案數、前五條），純文字，方便貼 README／LinkedIn。
- `--allow-paths` 旗標可放行路徑（開發者自己看的情況）。
- 測試：fixture 放一個假金鑰與一個路徑，驗證擋下並列行號。
## 被誰擋住
- T-005。
## 驗收
- 在 Jasper 本機跑完，CLAUDE.md／SKILL.md／share.txt 用 history 裡出現過的客戶與專案名 grep，0 命中。
## 改法變更 2026-09-27（主代理定）
- 命中時**不是不寫檔**，而是把命中的片段換成 `[removed]` 照樣寫檔，終端印一行提醒（檔名、種類、行號）。理由：不寫檔會讓使用者少一個檔又不知道為什麼；換掉片段、其餘照寫，檔案還能用，也看得到哪裡被拿掉。
- 各檔政策：CLAUDE.md／SKILL.md／share.txt／workstyle.json（只掃 `rule`／`title` 欄）五種都遮（路徑、email、網址、電話、金鑰）；`--allow-paths` 時路徑不遮。report.md 只遮金鑰（原句本來就要留，路徑與網址是使用者自己的資料）。
- 提醒格式：`  Removed from CLAUDE.md: 2 file paths (lines 12, 40), 1 URL (line 18). Pass --allow-paths to keep paths.`，沒命中不印；同一種超過 10 行時只列前 10 行加「…」。
- 取代時逐行處理，被拿掉的片段不會讓後面的行號跑掉，提醒裡的行號就是寫出去那個檔的行號。

## 自驗 2026-09-27（Opus）
1. `npm run typecheck`、`npm run build` 無錯；`npm test` 116 個全過（原 104＋新 12）。既有測試只改了 `analyze.test.ts` 兩處 `Saved …` 那行（多 `share.txt`）。
2. fixture（`src/exports.test.ts`「privacy gate」兩個測試）：第一條規則放假金鑰 `sk-…`、路徑、email、網址、手機號，標題放一個路徑，跑 `writeExports`：
   - report.md：只拿掉金鑰，其他四種原樣保留。
   - CLAUDE.md、SKILL.md、workstyle.json：五種都換成 `[removed]`；share.txt 只列標題，所以只拿掉標題裡的路徑。
   - 每個命中回報的行號，那一行都真的有 `[removed]`；CLAUDE.md 的提醒整行比對通過。
   - `--allow-paths`：路徑留下、其餘照遮、提醒不再出現「Pass --allow-paths」；規則乾淨時一行提醒都不印。
   - `src/privacy.test.ts`：五種各有正例與反例（`2026-09-27`、`24,051 prompts`、`1.ok 2.不用`、snake_case key、`stage／prod`、`node --test`、`1/2`、時間、版本號、網址裡的路徑）。
3. 真實資料（`rimoo-out/merged.json` 55 條規則、`stats.json`；沒呼叫 claude，只跑 `writeExports` 到暫存資料夾）：
   | 檔案 | 命中 |
   |---|---|
   | report.md | 0 |
   | CLAUDE.md | 0 |
   | SKILL.md | 0 |
   | workstyle.json | 0 |
   | share.txt | 0 |

   另外把 267 則引句也各自掃過一次（五種全開）：0 命中。
   `grep -c` 查 CLAUDE.md／SKILL.md／share.txt：`吉野`、`文綦`、`Fairmont`、`/data/repos`、`jetsparq`、`toy-app` 全部 0。
   **判讀**：真實資料 0 命中是因為合併那一步本來就把規則寫成抽象句，不是閘擋下來的。閘只認得「長相」（路徑、email、網址、電話、金鑰），**認不得客戶名、專案名**（例如 `吉野`、`Fairmont` 這種字）；要擋名字得另開一張票（例如拿 history 裡的專案資料夾名當黑名單）。report.md 裡 `toy-app` 出現 1 次（在引句裡），照政策保留。
4. share.txt 全文（Jasper 真實資料）：
   ```
   我跟 AI 寫程式的習慣

   分析了 24,051 則訊息
   61 個專案

   最常出現的習慣：
   • 換 session 前先寫 memory
   • 產出與原始來源並排附出處
   • 直接給可打開的產出
   • 講人話，看不懂就重寫
   • 沿用既有畫面與範本

   用 Rimoo 整理 — npx rimoo analyze
   ```
   規則是英文時整段換成英文（`My AI coding workstyle`／`24,051 prompts analyzed`／`61 projects`／`Top patterns:`／`Found with Rimoo — npx rimoo analyze`），跟 spec §11 一樣。前五條只從會進 CLAUDE.md／SKILL.md 的規則挑（高信心，或中信心且講過 3 次以上），低信心的不拿出去分享。

## 審後修正 2026-09-27（Fable）
Opus 把「命中就不寫檔」改成「遮成 `[removed]` 照寫＋終端提醒」，理由對（少一個檔又不知為何），接受。它誠實點出的洞——閘認不得「吉野」「Fairmont」這種名字——補了一半：
1. **專案名也遮**（新的 `project` 種類）：Rimoo 本來就知道使用者所有專案路徑（stats），取資料夾名與去掉編號前綴的版本（`068_吉野環保科技` → 也遮 `吉野環保科技`），ASCII 名字整字比對不分大小寫、中文照原樣；長度 < 4 或純數字不算；路徑裡出現的名字算路徑不重複算。政策同路徑：CLAUDE.md／SKILL.md／share.txt／workstyle.json 遮，report.md 留，`--allow-paths` 一起放行。
2. 沒補到的另一半：只出現在對話裡、不在專案名裡的客戶名（例：文綦）。這次 55 條真實規則零命中，靠的是合併 prompt 要求不寫名字；要更保險得另開票（例如從 history 抽高頻專有名詞讓使用者勾選）。先記在 T-900。
3. share.txt 中文版結尾改全形冒號。

### 驗收（真實資料，不呼叫 claude）
- 用 61 個專案衍生的 91 個名字跑閘：五個檔零命中；`吉野／文綦／Fairmont／/data/repos／jetsparq／toy-app／asterisk／roblox` 在 CLAUDE.md、SKILL.md、share.txt、workstyle.json 各 0；report.md 引句裡 1 次 `toy-app`，照政策保留。
- 測試 119／119 綠、typecheck 綠、build 綠。
