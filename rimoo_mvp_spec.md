# Project Rimoo

> **Rimoo — Remember how you work.**

Rimoo is a local-first developer tool that analyzes AI coding history and turns repeated working patterns into reusable engineering rules and skills.

The first version focuses only on **Claude Code**.

---

## 1. Product Idea

Developers repeatedly teach AI coding assistants the same things:

- Give the result first.
- Use bullets.
- Do not over-explain.
- Plan before coding.
- Break work into tickets.
- Backend first.
- Test before integration.
- Run E2E before marking work complete.
- Stop repeating a failed approach.
- Avoid wasting tokens on directions that are not improving.

Most developers do not realize how often they repeat these instructions.

Rimoo analyzes historical AI coding conversations and answers:

> **How do you actually work with AI?**

The goal is not simply to back up conversations.

The goal is to extract:

- communication preferences
- engineering rules
- recurring workflows
- debugging habits
- architecture tendencies
- testing expectations
- repeated failed approaches
- reusable skills

---

## 2. Brand Meaning

### Name

**Rimoo**

### Tagline

> **Remember how you work.**

### Brand Idea

Every time a developer works with an AI coding assistant, they leave behind signals:

- how they plan
- how they debug
- how they make decisions
- what they repeat
- what they reject
- what they expect from AI

Most of those signals disappear inside old conversations.

Rimoo turns those signals into something reusable.

It learns working patterns, extracts rules, and helps carry them across projects and AI tools.

Not just what you worked on.

**How you work.**

---

## 3. Initial Launch Story

The product idea came from discovering that Claude Code conversation transcripts are periodically cleaned up, while:

```text
~/.claude/history.jsonl
```

can still contain a large historical record of user prompts.

Example real-world dataset:

- 23,174 prompts
- 57 projects
- roughly one year of Claude Code usage

The surprising discovery was that the history contained more than old coding questions.

It revealed recurring engineering habits.

This becomes Rimoo's initial product story:

> I found 23,174 Claude Code prompts on my machine.
>
> So I analyzed them to find out how I actually build software with AI.
>
> Rimoo found the rules I had been teaching Claude over and over again.

---

# 4. MVP Goal

The MVP should do one thing extremely well:

> **Analyze Claude Code history and generate a reusable personal AI working profile.**

The MVP should be local-first.

Do not start with a full SaaS platform.

---

## 5. MVP Input

Primary input:

```text
~/.claude/history.jsonl
```

Optional later input:

```text
~/.claude/projects/
```

For the first version, support only Claude Code.

Do not support Cursor, Codex, Gemini CLI, or other agents yet.

---

# 6. MVP User Experience

Primary command:

```bash
npx rimoo analyze
```

Possible future CLI:

```bash
rimoo analyze
rimoo report
rimoo extract
rimoo skill
rimoo export
```

Expected flow:

```text
Claude Code history
        ↓
Parse locally
        ↓
Basic statistics
        ↓
Prepare useful chunks
        ↓
Claude analyzes history
        ↓
Extract repeated patterns
        ↓
Generate working profile
        ↓
Generate reusable rules
        ↓
Export report / CLAUDE.md / SKILL.md
```

---

# 7. Important Architecture Principle

Rimoo should avoid paying for LLM analysis during the MVP.

Whenever possible:

> **Use the user's own Claude Code / coding agent for analysis.**

Rimoo should handle:

- reading local files
- parsing data
- deduplication
- filtering
- grouping
- chunk preparation
- prompt preparation
- exporting structured results

Claude should handle:

- semantic interpretation
- clustering repeated behavior
- identifying preferences
- identifying engineering principles
- summarizing patterns
- generating reusable rules

This keeps:

- AI cost low
- privacy stronger
- architecture simple
- MVP fast

---

# 8. First Analysis Output

Rimoo should generate a report similar to:

```text
Rimoo analyzed 23,174 prompts across 57 projects.

Your strongest working patterns:

1. Result first
2. No unnecessary explanation
3. Plan before implementation
4. Break work into tickets
5. Backend first
6. Tests before frontend integration
7. E2E before completion
8. Avoid premature abstraction
9. Stop when a direction is not improving
10. Do not keep burning tokens on failed approaches
```

---

# 9. Analysis Categories

The initial analyzer should classify findings into these categories.

## Communication Style

Examples:

- result first
- bullets preferred
- concise responses
- no filler
- explain only when needed

## Planning Style

Examples:

- plan before coding
- break large work into tickets
- define scope before implementation
- prefer explicit acceptance criteria

## Implementation Style

Examples:

- backend first
- avoid premature abstraction
- prefer simple implementations
- build incrementally

## Testing Style

Examples:

- integration tests before frontend integration
- E2E before completion
- verify behavior before declaring done
- reproduce bugs before fixing

## Debugging Style

Examples:

- stop repeating the same failed approach
- switch strategy when progress stalls
- inspect logs before guessing
- prefer root-cause analysis

## Architecture Style

Examples:

- recurring technology preferences
- repeated infrastructure choices
- rejected architecture patterns
- preferred levels of abstraction

## AI Collaboration Style

Examples:

- how Claude should report results
- when Claude should ask questions
- when Claude should continue autonomously
- how much explanation is wanted
- how Claude should react when stuck

---

# 10. Export Formats

The MVP should generate:

```text
report.md
```

Detailed analysis report.

```text
CLAUDE.md
```

Reusable Claude Code instructions based on extracted patterns.

```text
SKILL.md
```

Portable version of the user's working style.

Optional:

```text
workstyle.json
```

Structured machine-readable representation.

Example:

