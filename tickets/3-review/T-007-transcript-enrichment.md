---
id: T-007
title: 逐字稿補強：從 ~/.claude/projects 補上「Claude 前一句說了什麼」
type: feature
source: rimoo_mvp_spec.md §5「Optional later input」；079 extract_turns.py
priority: P2
created: 2026-09-27
---
## 需求
- 移植 `079_wenchi_cram_school/analyze/taste/extract_turns.py`：讀 `~/.claude/projects/**/*.jsonl`，只留人打的 user turn（origin.kind＝human 或 promptSource＝typed），用 sessionId＋時間戳對回 history 的每一則，附前一則助手訊息前 500 字元。
- 目錄存在就自動開，`--no-transcripts` 關；對不到的則照舊、不報錯。
- chunks 多一欄 `prev_assistant`，prompt 模板改成「他在回應什麼」；findings 的 `trigger` 欄因此才有料。
- 本機 `~/.claude/projects` 現在有 40 個專案目錄（history 有 61 個），對得到的比例要印出來。
## 被誰擋住
- T-005 跑通；拍板點 3（要不要進 MVP）。
## 驗收
- 印出對到比例（本機 X%）；有 prev_assistant 的 findings，trigger 欄非空的比例明顯高於沒有的（附兩個數字）。

## 2026-09-27 定案的改法（跟上面原本寫的不同處）
1. **旗標 `--with-transcripts`，預設關**（原本寫「目錄存在就自動開」）。理由：每列多帶 Claude 前一句，段數與費用照比例漲（實測見下）；預設＝現況，要的人自己開。
2. **只對短訊息補上下文**：正規化後 < 80 字元的才附「Claude 前一句」，最多 200 字元、換行變空白（原本寫全部附 500 字元）。理由：短訊息不看前一句看不懂在回什麼；長訊息本身就是指令。80、200 是 `src/transcripts.ts` 的常數 `SHORT_PROMPT`、`BEFORE_MAX`。
3. 對應法：**同一個 session＋去頭尾空白後文字相等**；同一 session 打過兩次一樣的字，才用時間挑最近的。只靠時間不對。
4. 逐字稿資料夾＝history.jsonl 旁邊的 `projects/`（`--history` 指到別處時跟著走）；只開 history 出現過的 `<sessionId>.jsonl`、逐行讀，子代理的逐字稿（`<sessionId>/subagents/…`）不讀。
5. 資料欄位叫 `before`（不是 `prev_assistant`）；prompt 那行印成 `id | 時間 | 原文 ⟵ Claude just said: …`，模板只在有對到時才多一句說明，所以不開旗標時 prompt 一個位元組都不變、已跑好的段照樣沿用。
6. manifest 多一欄 `transcripts`（不開旗標＝null），比票上多一個 `attached`（實際附了前一句的則數），因為「對到」不等於「有附」（長訊息對到但不附）。

## 自驗 2026-09-27（Opus）
**結論：功能照規格做完、測試全綠；但用本機資料量起來，門檻 80 太寬（佔 65%，tokens 多 63%），而且逐字稿會被 Claude Code 清掉、會打壞 T-009 的「已跑好的段沿用」。建議先不要預設給使用者開，門檻與快取見最後一節。**

1. `npm run typecheck` 綠、`npm test` 130／130 綠（原 119＋新 11；既有測試沒改）、`npm run build` 綠。
2. fixture（`src/transcripts.test.ts`）：兩個 session 檔（`s-known` 在 history 裡、`s-other` 不在→驗證沒被開）、含 tool_use／tool_result／thinking／system-reminder／中斷訊息／task-notification／壞行的雜訊、一則長訊息（對到但不附）、一則短訊息（附、截到 200 字元）、同 session 打兩次一樣的字用時間挑、資料夾不存在印一行照常跑、不開旗標 prompt 跟以前一字不差。
3. 真實資料 `node dist/cli.js analyze --out /tmp/rimoo-t007 --prepare-only --with-transcripts`：
```
Prepared for analysis
  21,105 prompts kept · dropped 871 slash commands, 1,738 short replies, 340 empty or paste-only
  Transcripts: matched 6,550 of 21,105 prompts (31%) from 26 session files
  31 chunks of up to 1,000 prompts or 120,000 characters · largest 119,971 characters
  About 3,571,022 tokens to analyze all 31 chunks (estimate; a run reports the real count)
    = 2,426,429 in the prompts + 31 calls × 1,700 overhead + about 1,091,893 of output (the answers and the model's thinking)
  Prompts written to /tmp/rimoo-t007/prompts/ (one ready-to-run prompt per chunk)
```
| 項目 | 不開旗標 | 開旗標 |
|---|---|---|
| 花的時間 | 0.8 秒 | 8.2 秒（讀逐字稿 7.5 秒，峰值記憶體 300 MB） |
| 段數 | 24 | 31（+7） |
| 估算總 tokens | 2,197,413 | 3,571,022（+62%） |
| prompt 本身 tokens | 1,487,319 | 2,426,429（+940k） |

