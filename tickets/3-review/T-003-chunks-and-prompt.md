---
id: T-003
title: 語意分析前處理：篩選、切段、產生分析 prompt（不呼叫 LLM）
type: feature
source: rimoo_mvp_spec.md §7、§9、§20 需求 4
priority: P0
created: 2026-09-27
---
## 需求
- 篩掉：斜線指令、< 8 字元短回覆、`pastedContents`（整欄不進 prompt：隱私＋體積）。每則截 3,000 字元（沿用 `extract_turns.py`）。
- 每則給穩定 id（原始行號），之後 findings 引用 id 才能回查。
- 依專案分組、時間排序，每段預設 1,000 則（依據：079 手工掃描一片 1,000～1,300 則、每片歸納出約 34 條規則；平均 82 字元 → 一段約 8 萬字元，`claude -p` 吃得下）。`--chunk-size` 可調。
- 篩選旗標：`--project <substr>`、`--since <date>`、`--sample <n>`（只取前 n 段，小樣先跑）。
- 每段一份 prompt（`rimoo-out/prompts/NNN.md`）＋資料（`rimoo-out/chunks/NNN.jsonl`）。prompt 要 Claude 依 §9 七類回 JSON：`{category, rule, frequency, confidence, evidence:[{id, ts, quote}], trigger}`；措辭沿用 079 findings 的欄位（規則／頻率／信心／原句／觸發情境）。
- 內容安全：prompt 內要求不輸出人名、電話、email、金鑰。
## 被誰擋住
- T-001。
## 驗收
- Jasper 本機約 23 段，每段字元數印出來、最大一段不超過 12 萬字元；prompt 內 grep 不到任何 pastedContents 內容。
- fixture 測試：篩選、切段、id 對應全綠。

## 自驗 2026-09-27（Opus）

**結論：程式做完、三個指令全綠（51 個測試）。但「每段 1,000 則」跟「最大一段不超過 12 萬字元」在真實資料上不能同時成立：拿掉短回覆後，每則連同時間和專案欄平均約 150 字元，1,000 則一段最大到 18 萬字元。我加了第二道上限：一段滿 1,000 則，或 prompt 檔再加一則就會超過 12 萬字元，就切。結果 27 段、最大 119,975 字元（票上估約 23 段）。要不要這樣做請 Jasper 裁，見第 7 節。**

### 1. 指令結果
- `npm run typecheck` 綠、`npm test` 51／51 過（原本 37 個＋新增 14 個）、`npm run build` 綠。
- T-002 的測試沒改：`src/repeated.test.ts` 只在 import 加上 `classify`，檔尾新增一個 classify 測試。`groupRepeated` 改用 `classify` 前後，對同一份 history 複本跑出的 `repeated.json` 完全相同（generatedAt 以外整份比對）。
- `src/analyze.test.ts`（T-001／T-002 的整合測試）改了一行斷言：最後一行 `Saved …` 多了 `manifest.json`，這是票要求的輸出變更；另補一行檢查「Prepared for analysis」。

### 2. 真實資料整段跑（`node dist/cli.js analyze --out /tmp/rimoo-t003`）
```
Prepared for analysis
  21,094 prompts kept · dropped 870 slash commands, 1,735 short replies, 338 empty
  27 chunks of up to 1,000 prompts or 120,000 characters · largest 119,975 characters
  Prompts written to /tmp/rimoo-t003/prompts/ (one ready-to-run prompt per chunk)

Saved /tmp/rimoo-t003/stats.json, /tmp/rimoo-t003/repeated.json and /tmp/rimoo-t003/manifest.json
```
- 等式：21,094＋870＋1,735＋338＝**24,037**＝同一次跑、上方統計印的「24,037 prompts」。（history 在跑的當下還在長，比票頭的 24,030 行多幾則。）
- 338 則「空的」＝只貼了東西、沒打字（整則只有 `[Pasted text #1 +3 lines]` 這類佔位字），沿用 T-002 的規則不進段。
- 每段（從 manifest 讀；字元數＝整份 prompt 檔，含模板）：