```json
{
  "communication": [
    "result_first",
    "no_unnecessary_explanation"
  ],
  "planning": [
    "plan_before_implementation",
    "break_work_into_tickets"
  ],
  "implementation": [
    "backend_first",
    "avoid_premature_abstraction"
  ],
  "testing": [
    "integration_tests_before_frontend",
    "e2e_before_done"
  ]
}
```

---

# 11. Shareable Output

Rimoo should eventually produce a compact shareable summary.

Example:

```text
My AI Coding Workstyle

23,174 prompts analyzed
57 projects

Top patterns:
• Result first
• No fluff
• Plan before coding
• Backend first
• E2E before done
```

This can later become:

- GitHub README snippet
- LinkedIn text
- X post
- shareable profile
- image card
- yearly "AI Coding Wrapped"

Do not build the full sharing platform in the MVP.

---

# 12. Distribution Strategy

Do not start with a large marketing website.

Initial distribution:

1. GitHub
2. LinkedIn
3. Developer communities
4. YouTube after a good visual demo exists

Initial launch content:

### Post 1

Claude Code had been deleting conversation history.

The surprising discovery:

```text
~/.claude/history.jsonl
```

still contained 23,174 prompts.

### Post 2

Core idea:

> Git remembers what changed.
>
> AI coding history remembers why.

Introduce the idea of engineering memory.

### Post 3

Core discovery:

> After analyzing 23,174 prompts, I found my own engineering habits.

Show the extracted rules.

Then:

> I built Rimoo so other developers can analyze theirs.

---

# 13. Website Strategy

Do not build a full SaaS website before validating usage.

A simple landing page is enough.

Suggested homepage:

```text
Rimoo

Remember how you work.

Discover the engineering habits hidden inside your AI coding history.

Analyze your Claude Code history locally.

[View on GitHub]
```

GitHub can be the primary product entry point initially.

---

# 14. What NOT to Build in MVP

Do not build:

- SaaS account system
- login
- billing
- cloud memory database
- MCP server
- team dashboard
- marketplace
- creator profiles
- skill ratings
- skill payments
- Cursor integration
- Codex integration
- GitHub App
- Jira integration
- Slack integration
- enterprise governance
- complex vector database infrastructure

These can be added only after validating demand.

---

# 15. Future Product Direction

Possible roadmap:

```text
Phase 1
Claude history → report

Phase 2
Report → CLAUDE.md / SKILL.md

Phase 3
Shareable workstyle profile

Phase 4
Cross-agent portability

Phase 5
Persistent Memory MCP

Phase 6
Skill sharing / creator profiles

Phase 7
Marketplace

Phase 8
Team / enterprise engineering governance
```

---

# 16. Future Memory Architecture

If Rimoo later becomes a SaaS:

```text
Claude Code / Codex / Cursor
        ↓
     Rimoo MCP
        ↓
     HTTPS API
        ↓
   Rimoo Cloud
        ↓
PostgreSQL + pgvector
```

Possible MCP tools:

```text
remember()
recall()
forget()
```

Memory scopes:

```text
global
workspace
project
```

Example memory:

```json
{
  "type": "engineering_rule",
  "scope": "global",
  "content": "Backend APIs should have integration tests before frontend integration."
}
```

---

# 17. Private Memory vs Public Skills

Future design principle:

```text
Private Memory
      ↓
Pattern extraction
      ↓
Reusable rule
      ↓
User review
      ↓
Public Skill
```

Never publish raw memory by default.

Memory may contain:

- company information
- client names
- source code
- infrastructure details
- credentials
- internal architecture
- private preferences

Public Skills should contain only abstract reusable behavior.

---

# 18. Possible Future Creator Layer

Future concept:

> **Turn how you work into something others can install.**

Creators may eventually publish:

- communication styles
- coding workflows
- code review styles
- debugging styles
- architecture styles
- product development methodologies

Examples:

```text
Backend-First Development
TDD Strict Mode
No-Fluff Communication
Startup MVP Mode
Security-First Review
Staff Engineer Review Style
```

Do not build this until users demonstrate demand for sharing their extracted workstyles.

---

# 19. Core Differentiation

Do not position Rimoo as:

> another AI memory product

Do not position Rimoo as:

> another skill marketplace

Initial positioning:

> **Discover the working patterns hidden in your AI coding history.**

Longer-term positioning:

> **Rimoo remembers how you work.**

Potential future differentiation:

```text
Raw AI history
      ↓
Behavior mining
      ↓
Personal working profile
      ↓
Reusable skills
      ↓
Portable across AI agents
```

---

# 20. First Engineering Ticket

## Ticket: Claude Code History Analyzer

Build a local-first CLI application named **Rimoo**.

### Requirements

1. Detect and read:

```text
~/.claude/history.jsonl
```

2. Parse the available records safely.

3. Generate basic statistics:

- total prompts
- unique projects
- date range
- prompts per project
- prompts over time
- most frequently repeated exact or near-exact instructions

4. Prepare the history for semantic analysis.

5. Use the user's existing Claude Code environment for qualitative analysis where practical.

6. Extract:

- communication preferences
- engineering workflow rules
- testing patterns
- debugging patterns
- architecture tendencies
- repeated instructions
- repeated failure patterns

7. Generate:

```text
report.md
CLAUDE.md
SKILL.md
workstyle.json
```

8. Keep processing local-first.

9. Do not add:

- backend
- database
- login
- cloud sync
- web app
- marketplace

### Success Criteria

A developer should be able to run:

```bash
npx rimoo analyze
```

and receive a useful personal AI coding workstyle report from their existing Claude Code history.

---

# 21. Product Principle

Before adding any new feature, ask:

> Does this help a developer better understand or reuse how they actually work?

If not, it probably does not belong in the first version.

---

# 22. One-Line Product Definition

> **Rimoo turns your AI coding history into a reusable working style.**

