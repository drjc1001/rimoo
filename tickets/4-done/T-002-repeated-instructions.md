---
id: T-002
title: 重複指令挖掘（最常重複的原句與近似句）
type: feature
source: rimoo_mvp_spec.md §20 需求 3「most frequently repeated exact or near-exact instructions」
priority: P0
created: 2026-09-27
---
## 需求
- 正規化：去頭尾空白、空白壓一格、小寫、去尾標點；再去禮貌詞（please／yes／ok／and／幫我／請）後比對，讓「merged, help me deploy」與「merged and please help me deploy」歸同一組。
- 三張表分開出：**指令**（正規化後 ≥ 8 字元）、**短回覆**（< 8 字元，例：yes／ok／繼續，是回覆習慣不是指令）、**斜線指令**（/compact 等，是用法習慣）。8 字元的依據：本機 8 字元以下有 1,307 則，幾乎全是單字回覆。
- 近似句：字元三連 Jaccard，門檻旗標 `--similarity`，預設 0.8 只是起點；驗收時對本機資料同時印 0.7 與 0.8 的分組結果，挑合理的那個寫回預設值。
- 每組帶：出現次數、專案數、首次／最後出現日期、原句範例 3 則。
- 輸出：終端前 20 名、`rimoo-out/repeated.json`。fixture 測試。
## 被誰擋住
- T-001（讀檔）。
## 驗收
- Jasper 本機前 20 名讀起來是真的指令（他過目）；「merge it into stage」35 次、「merged, help me deploy」兩種寫法合併成一組。
- 0.7 vs 0.8 的分組差異附在票裡，選定的值有理由。

## 自驗 2026-09-27（Opus）

**結論：程式做完、三個指令全綠（33 個測試）；預設門檻選 0.8。驗收 3 有一半沒過：「merged, help me deploy」跟「merged and please help me deploy」仍是兩組，原因是規則寫「只去頭尾」而這句的 and please 在中間，要改規則才對得上，等 Jasper 裁。**

### 1. 指令結果
- `npm run typecheck` 綠、`npm test` 33／33 過（T-001 原本 17 個＋新增 16 個）、`npm run build` 綠。
- 真實資料（`~/.claude/history.jsonl`，24,029 則）整支 `analyze` 跑 0.7 秒。

### 2. 前 20 名指令表（原樣貼上）
欄位：次數、專案數、首次 → 最後、指令。

`node dist/cli.js analyze --out /tmp/rimoo-t002-08 --similarity 0.8`
```
Most repeated instructions (top 20)
  136  20  2026-02-17 → 2026-08-19  go ahead
   67  16  2026-02-23 → 2026-09-15  continue
   40   2  2026-02-18 → 2026-07-05  merge it into stage
   39   4  2026-02-25 → 2026-05-19  let's do it
   33   5  2026-02-18 → 2026-07-19  commit this
   27   3  2026-05-31 → 2026-08-23  merged help me deploy
   24  11  2026-04-18 → 2026-09-24  i will compact before next round
   21   2  2026-05-31 → 2026-08-23  merged and please help me deploy
   20   2  2026-07-17 → 2026-09-01  merged 上prod
   19   9  2026-02-28 → 2026-09-27  [pasted text #1 +3 lines]
   17   1  2026-02-21 → 2026-03-02  merge it to stage
   17   1  2026-07-17 → 2026-07-21  merged deploy stage
   16   5  2026-02-17 → 2026-08-30  [pasted text #1 +6 lines]
   16   2  2026-02-19 → 2026-04-20  commit and push
   15   5  2026-03-01 → 2026-09-23  [pasted text #1 +7 lines]
   14   9  2026-03-01 → 2026-09-25  [pasted text #2 +3 lines]
   14   3  2026-06-04 → 2026-08-05  promote to prod
   13   1  2026-08-26 → 2026-09-07  merge 好了
   12   9  2026-02-17 → 2026-09-26  [pasted text #1 +4 lines]
   12   3  2026-04-26 → 2026-08-15  merged what's my next step
```

