---
id: T-021
title: 跑完問一句「裝成 /my-workstyle 嗎」：CLI 與外掛都能一步把 SKILL.md 裝進 ~/.claude/skills/
type: feature
source: Jasper 2026-09-28「做完這個分析也不會有任何改善，就沒意義了」；拍板 1 ok
priority: P0
created: 2026-09-28
---
## 需求
- 現況：Rimoo 產 `SKILL.md`（表頭 `name: my-workstyle`）但不寫進 `~/.claude/`，使用者要自己 `mkdir`＋`cp` 才有 `/my-workstyle`。分析完沒有任何東西改變＝沒意義。
- CLI：
  - 新旗標 `--install-skill`（布林）與 `--skill-name <name>`（預設取 SKILL.md 表頭的 name）。
  - 匯出完成後：有 `--install-skill` 就裝；沒有但 stdin 是 TTY 就問一句 `Install as /my-workstyle in ~/.claude/skills? [y/N]`；非 TTY 且沒旗標就印一行提示（`Pass --install-skill to add it as /my-workstyle`）。
  - 目的地 `$CLAUDE_CONFIG_DIR`（沒設就 `~/.claude`）`/skills/<name>/SKILL.md`。
  - 已存在且內容不同：不覆蓋。TTY 問 `… already exists and differs; overwrite? [y/N]`，不覆蓋就印 `--skill-name <other>` 的提示；非 TTY 直接印提示、exit 0（安裝失敗不算分析失敗）。內容相同：印 `already installed`。
  - 裝完印：`Installed ~/.claude/skills/my-workstyle/SKILL.md — type /my-workstyle in a new Claude Code session.`，並提一句 CLAUDE.md 的用法（複製進專案根目錄）。
  - `CLAUDE.md` 不自動裝（會蓋到或疊到使用者自己的），只提示。
- 外掛 SKILL.md（併 T-020）：
  - 第 5 步列出 `share.png`（沒 Chrome 就 `share.html`），不多問語言；改成一句「Say "English card" and I will rerun the export with `--lang en`」。
  - 第 5 步之後問一句：`Install this as /my-workstyle so Claude loads it in future sessions? (yes / no)`；yes 就跑 `npx -y rimoo@latest analyze --out ~/.rimoo --install-skill`（全部段已完成，只重匯出＋安裝，不花 token）；已存在不同內容時把 CLI 的提示轉述、問要不要換名字（`--skill-name`）。
  - 規則加一條：分析指令只跑一次；中途停了就給 log，不自己重跑。
- 版號 0.2.1（`package.json`＋`plugin.json`），Jasper 發 npm。

## 被誰擋住
- 無。從 main 開分支 `T-021-install-skill`，T-020 併在同一條。

## 驗收
- `node --test`：安裝到暫存 `CLAUDE_CONFIG_DIR`；同名不同內容不覆蓋且印提示；同內容印 already installed；`--skill-name` 換名；非 TTY 無旗標只印提示；`--install-skill` 非 TTO 也裝。
- 外掛：`claude plugin validate --strict` 過；`src/plugin.test.ts` 斷言 SKILL.md 提到 `share.png`、`--install-skill`、「run once」。
- Jasper 本機：在 `rimoo_test` 打 `/rimoo`（全部段已完成）→ 回 yes → 新對話打 `/my-workstyle` 有載入。