| 段 | 則數 | 字元數 | 專案數 |
|---|---|---|---|
| 001 | 771 | 119,885 | 8 |
| 002 | 882 | 119,936 | 1 |
| 003 | 891 | 119,886 | 2 |
| 004 | 928 | 119,946 | 1 |
| 005 | 937 | 119,781 | 9 |
| 006 | 901 | 119,975 | 1 |
| 007 | 873 | 119,954 | 1 |
| 008 | 895 | 119,961 | 2 |
| 009 | 861 | 119,903 | 1 |
| 010 | 873 | 119,930 | 10 |
| 011 | 802 | 119,863 | 6 |
| 012 | 764 | 119,809 | 5 |
| 013 | 685 | 119,972 | 1 |
| 014 | 665 | 119,926 | 1 |
| 015 | 641 | 119,900 | 1 |
| 016 | 676 | 119,934 | 5 |
| 017 | 870 | 119,658 | 10 |
| 018 | 761 | 119,881 | 1 |
| 019 | 715 | 119,934 | 1 |
| 020 | 653 | 119,912 | 1 |
| 021 | 636 | 119,938 | 1 |
| 022 | 720 | 119,507 | 1 |
| 023 | 739 | 119,957 | 1 |
| 024 | 789 | 119,912 | 1 |
| 025 | 1,000 | 113,762 | 1 |
| 026 | 840 | 119,002 | 6 |
| 027 | 326 | 58,903 | 6 |

  最大 119,975 ≤ 120,000。只有第 025 段是被 1,000 則切的，其他 26 段都是被字元上限切的。
- pastedContents：從 history 抽 463 段貼上內容（每段取一行 60 字以上），在 27 份 prompt 裡找到 88 段，回查全是他自己也打在訊息裡的字（例如他打「and I already run the docker exec …」）；只出現在貼上內容裡的＝0。程式本來就不讀那一欄。

### 3. 抽看 `prompts/005.md`
- 共 962 行：模板 34 行在上，`<messages>` 之後 937 行資料，`</messages>` 收尾。
- 937 列全部符合 `id | YYYY-MM-DDTHH:MM | project | text`；這段 text 最長 929 字元（27 段全部來看最長剛好 3,000，是被截的）。937 個 id 跟 `chunks/005.jsonl` 一一對應、順序相同。

### 4. `--project toy-app --since 2026-07-01 --sample 2`
- manifest `filters`＝`{"project":"toy-app","since":"2026-07-01","sample":2}`，寫出 2 段（1,000 則／119,939 字元、691 則／79,350 字元），共 1,691 則。
- 每列 project 都含 toy-app（`/data/repos/toy-app`、`toy-app-vtakeout`、`toy-app-wo-update`、`toy-app/jinangun-line-oa`），最早一列 `2026-07-01T09:59`。
- 這組條件剛好只切得出 2 段，所以 `--sample 2` 沒有砍掉東西；「只寫前 n 段」由測試 `main: chunk flags reach manifest.json` 驗（3 則切 2 段、sample 1 只寫 1 段，manifest 的 totalChunks 仍記 2）。

### 5. 壞值
- `--since 2026-13-01` → `Option --since must be a date written YYYY-MM-DD, got: 2026-13-01`，離開碼 2。
- `--chunk-size 0` → `Option --chunk-size must be a whole number of 1 or more, got: 0`，離開碼 2。兩次都沒產生輸出資料夾。

### 6. 模板本文（`src/prompt-template.ts`，以第 5 段為例；`<messages>` 之後接資料）
````
Below are messages one developer typed to Claude Code, in their own words. This is part 5 of 27: 937 messages, sorted by project and then by time.

Find the working habits that come up again and again: how they want results reported, how they plan, build, test and debug, and how they work with an AI assistant. Do not summarize what the projects are about. A habit needs at least two messages behind it; something said once is not a habit.

Categories (use these exact names):
- communication: how answers should be written. For example: result first, bullet points, short, no filler.
- planning: what happens before coding. For example: plan first, split work into tickets, agree on scope and acceptance criteria.
- implementation: how code gets built. For example: backend first, the simplest thing that works, small steps, no abstraction before it is needed.
- testing: what counts as proof. For example: tests before wiring up the frontend, an end-to-end check before calling it done, reproduce a bug before fixing it.
- debugging: what to do when something breaks. For example: find the root cause, read the logs before guessing, change approach when an attempt keeps failing.
- architecture: technical choices that keep coming back. For example: preferred tools and infrastructure, patterns they reject, how much abstraction they like.
- ai_collaboration: how the assistant should behave. For example: when to ask and when to keep going, how to report, how much to explain, what to do when stuck.

Reply with JSON only: no markdown fence, nothing before or after it. Shape:

{"findings":[{"category":"communication","rule":"...","frequency":3,"confidence":"high","evidence":[{"id":123,"ts":"2026-02-17T15:14","quote":"..."}],"trigger":"..."}]}

