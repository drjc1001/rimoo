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