`node dist/cli.js analyze --out /tmp/rimoo-t002-07 --similarity 0.7`
```
Most repeated instructions (top 20)
  136  20  2026-02-17 → 2026-08-19  go ahead
  122  22  2026-02-17 → 2026-09-27  [pasted text #1 +3 lines]
   67  16  2026-02-23 → 2026-09-15  continue
   59  17  2026-02-21 → 2026-09-27  [pasted text #2 +4 lines]
   41  17  2026-02-21 → 2026-09-27  [pasted text #3 +7 lines]
   41   2  2026-02-18 → 2026-07-05  merge it into stage
   39   4  2026-02-25 → 2026-05-19  let's do it
   33   5  2026-02-18 → 2026-07-19  commit this
   33  12  2026-04-18 → 2026-09-24  i will compact before next round
   28   3  2026-05-31 → 2026-08-23  merged help me deploy
   27  11  2026-02-26 → 2026-09-24  [pasted text #4 +17 lines]
   25   2  2026-05-31 → 2026-08-23  merged and please help me deploy
   20   2  2026-02-19 → 2026-04-20  commit and push
   20   1  2026-07-17 → 2026-08-03  merged deploy stage
   20   2  2026-07-17 → 2026-09-01  merged 上prod
   17   8  2026-02-28 → 2026-08-28  [pasted text #5 +6 lines]
   17   1  2026-02-21 → 2026-03-02  merge it to stage
   16   4  2026-02-18 → 2026-08-15  merged what's my next step
   15   3  2026-02-17 → 2026-04-10  [pasted text #1 +79 lines] what's wrong with this
   15   3  2026-06-04 → 2026-08-05  promote to prod
```

### 3. 0.7 有併、0.8 沒併（共 36 組、多拉進 206 個不同句子，其中 8 組是貼上內容佔位字）
合理的（錯字、前後多一兩個字）：
1. `did you deploy yet` ← `did you deloy yet`
2. `help me merge to stage` ← `help me merger to stage`、`plesae help me merge to stage`、`help me merge to stage first`
3. `merge 了 上 prod 吧` ← `#662 merge 了 上 prod 吧`
4. `merged promote to prod` ← `merged.promote to prod`、`#785 merged promote to prod`、`merged please promote to prod`
5. `把相關資料寫入memory我會先離線` ← `把相關資料寫入memory 我會先離線`

意思不同卻被併在一起的：
1. `merge into main` ← `merge stage into main`（一個併進 main，一個把 stage 併進 main）
2. `merged deploy frontend to stage` ← `merged deploy backend and frontend to stage`、`merged deploy frontend to stage then prod`（範圍不同）
3. `merged and please help me deploy` ← `merged please help me restart and deploy`、`merged please help me deploy and verify`（多了重啟、驗證）
4. `merged what's my next step` ← `what's my next step`（一個是 merge 完才問）
5. `[pasted text #1 +3 lines]` 從 19 次變 122 次，把 60 幾種不同貼上內容全吞成一組

**判斷：選 0.8。** 0.7 多抓到的主要是錯字，但同時會把「多做一件事」的句子（加 restart、加 verify、加 backend）併進短的那句，讀表的人會以為自己一直在講同一件事。0.8 我逐組看了 56 個合併組，非貼上內容的 30 組裡，我看到意思略有差的只有 `開票修吧…` ← `開工吧…` 一組，其餘都是同一句的小變化。漏抓錯字的代價是次數少算幾次，錯併的代價是結論錯，所以取 0.8。程式預設值與 `--help` 已是 0.8。