- 逐字稿：本機 `~/.claude/projects` 頂層只剩 31 個 session 檔（另 549 個是子代理的，不讀），history 用得到的 26 個（共 3.0 GB）全開。
- 對到比例：全體 31%（6,550／21,105）。低的原因是逐字稿只剩 2026-06-20 之後的；**在還留著逐字稿的 session 裡對到 93%**（6,550／7,054），對不到的 504 則有 50 則是含貼上內容（history 存的是佔位字、逐字稿存的是全文，天生對不上）。
- 短訊息（< 80）佔候選 65%（13,810／21,105）；對到的 6,550 則中 5,049 則實際附了前一句（另 10 則前面沒有 Claude 的文字）。
- 不帶旗標再跑一次：24 段，24 個 prompt 檔的雜湊跟改之前逐一相同，終端「Prepared for analysis」段也一字不差。
- **注意**：「不對」「為何」「等等」這類 8 字以下的短回覆，本來就在切段前被當作「short replies」丟掉了，不會進 prompt；這次補上下文實際幫到的是 9～79 字的訊息。
4. 抽樣 5 列（`prompts/001.md` 是 2025-11 起最舊的一段，那時的逐字稿已被清掉，0 列有 `⟵`；有 `⟵` 的從 013.md 開始，以下從 013.md 等距抽 5 列）：
```
11865 | 2026-06-20T15:31 | 把 Westside 補完整，照片材料子列都加上　你可以提供你的furniture-schedule prompt 給我　review嗎？ ⟵ Claude just said: ## 成功了 — 而且這正是你構想的那個迴圈 **LLM 在完全沒看過的、最難的版面(房型數量矩陣)上,盲產達到:產品 100%、欄位 98%。** 我**沒有寫任何 Westside 專屬解析器**,只給它一段通用的 furniture-schedule prompt,它自己: - 認出表頭、看懂「品項兩列」結構 - **自己算對了數量矩陣**(各房型房數 × 每房數量 → 242、612、26
11919 | 2026-06-20T23:24 | 回頭檢查一下　Conrad按鍵有機會準綠提高嗎？目前辨識率　和準確率是如何計算的　73%真的差蠻多的是真的蠻辦法找到正確的值嗎？ ⟵ Claude just said: 5 份完整 HTML 報告已產生。每案各一份獨立完整報告,放在 `comparison_phase1/`: ## 各案完整對照報告路徑 | 案 | 完整報告 HTML | 辨識率 · 準確率 | |---|---|---| | Crown Perth | `FTQ26023_Crown_Perth_Speakeasy/00_完整對照報告.html` | 100% · 97% | | Crown M
11967 | 2026-06-21T11:22 | 這是哪個project 請提供excel檔案名稱 ⟵ Claude just said: 不是喔,那個 **71% 是「格子數」不是「品項數」** —— 我說清楚: ## 一個「cell(格)」= 一個品項的「其中一個尺寸值」 每個品項有 4 個格子:**寬 W、深 D、高 H、數量 Qty**。「cell 正確率」算的是這些**單一數值**對不對,不是整個品項。 ## Conrad 的 71%(誠實口徑)實際是 ``` 71% = 312 / 437 個格子 ``` - **分母 4
12062 | 2026-06-22T11:49 | 在　FTQ_PoC完整報告中　913pz u13 ⟵ Claude just said: 全部完成。`stage` 現為 `669d98b`,四個 feature 分支皆已合併。記憶已更新。以下是**最終全景總結**。 ## 最終狀態 - **分支**:`main`(6de17f1) / `stage`(669d98b,所有工作已整合);4 個 feature 分支已合併,可隨時 prune(刪遠端分支屬破壞性操作,需您另行授權,我未執行) - **引擎**:8 個辨識器、12 份設定
12110 | 2026-06-22T15:07 | 好像還蠻庫的耶，現在AI讀數字是假的吧？ ⟵ Claude just said: 好了,**現在它在跑了**——我從本機 curl 確認回 `HTTP 200`(首頁 6797 bytes),進程也在(PID 2633502)。 **請再開一次/重新整理 http://localhost:8001** 應該就進得去了。 進去後: 1. 右上點一個格子(先用預設綠色的 **H**)。 2. 左圖 elevation 那塊,拖框框住 **830**。 3. 等約 2–3 秒,下方出
```
人眼判讀：5 列都是在回那一則（對應正確）；其中 4 列前一句真的幫得上（11865 要 prompt、11919／11967 問 73%／71% 怎麼算、12110 試了工具之後的反應），12062 對到了但前 200 字是分支摘要，他在指的報告項目不在這 200 字裡。另外前 200 字有不少 `##`、`**`、表格線、commit 號在佔位子。

