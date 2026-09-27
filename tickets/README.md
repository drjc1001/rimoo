# Tickets — 1011 Rimoo（Claude Code 歷史 → 個人工作風格）

> 一票一檔、資料夾＝狀態、`git mv` 轉移（同 1010／081 規則）。狀態：0-inbox／1-planned／2-doing／3-review／4-done／8-icebox／9-rejected。

## 本專案特記
1. 規格＝`rimoo_mvp_spec.md`；票號對應 §20「First Engineering Ticket」拆成的垂直切片。範圍外的一律進 8-icebox（T-900），不塞進程式。
2. 這是本機 CLI（`npx rimoo analyze`），沒有租戶；鐵則 1 的問句換成「別的開發者的機器會怎樣」（Windows 路徑、沒裝 `claude`、history 是空的、非中文使用者）。
3. 原型已存在：`/data/repos/079_wenchi_cram_school/analyze/taste/`（`extract_turns.py`＋8 個分片的 findings＋合併成 `jasper-taste` skill）。Rimoo 就是把那三個晚上的手工流程做成套件；分片大小、findings 格式、驗收基準都沿用它。
4. LLM 分析一律走使用者自己的 Claude Code 訂閱（本機 `claude -p`），不要 API key、不另外付費。
5. 驗收基準：`~/.claude/skills/jasper-taste/SKILL.md` 的十條鐵則＝標準答案；Rimoo 跑出來的前十條跟它並排一張表，Jasper 看表裁。
6. 目前不是 git repo；T-001 第一步 `git init`（本地）。GitHub repo 與 npm 發佈（`rimoo` 這個名字 2026-09-27 查過沒人用）由 Jasper 決定時間（T-008）。
7. 派工：T-001～T-006 由 Opus 寫、Fable 審驗；每張票有 `node --test` 測試才算做完，驗收都在 Jasper 本機的真實 history 上跑。

## 2026-09-27 量到的基準（Jasper 本機）
| 項目 | 數字 |
|---|---|
| `~/.claude/history.jsonl` 行數 | 24,030（完全重複 1 行） |
| 專案數 | 61 |
| 日期範圍 | 2025-11-01 ～ 2026-09-27（2026 年 24,017 則） |
| 每則字元數 | 平均 82、中位 46、九成在 177 以下、最長 7,047 |
| 斜線指令 | 891（`/compact` 490） |
| 含貼上內容（pastedContents） | 1,480 |
| 8 字元以下短回覆 | 1,307 |
| 最常重複（正規化後） | please continue 52、yes, please 36、merge it into stage 35、commit this 32、merged, help me deploy 20＋17 |