What goes in each field:
- rule: one sentence someone could follow on a different project. No project names, people's names or file paths.
- frequency: how many messages in this part back the rule up.
- confidence: "high", "medium" or "low". high means they said it plainly more than once; low means you are reading between the lines.
- evidence: 2 to 5 messages. Copy id and ts from the lines below; quote is their own words, shortened if long. Only use ids that appear below.
- trigger: when they usually say it, for example "after Claude hands back a report full of internal jargon". Use null if you can't tell.

Write rule and trigger in the language the developer mostly uses in this part. If they mix Chinese and English, write in Chinese.

Never output people's names, phone numbers, email addresses, keys or passwords, or URLs, not even inside a quote. Leave them out of the quote or replace them with [removed].

Text like [Pasted text #1 +3 lines] marks a spot where they pasted something; what they pasted is not included.

If nothing repeats, reply {"findings":[]}.

Each line below is one message: id | time | project | text

<messages>
````

### 7. 偏離票或要 Jasper 裁的
1. **字元上限切段**（見結論）。另一個選項：資料列的 project 只放資料夾名（`toy-app` 而不是 `/data/repos/toy-app`），每段省約 1～2.5 萬字元，段數大約降到 24～25，但仍會有段超過 12 萬，上限還是要留。我沒做，因為票寫的是 project。
2. manifest 多兩個欄位：`maxChars`（上面那道上限）、`totalChunks`（`--sample` 前的總段數）。prompt 開頭的「第 N／M 段」用 totalChunks，所以小樣先跑的 prompt 跟全跑時同一段一模一樣。
3. `--project`、`--since` 只影響切段，統計與三張表仍是全部資料；dropped 三項是篩選後的數。
4. 模板用英文寫（套件給任何開發者用），規則的輸出語言由模板指定「跟資料主要語言一樣，中英混用寫中文」。

## 審後修正 2026-09-27（Fable）
Opus 的 12 萬字元上限留著（理由對：拿掉短回覆後每列平均 150 字元，1,000 則會到 18 萬）。審查後另外改三處，並補了 Jasper 當天提的需求「要讓使用者知道會花多少 token」：
1. **資料列格式**：一段裡同一專案只寫一行 `# project: <資料夾名>`，每列剩 `id | 時間 | 文字`。原本每列都帶完整專案路徑（平均 27 字元）＋分隔符，真正的字只有 66 字元。改完總字元 3.17M → 2.58M（少 19%），段數 27 → 24。`chunks/*.jsonl` 仍保留完整路徑給 T-004 回查。
2. **token 估算**（`src/tokens.ts`）：換算率不是猜的，用三個極小的 `claude -p --output-format json` 呼叫量出來（都在 usage 欄）：2,000 字元中文為主的文字＝2,118 tokens、2,000 字元英文＝562 tokens、空呼叫固定帶 23,567 tokens（Claude Code 自己的系統提示，大多走快取）。解出每個中文字約 1.3、其他字元約 0.28、每次呼叫固定約 24,000。manifest 多 `estimate`（這次要跑的）與 `estimateFull`（全部），每段多 `tokens`。
3. **終端**多兩行估算；有 `--sample` 時再多一行「這次小樣約多少」。`empty` 改寫成 `empty or paste-only`。

### 驗收對照（本機真實資料）
```
Prepared for analysis
  21,099 prompts kept · dropped 870 slash commands, 1,737 short replies, 339 empty or paste-only
  24 chunks of up to 1,000 prompts or 120,000 characters · largest 119,978 characters
  About 1,791,049 tokens to analyze all 24 chunks (estimate; a run reports the real count)
    = 1,215,049 in the prompts + 24 calls × about 24,000 that Claude Code adds itself
  Prompts written to rimoo-out/prompts/ (one ready-to-run prompt per chunk)
```
- 等式：21,099＋870＋1,737＋339＝24,045，等於同一次跑的 prompts 總數。
- 24 段：11 段被 1,000 則切、13 段被 12 萬字元切；最大 119,978 字元；估算 1,791,049 tokens（prompt 1,215,049＋24 次固定開銷 576,000）。
- 真實資料中文只佔 13%，所以每字元約 0.47 token；純中文專案會接近 1.3。
- 測試 53／53 綠、typecheck 綠、build 綠。
- 你要自己看：`cd /data/repos/1011_Project_Rimoo && npm test && npm run build && node dist/cli.js analyze --sample 2`，然後開 `rimoo-out/prompts/001.md`。
- 估算的準不準要等 T-004 第一次真跑才知道；差超過三成就把 `tokens.ts` 的換算率改成實測值。