## 門檻與後續建議（沒有改程式，給 Jasper 裁）
1. **門檻 80 → 建議 40**：80 以下佔候選 65%，幾乎是「全部」，跟「只補短訊息」的本意不合。各門檻量到的：

| 門檻 | 佔候選 | 本機多的 prompt tokens | 逐字稿全都在時估計多 |
|---|---|---|---|
| < 20 | 13% | +232k | +0.5M |
| < 40 | 37% | +610k | +1.4M |
| < 60 | 54% | +804k | +2.1M |
| < 80（現在） | 65% | +930k | +2.5M |

2. **逐字稿會被清，會打壞 T-009 的沿用**：Claude Code 會定期刪舊逐字稿。模擬拿掉 1 個舊 session 檔再切一次，31 段中有 6 段 prompt 變了、得重跑。建議另開一張票：第一次對到的「前一句」存進輸出資料夾（例如 `rimoo-out/transcripts.jsonl`），之後逐字稿被刪也用存下來的，段才穩。在這張票解決前，`--with-transcripts` 不建議常開。
3. **前一句改取「結尾」或先去掉 markdown 符號**：Claude 長訊息的開頭常是「全部完成／分支摘要」，他在回的通常是結尾的問題或結論（見 12062）。建議改成取最後 200 字，或先剝掉 `#`、`*`、`` ` ``、表格線再截。要改的話只動 `src/transcripts.ts` 一處。
4. 驗收原本寫的「有前一句的 findings，trigger 欄非空比例明顯較高」要真的跑 `claude` 才量得到，這次照指示只跑到 `--prepare-only`，沒量。

## 審後修正 2026-09-27（Fable）
Opus 的兩處偏離（預設關、只補短訊息）是我派工時定的；它量出來的建議我接受兩條，改了程式：
1. **門檻 80 → 40 字元**（`SHORT_PROMPT`）：依據它的比較表——40 以下佔候選 37%、80 以下 65%；前一句真正幫到的是「不看前一句不知道在回什麼」的短句。
2. **前一句改取「去掉 markdown 後的最後 200 字」**（`tail`）：它抽的 5 列裡 4 列有幫助，失敗的那列是因為前 200 字是分支摘要，他回的東西在結尾。截掉的部分用開頭的「…」標示。
3. 逐字稿被 Claude Code 清掉會讓已跑好的段變動重跑（它模擬拿掉 1 個舊 session 檔 → 6 段變）：另開 **T-010**（把對到的前一句存進輸出資料夾）。旗標預設關，先不擋 MVP。

### 真實資料（改完後，`--prepare-only --with-transcripts`，不呼叫 claude）
| 項目 | 不開旗標 | 開旗標（80／取頭） | 開旗標（40／取尾，定案） |
|---|---|---|---|
| 段數 | 24 | 31 | 28 |
| 估算 tokens | 2,197,413 | 3,571,022（+62%） | 3,250,827（+48%） |
| 有附前一句的則數 | — | 5,049 | 3,333（候選的 16%） |
| 時間／記憶體 | 0.8 秒 | 8.2 秒 | 8.2 秒／286 MB |

- 對到 6,550／21,105（31%）：逐字稿只留 6/20 之後，留著的 session 裡對到 93%；開了 26 個 session 檔（3.0 GB，串流讀）。
- 不帶旗標：24 段、prompt 檔雜湊跟 T-009 之後逐一相同。
- 測試 130／130 綠、typecheck 綠、build 綠。
- 「有前一句的 findings 的 trigger 欄是否更常有內容」要真跑 claude 才量得到，留給全量跑時開一段對照。
