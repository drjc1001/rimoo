---
id: T-014
title: Claude Code 外掛：在對話裡打 `/rimoo` 就跑 Rimoo
type: feature
source: Jasper 拍板 2026-09-28「我直接做成 Claude Code 外掛」；npx 不直覺
priority: P1
created: 2026-09-28
---
## 需求
- 現況只有終端機一個入口（`npx rimoo analyze`）。做成 Claude Code 外掛，使用者在對話裡打 `/rimoo`。
- 外掛＝一份 Markdown 提示（skill），叫現有 CLI 做事，**不重寫分析**；一套程式、兩個門。
- `/rimoo` 的流程：
  1. 檢查 `node`（18 以上）與 `claude` 在不在 PATH；缺的講怎麼裝，停。Claude Code 原生版的機器可能沒裝 Node，這步一定要有。
  2. 跑 `npx -y rimoo@latest analyze --out ~/.rimoo`（不帶 `--yes`）。沒有終端機時 CLI 會印統計、重複指令、token 預估，然後自己停（exit 2），一個 token 都不花。
  3. 把統計與預估講給使用者，問三選一：試跑 2 段／全跑／不跑。
  4. 選了才跑 `… --yes`（試跑加 `--sample 2`）。一開始就用背景執行、輸出導到 `~/.rimoo/run.log`，每段完成報一行進度：Bash 工具預設 2 分鐘逾時、上限 10 分鐘（`BASH_DEFAULT_TIMEOUT_MS`／`BASH_MAX_TIMEOUT_MS`），逾時會被自動丟到背景，但全跑要幾十分鐘，不靠這個。
  5. 跑完讀 `~/.rimoo/report.md`，講前十條與四個檔案在哪；`CLAUDE.md` 不主動塞進 `~/.claude/CLAUDE.md`，使用者開口才附加。
- 輸出目錄用 `~/.rimoo`，不用 cwd 的 `rimoo-out/`：對話的 cwd 是使用者自己的專案，`report.md` 含原句，落在專案裡會被 commit 出去。
- 檔案放同一個 repo，repo 自己當 marketplace（官方文件允許，不另開 repo）：
  - `plugin/.claude-plugin/plugin.json`（name `rimoo`、version 跟 package.json 同步、description、author、repository）
  - `plugin/skills/rimoo/SKILL.md`（上面的流程）。frontmatter：`name: rimoo`（skill 名＝外掛名時，官方文件說 `/rimoo` 與 `/rimoo:rimoo` 都能打；使用者自己已有 `/rimoo` 時只剩帶前綴的）、`description`、`disable-model-invocation: true`（模型不會自己跑，只有使用者打才跑）、`allowed-tools` 先試窄的 `Bash(npx rimoo *)`／`Bash(node --version)`，不支援樣式就不放行，讓使用者按一次同意；不放行整個 Bash。
  - repo 根 `.claude-plugin/marketplace.json`（`name: rimoo`、`owner`、`plugins[0] = { name: rimoo, source: "./plugin/" }`）
  - npm 的 `files` 白名單只有 dist／README／LICENSE，外掛檔不會進套件。
- 使用者安裝兩行（寫進 README「Install as a Claude Code plugin」一節，npx 那節保留）：
  ```
  /plugin marketplace add drjc1001/rimoo
  /plugin install rimoo@rimoo
  ```
- 版本：`plugin.json` 有 `version` 就釘住，改了才更新；跟 npm 一起 bump（不寫 version 會改用 git SHA、每次 push main 都算新版，太吵）。
- 官方文件（2026-09-28 查）：https://code.claude.com/docs/en/skills.md 、https://code.claude.com/docs/en/plugins/manifest-reference.md 、https://code.claude.com/docs/en/plugins/create-marketplace.md 、https://code.claude.com/docs/en/plugins/security.md 。任何人都能發，不用審；只有進 Anthropic 官方目錄才要審。
- 已知限制：外掛以使用者本人權限跑；`npx` 需要機器上有 Node（Claude Code 原生版不附 Node）；`claude -p` 巢狀在對話裡跑，我們的 runner 已拿掉 `CLAUDECODE` 環境變數（T-004 實測可跑），官方文件沒寫這件事，做的時候在對話裡實跑一次確認。

