---
id: T-011
title: `claude -p` 呼叫不載使用者自己的 CLAUDE.md（分析與合併都要）
type: fix
source: A/B 盲測時發現（2026-09-27）
priority: P0
created: 2026-09-27
---
## 需求
- 實測：`claude -p --system-prompt …` 仍會把使用者的全域 `~/.claude/CLAUDE.md`（與 cwd 的專案 CLAUDE.md）塞進對話。對 Rimoo 是污染：使用者的規則會影響「找規則」這件事本身（例如規則寫「先跑清單」，模型就真的去跑）。T-004 量到的每次固定開銷 1,659 tokens，其實大半就是 Jasper 的 CLAUDE.md。
- `--bare` 會連 keychain 憑證都不讀（變「未登入」），不能用。`--setting-sources ""` 可行：登入保留、CLAUDE.md 不載，固定開銷 1,688 → 446 tokens（2026-09-27 實測）。
- 改法：`callClaude` 加 `--setting-sources ''`，子程序 cwd 設為 `rimoo-out/` 底下一個空目錄（避免專案 CLAUDE.md）；`CALL_OVERHEAD_TOKENS` 1,700 → 500，註解寫依據；README 的 24 × 1,700 對應改。
## 被誰擋住
- 無。做在 T-008 分支上。
## 驗收
- 假 claude 記到的參數含 `--setting-sources` 與空值；cwd 是空目錄。
- 真的 `claude -p` 探針：問「你收到哪些使用者指示」，帶旗標回 NONE 類、不帶回鐵則（票裡貼兩次的 context tokens）。
