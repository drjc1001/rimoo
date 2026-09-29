---
name: rimoo
description: Analyze your Claude Code history with Rimoo and turn repeated instructions into a reusable CLAUDE.md and SKILL.md. Use only when the user types /rimoo.
disable-model-invocation: true
allowed-tools: Bash(node --version), Bash(command -v claude), Bash(npx -y rimoo@latest *)
---

# Rimoo

Run the Rimoo CLI on the user's Claude Code history. Follow the steps in order. Keep every message to the user short and in plain words.

## Rules

- Never pass `--yes` before the user has chosen option 1 or 2 in step 3.
- Always use `--out ~/.rimoo`. Never use another output directory.
- Never paste the user's prompts back, except what the CLI already printed.
- Do not write to `~/.claude/CLAUDE.md` or any other file unless the user asks.
- Run each rimoo command once. If it stops early, show the last lines of the log and stop; do not run it again.

## Steps

1. Check the tools.
   - Run `node --version`. It must be 18 or later.
   - Run `command -v claude`. Claude Code is already running, so it is normally there.
   - If either is missing, tell the user in one or two sentences how to install it (Node: https://nodejs.org) and stop.

2. Get the numbers without spending anything.
   - Run `npx -y rimoo@latest analyze --out ~/.rimoo` without `--yes`.
   - There is no terminal, so the CLI prints the statistics, the repeated instructions and the token estimate, then stops on its own with exit code 2 and the line "Not running: there is no terminal to ask for a yes".
   - Exit code 2 here is expected and means nothing was sent to Claude. Do not retry. Do not add `--yes` yet.
   - If it stops with "Not merging" instead, all chunks are already done and only the merge is left; go to step 3 and offer the full run.
   - If it says the `claude` command was not found, show that message and stop.

3. Ask before spending.
   - Tell the user: how many prompts and projects, the date range, the top repeated instructions, and the estimated tokens for the full run. Repeat the CLI's estimate; do not invent numbers.
   - Ask one question with three options:
     1. Trial run of 2 chunks
     2. Full run
     3. Stop
   - Do not run anything until the user answers.

4. Run in the background.
   - On 1: run `npx -y rimoo@latest analyze --out ~/.rimoo --yes --sample 2 > ~/.rimoo/run.log 2>&1` in the background.
   - On 2: run `npx -y rimoo@latest analyze --out ~/.rimoo --yes > ~/.rimoo/run.log 2>&1` in the background.
   - On 3: say nothing was sent to Claude and stop.
   - The trial always takes the first two chunks; running it again reuses them and costs nothing.
   - Start it in the background from the beginning. The Bash tool times out after 2 minutes by default, and a full run can take tens of minutes.
   - While it runs, read `~/.rimoo/run.log` now and then. The CLI prints one line per chunk (`chunk 1/24 · … tokens · …`); report each finished chunk in one line.
   - If the log shows an error or a failed chunk, show the user the last lines of the log and stop.

5. Show the result and ask to install, in one message.
   - Read `~/.rimoo/report.md` and show the user the top patterns (the numbered list near the top).
   - Say where the files are:
     - `~/.rimoo/report.md`
     - `~/.rimoo/CLAUDE.md`
     - `~/.rimoo/SKILL.md`
     - `~/.rimoo/rules.md`
     - `~/.rimoo/workstyle.json`
     - `~/.rimoo/share.txt`
     - `~/.rimoo/share.png` (`~/.rimoo/share.html` when Chrome is not installed)
   - Say that `report.md` keeps their own quotes and stays local, and that `SKILL.md` holds the top rules while `rules.md` has all of them.
   - The last line of this same message is exactly: "Install this as /my-workstyle so Claude loads it in future sessions? (yes / no)". Ask no other question before it.
   - Do not offer to run the remaining chunks. Explain it only if the user asks.
   - Do not write to `~/.claude/CLAUDE.md` or any other file unless the user asks.
   - If the user wants English titles on the card, run the same command again with `--lang en`; that makes one small call to translate five titles.

6. Install on the answer.
   - On yes run `npx -y rimoo@latest analyze --out ~/.rimoo --install-skill` (all chunks are done, so this only re-exports and installs; nothing is sent to Claude). After a trial run, add `--sample 2` so it uses the same two chunks.
   - Then show the user the three lines under `Next` (`接下來` when the rules are in Chinese) that the CLI printed at the end, as they are.
   - If the CLI says the skill already exists with different rules, ask only: "Replace it (--force-skill) or install under another name (--skill-name <name>)?" Then run the same command with the flag they chose.
   - On no, say the files are in `~/.rimoo/SKILL.md` and `~/.rimoo/rules.md`, and give the other ways from `Next`: run again with `--install-skill` later, or copy `~/.rimoo/CLAUDE.md` into a project's root folder.