### 4. 票上兩個具體驗收
1. **`merge it into stage`：過。** 原句 35 次（與基準數字一致）；0.8 另外併入 `merge into stage` 5 次，表上顯示 40 次、2 個專案。`merge it to stage` 17 次仍是另一組（`it into` 對 `it to`，相似度不到 0.8）。
2. **`merged, help me deploy` 與 `merged and please help me deploy`：沒過，兩組分開。**
   - 表上：`merged help me deploy` 27 次（原句 20＋`merged and help me deploy` 近似併入 6＋其他寫法），`merged and please help me deploy` 21 次（原句 17＋`merged please help me deploy`），各自一組。
   - 原因：規則是「禮貌詞只去頭尾、不去中間」，這句的 `and please` 在中間，去完還是原句；兩句的字元三連相似度 0.58，0.7 也併不到。不是門檻問題，沒有改門檻去湊。
   - 要對上得改規則。我在暫存腳本試過「英文禮貌詞在句中任何位置都去掉（整個單字才算）」：這組變成一組 49 次；副作用是 `commit and push` 會變成 `commit push`（表上的 key 讀起來怪，但原句範例不受影響），另外會多出幾組新的重複（例：`commit push to stage` 9 次、`merged help me deploy to stage` 5 次），看起來都是同一句的變化。這是改規則，要 Jasper 決定，程式沒動。

### 5. 前 20 名讀起來像不像指令
不像的（0.8 表）：
1. 貼上內容佔位字 5 組：`[pasted text #1 +3 lines]` 19、`[pasted text #1 +6 lines]` 16、`[pasted text #1 +7 lines]` 15、`[pasted text #2 +3 lines]` 14、`[pasted text #1 +4 lines]` 12。這是 Claude Code 把貼上內容換成的佔位字，真正內容不在這一欄；全資料共 1,158 則、969 組落在指令表。建議另開一步：比對前先把佔位字拿掉，剩空的就不算。
2. `go ahead`（136）、`continue`（67）：剛好 8 個字元所以算指令，性質是短回覆；`continue` 有 52 次來自 `please continue` 去掉禮貌詞。依指示沒動 8 字元分界。
3. `let's do it`（39）偏回覆，但長度 11，也在分界之上。

其餘（merge／commit／deploy／promote／compact）是真的指令。

### 6. 其他要知道的
1. `repeated.json` 有 10.6 MB：指令表 20,936 組全存（其中只出現一次的佔 20,697 組），每組帶原句範例和行號。要不要只存出現 2 次以上的，等裁示。
2. 斜線指令表會把以 `/` 開頭的檔案路徑算進去（如 `/data/repos/toy-app`），約 10 則，各 1 次，排不進前 10；T-001 的斜線計數也是同一條規則，沒改。
3. 句中全形逗號 `，` 也當空白處理（票只寫半形 `,`），理由是同一條規則的全形版，讓 `merged，部署 stage` 與 `merged, 部署 stage` 能對上。
4. 終端上的 key 超過 80 字會截斷加 `…`，JSON 裡是完整的。
5. 只有空白或標點的輸入不算任何一組（本機 0 則）。

## 審後修正 2026-09-27（Fable）
Opus 的程式架構留著（種子＋代表比對、長度預篩、0.7 vs 0.8 的判斷與選 0.8）。審查後改了五處，理由都來自它自驗表上的真實資料：
1. **禮貌詞**：英文整字在任何位置都去（中文仍只去頭尾），「merged, help me deploy」與「merged and please help me deploy」才會併成一組。表上顯示改用該組最常打的原句（`label`），`key` 只用來比對，所以不會出現「commit push」這種怪標題。
2. **貼上佔位字**：比對前把 `[Pasted text #1 +3 lines]` 拿掉；只有佔位字的整則不分組（貼上這件事 T-001 的 withPaste 已經在算）。
3. **短回覆分界**：改成「去禮貌詞後 ≤ 8 字元」，「go ahead」「continue」「please continue」歸回短回覆。原本 `< 8` 的依據（8 字元以下是單字回覆）不變，只是量到剛好 8 的也是回覆。
4. **repeated.json** 只存出現 2 次以上的組，單次的只記數量：10.6 MB → 172 KB。
5. **斜線指令**要長得像指令：`/btw預期…`、`/btw,` 算，`/data/repos/…`、`/x.png` 不算；T-001 的 `slashCommands` 用同一個 `slashCommand()`，從 890 變 870（排除 20 則路徑／檔名／程式碼；`/btw` 從 114 補回 119，原本黏著中文的漏掉了）。