## 自驗 2026-09-28（Opus）
- 改的檔：
  - 新增 `src/install.ts`（找 skills 目錄、讀表頭 name、安裝、所有提示文字集中在 `TEXT`）、`src/install.test.ts`
  - `src/analyze.ts`：匯出完、印完 `Saved …` 那行之後才做安裝這一步（有旗標直接裝／終端機問 y/N／非終端機印提示），最後固定印 CLAUDE.md 那行；安裝失敗只印一行，exit code 不變
  - `src/args.ts`：`--install-skill`、`--skill-name <name>`（只收 `[a-z0-9][a-z0-9-]*`）、`--force-skill`，HELP 同步
  - `plugin/skills/rimoo/SKILL.md`：Rules 加「每個指令只跑一次」；第 5 步加 `share.png`／`share.html` 與 `--lang en`；新第 6 步問要不要裝
  - `README.md`：新增 `### Use it`；Options 加三行（跟 HELP 逐字比對一致）
  - `package.json`、`plugin/.claude-plugin/plugin.json`：0.2.1
  - 測試：`src/analyze.test.ts`（6 個新測試＋2 個舊測試結尾多兩行）、`src/args.test.ts`（1 個）、`src/plugin.test.ts`（1 個）
- 結果：`npm run typecheck` exit 0；`npm test` exit 0，159 個全過（原 147，新增 12）。跑完確認真的 `~/.claude/skills/` 沒有多出 `my-workstyle`。
- 跟派工字面不一樣的地方：
  1. 外掛第 6 步多一句「After a trial run, add `--sample 2`」：試跑之後其他段還沒跑，不加 `--sample 2` 的話 CLI 會停在「Not running」、根本走不到安裝。
  2. `confirm()` 加一個防呆：輸入已經讀完（測試用的假 stdin 被前一題用掉）就當作 no，不然會卡住。真的終端機不會碰到。
  3. 舊的 `withFake` 測試環境加了暫存 `CLAUDE_CONFIG_DIR`，避免在終端機模式的測試裡碰到真的 `~/.claude/skills`。
  4. 路徑顯示在家目錄底下時寫成 `~/…`（例如 `Installed ~/.claude/skills/my-workstyle/SKILL.md`），跟票裡的範例一致。
- 沒做／不確定：
  - `claude plugin validate --strict` 沒跑（由主代理跑）。
  - 終端機模式「已存在→問要不要換→答 y」這條沒有自動測試（假 stdin 一次只能答一題）；答 n／沒答有測。
  - `package-lock.json` 的版號本來就停在 0.1.0，沒動。

## 審後自驗 2026-09-28（Fable）
- typecheck 0；測試 159／159；`claude plugin validate --strict` 外掛、marketplace、skills 三個過。
- 真機 E2E（`CLAUDE_CONFIG_DIR` 指到暫存目錄，`--history` 指真實 history，`--out ~/.rimoo --sample 2`，一段都沒重跑）：無旗標非 TTY 只印提示、沒建目錄 → `--install-skill` 裝進 `skills/my-workstyle/SKILL.md`（表頭 name 對）→ 再跑印 already installed → 改檔後再跑印 exists 且檔案沒被動 → `--skill-name jasper-rimoo` 裝到另一個目錄。真的 `~/.claude/skills/` 沒多東西。
- `package-lock.json` 版號同步到 0.2.1（之前停在 0.1.0）。`npm pack --dry-run` 含 `dist/install.js`。
- Opus 的四個自行判斷（外掛第 6 步補 `--sample 2`、`confirm()` 讀完當 no、測試環境設暫存 `CLAUDE_CONFIG_DIR`、HELP 換行）都對，保留。
- 沒驗：TTY 下「已存在 → 問取代 → 答 y」這條（假 stdin 只能答一題）；Jasper 在對話裡打 `/rimoo` 回 yes 後新對話有 `/my-workstyle`（0.2.1 發了才測得到）。

## 發佈紀錄 2026-09-28（Fable）
- PR #7 merged；`rimoo@0.2.1` 14:26 UTC 上 npm（registry 慢 40 秒才露出）；`npx -y rimoo@0.2.1 analyze --help` 列出 `--install-skill`／`--skill-name`／`--force-skill`；`claude plugin update` 0.2.0 → 0.2.1。
- 剩最後一格給 Jasper：對話裡 `/rimoo` 回 yes → 新對話 `/my-workstyle` 有載入。
