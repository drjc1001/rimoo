---
id: T-018
title: 分享圖卡：`share.html`＋（有 Chrome 就）`share.png`，給 LinkedIn 用
type: feature
source: Jasper 2026-09-28「透過 rimoo 直接把我重複的事情做成一個圖片，放在 LinkedIn」；四點拍板 1～4 ok
priority: P1
created: 2026-09-28
---
## 需求
- 現況只有 `share.txt`（純文字）。加一張自包含的 `share.html` 圖卡；機器上找得到 Chrome 就順手截成 `share.png`，套件維持零依賴。
- 內容（拍板 1）：三個數字（prompts、專案數、月數）＋前五條習慣（各附出現則數）＋一句最常重複的原句（`repeated.json` instructions 第一名，附次數）＋頁尾「Found with Rimoo — npx rimoo analyze」。
- 尺寸（拍板 2）：1080×1080 一張；`--card-size 1200x627` 可選第二張（先做正方形，長方形只是同一份 CSS 換尺寸）。
- 語言（拍板 3）：`--lang en` 時，前五條的標題用一個小的 `claude -p` 呼叫翻成英文（一次呼叫、五句、回 JSON），結果存進 `merged.json` 的 `titleEn`，之後重出圖不再呼叫；沒 `--lang` 就用原文（中文）。
- 排版（拍板 4：先文字排法，再畫一張）：
  ```
  ┌──────────────────────────────┐
  │ Rimoo · My AI coding workstyle │  小標
  │                                │
  │  24,126      61        11      │  大數字
  │  prompts   projects  months    │
  │                                │
  │ What I keep telling my agent   │  中標
  │ 1  Result first          40×   │  五行，字級大、左字右數
  │ 2  …                           │
  │ …                              │
  │                                │
  │ Most repeated line:            │
  │ “merged, help me deploy” ×49   │  引號、次數
  │                                │
  │ Found with Rimoo · npx rimoo analyze │ 頁尾小字
  └──────────────────────────────┘
  ```
  深字淺底、一個強調色、內文至少 28px（1080 寬的圖縮到動態牆還看得到）、不放說明性小字。沒有品牌素材，不另創 logo。
- 隱私：圖卡文字走跟 `share.txt` 一樣的閘（`all`：路徑、專案名、email、網址、電話、金鑰都拿掉）；最常重複的原句也過閘。
- PNG：依序找 `google-chrome`、`google-chrome-stable`、`chromium`、`chromium-browser`、`chrome`（macOS 另看 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`），用 `--headless=new --screenshot=<png> --window-size=<w>,<h> --hide-scrollbars <html>`；找不到就只出 HTML，印一行「open share.html and take a screenshot」。
- 重出圖不重跑分析：`analyze` 在 findings 沒變（`findingsSha256` 相同）時只重做合併後的匯出，這條現況已成立，靠它。

## 被誰擋住
- 全量跑（2026-09-28 開跑，`rimoo-out/`）：頻次要全年的。圖卡程式不等它，先用 2 段的 `merged.json` 開發，跑完重出。

## 驗收
- `node --test`：share.html 含三個數字、五條、原句、頁尾；閘有作用（塞一個專案名進 fixture，HTML 裡沒有）；假 chrome 收到的參數含 `--screenshot` 與 `1080,1080`；沒有 chrome 時不報錯、印提示；`--lang en` 對假 claude 只多一次呼叫、第二次匯出零呼叫。
- Jasper 本機：`rimoo-out/share.png` 用 Chrome 截出來，Fable 打開看過（裁字、擋字、字太淡都算 bug），再給他看。
- README「What you get」加 `share.html`／`share.png` 一行。

## 自驗 2026-09-28（Opus）
- 改的檔：新 `src/card.ts`（排版、`findChrome`、`screenshotCard`）、新 `src/translate-template.ts`（`--lang en` 翻譯一次、寫回 `merged.json` 的 `titleEn`）、`src/exports.ts`（`share.html` 加進匯出；閘設 `none`，因為每段文字在 `renderCard` 裡先過閘再 escape；`share.txt` 在 `--lang en` 用 `titleEn`）、`src/analyze.ts`（翻譯→匯出→截圖／提示句）、`src/args.ts`（`--lang en`、`--card-size`，格式錯報錯）、`src/runner.ts`（`callClaude` 多一個可選的 `systemPrompt`，預設不變）、`src/merge.ts`（`MergedRule.titleEn?`）、`README.md`（What you get 一行、閘清單、Options 同步 help）。測試：新 `src/card.test.ts`，`src/analyze.test.ts`、`src/args.test.ts`、`src/fake-claude.test.ts`（假 claude 會回翻譯、假 chrome）。
- 測試：`npm run typecheck` exit 0；`npm test` exit 0，147 個全過（原 134，+13）。
- PNG（真 Chrome 截、我打開看過）：`/data/repos/1011_Project_Rimoo/rimoo-out/card-dev/share.png`（中文 1080×1080）；另有 `share-1200x627.png`、壓力版 `share-1080x1080-stress.png`／`share-1200x627-stress.png`（五條都用長句、原句塞路徑）。
- 看圖後修的：1. 1200×627 三個大數字橫排會擋到右欄 → 長方形改成左欄直排數字、右欄五條＋原句＋頁尾，數字靠右對齊；2. 正方形五條允許兩行時，長句會把頁尾擠到底邊 → 五條一律一行、超長省略號，原句最多兩行；3. 原句的次數被擠到下一行 → 原句與次數同一列，原句自己省略。
- 沒做到／不確定：1. 圖卡的閘拿掉東西時不在終端機列「Removed from share.html」（`share.txt` 會列同樣的標題；原句只在圖卡），要的話再補；2. 本機 Linux 沒有 Noto Sans TC，實際用的是 Noto Sans CJK，英文彎引號會變全形寬；Mac／Windows 會用系統字型，沒實機看過；3. 英文版只用假 claude 驗，真的翻譯呼叫由主代理跑；4. macOS 的 `/Applications/Google Chrome.app` 路徑只在 Mac 上找；在裝了 Chrome 的 Mac 上跑測試，analyze 的「找不到 Chrome」那條會找到真 Chrome 而失敗（Linux 上不會）。要的話讓 `runAnalyze` 可注入 chrome 路徑再修；Mac 上真的截圖也沒實機驗；5. 翻譯只送「中文且還沒有 titleEn」的標題，英文規則的使用者帶 `--lang en` 不會多一次呼叫。
