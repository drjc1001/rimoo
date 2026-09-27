# Rimoo

**Remember how you work.**

Discover the engineering habits hidden inside your AI coding history. Runs locally on your Claude Code history.

## Install / run

```bash
npx rimoo analyze
```

### What it costs

The analysis runs on your own Claude Code (`claude -p`), so no API key is needed. It uses your usual Claude Code model unless you pass `--model`.

A real example: a year of history, about 24,000 prompts, came to 24 calls, plus a few small ones to merge the results, and roughly 2.2 million tokens all told. Measured on Claude Fable 5.1, one chunk was about 110,000 tokens, took 8 minutes and would cost $3.40 at API list price; most of the output tokens are the model's own thinking. On a subscription it counts toward your plan.

- Rimoo prints an estimate and asks before it runs anything.
- Start with a trial: `npx rimoo analyze --sample 2`. It prints what the two chunks really used and what the full run would take.
- `--model sonnet` costs about a seventh: on Claude Sonnet 5 a chunk of the same size took 5 minutes and $0.49 at list price.
- `--concurrency 4` runs four chunks at once.
- Finished chunks are kept, so you can stop and continue later.

## What you get

Five files in `./rimoo-out`:

- `report.md`: the full analysis, with your own prompts quoted as evidence.
- `CLAUDE.md`: your rules as instructions, ready to drop into a project.
- `SKILL.md`: the same working style as a portable skill.
- `workstyle.json`: the rules in a machine-readable form.
- `share.txt`: a short summary to paste into a README or a LinkedIn post.

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

## Privacy

- Everything runs on your machine. The only network calls are the ones your own Claude Code makes.
- Pasted contents in your history are never read.
- `CLAUDE.md`, `SKILL.md`, `share.txt` and `workstyle.json` go through a gate that removes file paths, project names, emails, URLs, phone numbers and keys. `--allow-paths` keeps paths and project names.
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
  --allow-paths      keep file paths and project names in CLAUDE.md, SKILL.md, workstyle.json and share.txt
  -h, --help         show this help
```

## Requirements

- Node 18 or later.
- Claude Code installed and logged in, with the `claude` command on your PATH. Without it, Rimoo writes the prompts to `rimoo-out/prompts/` for you to paste into Claude yourself.
- Not tested on Windows yet.

## Status

Early version, Claude Code only. Cursor, Codex and others later.