## 被誰擋住
- 無。從 main（PR #2 之後）開分支 `T-014-plugin`。

## 驗收
- `claude plugin validate ./plugin --strict` 過（本機、不花額度）。
- 本機裝：`/plugin marketplace add ./` → `/plugin install rimoo@rimoo` → 斜線選單看得到 `/rimoo`；打下去走到第 3 步的問句，沒選就沒花。
- Jasper 本機選「試跑 2 段」跑完看到前十條（花 2 段額度，他點頭才跑）。
- `node --test`：plugin.json 與 marketplace.json 可解析、兩邊 name 一致、SKILL.md 有 frontmatter 且提到 `--out` 與 `--yes`。
- 派工規則不變：子代理不呼叫真的 `claude`、不碰 git；`claude plugin validate` 由 Fable 跑。

## 自驗 2026-09-28（Opus）
- 新增：`plugin/.claude-plugin/plugin.json`、`plugin/skills/rimoo/SKILL.md`、`.claude-plugin/marketplace.json`、`src/plugin.test.ts`（4 個測試）。
- 修改：`README.md` 在「Install / run」下加「From Claude Code」一節（兩行安裝＋一句 `/rimoo` 做什麼）。
- `npm run typecheck`：exit 0。`npm test`：exit 0，134 個全過（原 130＋新 4）。
- 沒驗到、不確定：
  1. `claude plugin validate ./plugin --strict` 沒跑（規矩不准跑真的 `claude`），`allowed-tools` 的 `Bash(npx -y rimoo@latest *)` 樣式、以及背景執行時後面接 `> ~/.rimoo/run.log 2>&1` 會不會被這個樣式放行，都沒驗。
  2. 本機安裝、斜線選單、對話裡實跑（含巢狀 `claude -p`）都沒做，交主代理。
  3. SKILL.md 多寫了兩個 CLI 實際會走到的分支：所有段都已完成時 CLI 停在「Not merging」（也是 exit 2）→ 照樣問三選一；找不到 `claude` 時 CLI 回 exit 0 並提示 → 轉述後停。
  4. `> ~/.rimoo/run.log` 依賴第 2 步已建立 `~/.rimoo`（第 2 步會寫 prompts，所以會在），沒另外 `mkdir`。

## 審後修正與自驗 2026-09-28（Fable）
- 修正：`marketplace.json` 補 `description`（`claude plugin validate . --strict` 原本因缺它退回）；`allowed-tools` 加 `Bash(command -v claude)`（第 1 步會跑）。
- `claude plugin validate ./plugin --strict`、`validate . --strict`、`validate ./plugin/skills --strict`：三個都過（exit 0）。
- `npm run typecheck` exit 0；`npm test` exit 0，134／134。
- 本機安裝（user scope）：`claude plugin marketplace add ./` → `claude plugin install rimoo@rimoo` → `claude plugin list` 顯示 rimoo@rimoo 0.1.0 enabled；`claude plugin details` 認到 Skills (1) rimoo，常駐成本約 77 tokens／每個 session，觸發一次約 1.2k。快取在 `~/.claude/plugins/cache/rimoo/rimoo/0.1.0/`，內容就是 plugin.json＋SKILL.md。
- 第 2 步實跑（在 Claude Code 對話的 Bash 裡、沒有 TTY、不帶 `--yes`）：`npx -y rimoo@latest analyze --out ~/.rimoo` 從 npm 抓 0.1.0，印統計（24,126 則／61 專案）、24 段、預估 2,172,274 tokens，然後「Not running: there is no terminal to ask for a yes」exit 2；`~/.rimoo/` 只有 stats／repeated／manifest／prompts／chunks，findings 0 個＝沒送任何東西給 Claude。
- 沒驗到（要 Jasper 在對話裡打 `/rimoo` 才看得到）：斜線選單有沒有列出 `/rimoo`；`allowed-tools` 的樣式對 `… > ~/.rimoo/run.log 2>&1` 這種帶重導向的指令放不放行（不放行就是多按一次同意，不影響結果）；試跑 2 段（花他額度，等他點頭）。
- marketplace 目前指向本機目錄 `/data/repos/1011_Project_Rimoo`；merge 後換成 `drjc1001/rimoo`（GitHub）重裝一次，走使用者真正會走的路。
