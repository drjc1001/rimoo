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
