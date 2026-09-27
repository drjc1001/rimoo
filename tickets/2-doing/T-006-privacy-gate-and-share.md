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
