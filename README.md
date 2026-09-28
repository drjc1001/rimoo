# Rimoo

**Remember how you work.**

Discover the engineering habits hidden inside your AI coding history. Runs locally on your Claude Code history.

## Why

Measured on one developer's year of Claude Code history (about 24,000 prompts):

- The same instruction was typed again 842 times ("merged, help me deploy" alone: 49 times).
- In a sample of 1,930 prompts, about a third were re-teaching a habit that had already been stated.
- One prompt in thirty was a correction, and each one cost about 3.6 minutes of waiting for a redo.

Rimoo turns those habits into a CLAUDE.md that Claude loads on its own. In a blind check, 18 replies that had once been corrected were re-run with that file, and all 18 passed. (They were chosen because they had been corrected, the re-run used the same facts, and the judge was the developer whose rules they are, so read it as "would pass now", not "18 times better".)

## Install / run

```bash
npx rimoo analyze
```

### From Claude Code

Add Rimoo as a Claude Code plugin:

```text
/plugin marketplace add drjc1001/rimoo
/plugin install rimoo@rimoo
```

Then type `/rimoo` in a conversation. It shows the numbers and the cost estimate first, asks before it sends anything, and writes the results to `~/.rimoo`.

### What it costs

The analysis runs on your own Claude Code (`claude -p`), so no API key is needed. It uses your usual Claude Code model unless you pass `--model`.

A real example: a year of history, about 24,000 prompts, came to 24 calls, plus a few small ones to merge the results, and roughly 2.2 million tokens all told. Measured on Claude Fable 5.1, one chunk was about 110,000 tokens, took 8 minutes and would cost $3.40 at API list price; most of the output tokens are the model's own thinking. On a subscription it counts toward your plan.

- Rimoo prints an estimate and asks before it runs anything.
- Start with a trial: `npx rimoo analyze --sample 2`. It prints what the two chunks really used and what the full run would take.
- `--model sonnet` costs about a seventh: on Claude Sonnet 5 a chunk of the same size took 5 minutes and $0.49 at list price.
- `--concurrency 4` runs four chunks at once.
- Finished chunks are kept, so you can stop and continue later.

## What you get

These files in `./rimoo-out`:

- `report.md`: the full analysis, with your own prompts quoted as evidence.
- `CLAUDE.md`: your rules as instructions, ready to drop into a project.
- `SKILL.md`: the same working style as a portable skill.
- `workstyle.json`: the rules in a machine-readable form.
- `share.txt`: a short summary to paste into a README or a LinkedIn post.
- `share.html` and, when Chrome is installed, `share.png`: a 1080×1080 card for LinkedIn or X. Pass `--lang en` for English titles.

`share.txt` looks like this:

```text
My AI coding workstyle

23,174 prompts analyzed
57 projects

Top patterns:
• Result first
• No fluff
• Plan before coding
• Backend first
• E2E before done

Found with Rimoo — npx rimoo analyze
```

### Use it

When the run ends, Rimoo asks whether to install `SKILL.md` as `/my-workstyle` in Claude Code; `--install-skill` installs it without asking. `CLAUDE.md` is never installed for you: copy it into a project's root folder to have Claude follow the rules there.

## Privacy

- Everything runs on your machine. The only network calls are the ones your own Claude Code makes.
- Pasted contents in your history are never read.
- `CLAUDE.md`, `SKILL.md`, `share.txt`, `share.html` and `workstyle.json` go through a gate that removes file paths, project names, emails, URLs, phone numbers and keys. `--allow-paths` keeps paths and project names.
- `report.md` keeps your own quotes and stays local. Don't share it as is.

## How it works

1. Parse `~/.claude/history.jsonl` locally and count prompts, projects and dates.
2. Find the instructions you type again and again.
3. Split the history into chunks of about 1,000 prompts.
4. Claude reads each chunk and lists your habits with quotes as evidence; the findings are then merged into one set of rules.

## Options

```text
Usage:
  rimoo analyze [options]

Options:
  --history <path>   history.jsonl to read (default: ~/.claude/history.jsonl)
  --out <dir>        where to write results (default: ./rimoo-out)
  --similarity <0-1> how alike two instructions must be to count as one (default: 0.8)
  --project <text>   only analyze projects whose path contains this text
  --since <date>     only analyze prompts from this date on, YYYY-MM-DD
  --sample <n>       only the first n chunks, for a quick trial run
  --chunk-size <n>   prompts per chunk (default: 1,000)
  --prepare-only     stop after writing the prompts; do not run Claude Code
  --yes              run Claude Code without asking first
  --concurrency <n>  chunks to analyze at once, 1 to 4 (default: 1)
  --force            analyze chunks and merge again even if already done
  --model <name>     model for Claude Code to use, passed to claude --model as is
  --with-transcripts give short prompts Claude's previous message, read from the session
                     transcripts next to the history (more to analyze, so it costs more)
  --allow-paths      keep file paths and project names in CLAUDE.md, SKILL.md, workstyle.json and the share files
  --lang en          share.txt and the share card in English (translates the top titles once with Claude Code)
  --card-size <WxH>  share card size, e.g. 1200x627 (default: 1080x1080)
  --install-skill    add SKILL.md to Claude Code as /my-workstyle without asking
  --skill-name <name>
                     install the skill under this name instead (a-z, 0-9 and -)
  --force-skill      replace an installed skill of the same name that has different rules
  -h, --help         show this help
```

## Requirements

- Node 18 or later.
- Claude Code installed and logged in, with the `claude` command on your PATH. Without it, Rimoo writes the prompts to `rimoo-out/prompts/` for you to paste into Claude yourself.
- Not tested on Windows yet.

## Status

Early version, Claude Code only. Cursor, Codex and others later.

## License

MIT.
