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