### 驗收對照（本機真實資料，`--similarity 0.8`）
| 項目 | 結果 | 獨立驗證 |
|---|---|---|
| merged help me deploy 兩種寫法 | 一組 49 次 | Python 精確 key 48＋近似併入 1（`both merged help me deploy`） |
| merge it into stage | 42 次 | Python 精確 37＋`merge into stage` 4＋`merge it into stage main` 1（三連 Jaccard 0.82／0.81，剛過門檻） |
| 佔位字在前 20 名 | 0 則 | 之前 5 則 |
| go ahead／continue | 短回覆 137／67 | 與 Python 精確計數相同 |
| 測試 | 37／37 綠、typecheck 綠、build 綠 | — |

### 最終終端輸出（前 20 名指令／短回覆／斜線指令）
```
Most repeated instructions (top 20)
  49   3  2026-05-31 → 2026-08-23  merged help me deploy
  42   2  2026-02-18 → 2026-07-05  merge it into stage
  39   4  2026-02-25 → 2026-05-19  ok let's do it
  33   5  2026-02-18 → 2026-07-19  commit this
  24  11  2026-04-18 → 2026-09-24  i will compact before next round
  20   2  2026-07-17 → 2026-09-01  merged 上prod
  17   1  2026-02-21 → 2026-03-02  merge it to stage
  17   1  2026-07-17 → 2026-07-21  merged deploy stage
  15   3  2026-02-17 → 2026-04-10  what's wrong with this
  14   3  2026-06-04 → 2026-08-05  promote to prod
  13   2  2026-02-19 → 2026-04-20  yes commit and push
  12   3  2026-04-26 → 2026-08-15  merged what's my next step
  11   1  2026-08-20 → 2026-08-22  merge 了 上 prod 吧
  10   1  2026-07-26 → 2026-08-14  merged 上 prod
  10   1  2026-07-17 → 2026-07-22  promote prod
  10   1  2026-08-26 → 2026-09-07  兩個都 merge 好了
  10   6  2026-07-10 → 2026-08-12  我先compact before next round
   9   1  2026-02-19 → 2026-03-05  yes commit and push to stage
   9   4  2026-02-18 → 2026-05-19  what's my next step
   8   1  2026-02-23 → 2026-03-24  please help me merge to stage

Short replies (top 10)
  137  20  2026-02-17 → 2026-08-19  yes go ahead
  132  29  2026-02-19 → 2026-09-25  exit
  102  10  2026-04-23 → 2026-09-01  merged
   75  11  2025-11-01 → 2026-07-19  yes
   67  16  2026-02-23 → 2026-09-15  please continue
   39   7  2026-02-23 → 2026-05-27  yes please
   38  15  2026-03-09 → 2026-09-24  ok
   34   4  2026-02-17 → 2026-07-23  push it
   30   9  2026-02-17 → 2026-09-26  ok go
   14   4  2026-07-10 → 2026-08-22  上 prod

Slash commands (top 10)
  490  27  2026-02-20 → 2026-09-26  /compact
  119  15  2026-03-11 → 2026-09-27  /btw
  100  22  2026-02-24 → 2026-09-27  /model
   40   8  2026-06-20 → 2026-09-26  /usage
   34  10  2026-05-09 → 2026-07-19  /cost
   14   5  2026-04-17 → 2026-05-30  /effort
   11   7  2026-09-25 → 2026-09-27  /exit
    9   5  2026-09-24 → 2026-09-27  /jasper-taste
    9   6  2026-04-08 → 2026-09-16  /login
    6   2  2026-04-23 → 2026-09-05  /voice
```
前 20 名讀起來都是真的指令；「what's wrong with this」「merged what's my next step」是問句但確實是他反覆打的字，留著。
你要自己看：`cd /data/repos/1011_Project_Rimoo && npm test && npm run build && node dist/cli.js analyze`（`./rimoo-out/repeated.json` 有每組的原句範例與行號）。
