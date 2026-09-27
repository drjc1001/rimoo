---
id: T-001
title: CLI 骨架＋讀取 history.jsonl＋基本統計（`npx rimoo analyze` 第一次能跑）
type: feature
source: rimoo_mvp_spec.md §5、§6、§20 需求 1～3
priority: P0
created: 2026-09-27
---
## 需求
- `git init`（本地）。TypeScript／Node 22 的 npm 套件 `rimoo`，bin `rimoo`，子命令 `analyze`；零執行期相依（參數解析自己寫），測試用內建 `node --test`。
- 找檔：`$HOME/.claude/history.jsonl`（Windows 用 `%USERPROFILE%`），`--history <path>` 可覆寫。找不到或是空檔 → 訊息講清楚檔案應該在哪、離開碼 1；不要靜默印 0。
- 逐行解析；壞掉的 JSON 行計數並印出來，不吞掉。欄位只有 `display`／`pastedContents`／`timestamp`（毫秒）／`project`／`sessionId`，缺欄位的行算壞行。
- 去完全重複（display＋timestamp 相同）。
- 統計：總則數、專案數、日期範圍、每專案則數、每月則數。終端印摘要，並寫 `rimoo-out/stats.json`。
- 測試：fixture jsonl（含壞行、重複行、Windows 路徑）全綠。
## 被誰擋住
- 無。
## 驗收
- 在 Jasper 本機跑出的數字＝README 基準表：24,030 行、重複 1、61 專案、2025-11-01～2026-09-27。
- 指到不存在的檔 → 離開碼 1 且訊息可讀；fixture 測試全綠。
## 自驗 2026-09-27（Fable）
- 分支 `T-001-cli-skeleton-stats`，本地 git、無 remote。`npm test` 17 個測試全綠、`npm run typecheck` 無錯。
- 本機真實 history 跑 `node dist/cli.js analyze`，與同一時刻 Python 獨立計算逐項相同：24,033 行、重複 1、壞行 0、24,032 則、61 專案、2025-11-01～2026-09-27、斜線指令 890、含貼上 1,481、前三名專案相同。（比開票時的 24,030 多 3 行＝這個 session 你打的字。）
- 缺檔 → 離開碼 1 且訊息含正確路徑與 `--history` 提示；透過 symlink（模擬 npm 的 .bin）啟動正常；`npm pack --dry-run` 只含 dist 六支＋package.json。
- 順手看到的資料事實：history.jsonl 在 2025-12 與 2026-01 是 0 則（2025-11 只有 12 則），真正的紀錄從 2026-02 開始。T-003 切段時這兩個月不會有資料，不是 bug。
- 你要自己看：`cd /data/repos/1011_Project_Rimoo && npm test && npm run build && node dist/cli.js analyze`（輸出在 `./rimoo-out/stats.json`）。
