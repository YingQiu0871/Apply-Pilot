# apply-pilot

A local, agent-agnostic pipeline for job and internship applications. It scans postings, removes duplicates, scores them against your own rubric, tracks every application in one Markdown table, tells you what is due a follow-up, checks letters for stock phrases and invented claims, and shows it all on a live dashboard.

It runs on your machine and keeps your data in a folder you own. Claude Code, Codex, DeepSeek or any OpenAI-compatible model can drive it.

[中文说明](README.zh-CN.md)

## Why

A serious search quickly reaches hundreds of postings, dozens of emails and several application portals. The hard parts are not writing letters. They are:

- knowing what you already applied to, so you don't apply twice or miss a reposted offer;
- scoring postings the same way every time, with your weights rather than a model's mood;
- following up once, at the right time, in the right thread;
- keeping letters honest and plain when an assistant writes the first draft.

apply-pilot does that bookkeeping. You and your agent do the judgement.

## Install

```bash
npm i -g github:YingQiu0871/apply-pilot
# optional: LinkedIn scanning and spreadsheet export
npm i -g playwright exceljs
```

Node 20 or later.

## Quick start

```bash
export APPLY_PILOT_HOME=~/job-search          # your data folder, keep it private
apply-pilot init --example pharma-m2-europe  # or: apply-pilot init (generic)
# edit ~/job-search/profile.json: your facts, rubric, filters, search queries
apply-pilot ui                               # dashboard on http://localhost:4321
```

Track an application:

```bash
apply-pilot add --company "Example Lab" --role "M2 internship, lipid nanoparticles" --url https://...
apply-pilot status 1 Applied --note "submitted from university mailbox with CV + letter"
apply-pilot followups
```

Score a posting, either with your agent:

```bash
apply-pilot eval prompt jd.txt > prompt.txt   # the agent answers with JSON
apply-pilot eval score answer.json --jd jd.txt
```

or directly with a model API:

```bash
DEEPSEEK_API_KEY=... apply-pilot eval run jd.txt --provider deepseek --add
```

## What is in the box

| Command | What it does |
|---|---|
| `init`, `doctor` | create and check the data folder |
| `ui` | live dashboard: KPIs, timeline of recent replies, rejections and follow-ups, searchable list |
| `add`, `status`, `note`, `list` | the tracker (`data/applications.md`), with duplicate detection by URL and by company + role |
| `followups` | rows due a follow-up (`afterDays`, `maxFollowUps`, `skipAppliedBefore`), split by email vs portal |
| `eval prompt / score / run` | rubric scoring with hard filters; works with an agent or with DeepSeek, OpenAI, OpenRouter, Ollama, Anthropic |
| `lint` | flags stock phrases, claims you listed as forbidden (but allows honest "I have not used X"), semicolons, long lists |
| `docx list / build` | fill a Word template paragraph by paragraph, every other part byte-identical (photo, styles) |
| `linkedin login / scan`, `triage` | job and post search with your own logged-in browser profile, then new-only candidates |
| `export xlsx` | tracker to a fresh spreadsheet |
| `careerops` | run a [career-ops](https://github.com/career-ops-hq/career-ops) script on the same data |

## Your profile

`profile.json` holds everything personal and is never part of this package:

- `candidate.facts`: the only experience an evaluator may count as a strength;
- `scoring.dimensions` and `thresholds`: your rubric, with weights in any unit;
- `filters`: excluded companies and keywords, which decide before any score;
- `followUp`: when a follow-up becomes due;
- `writing.bannedPhrases` and `forbiddenClaims`: what letters must not say;
- `sources.linkedin`: search queries and countries.

See `config/profile.example.json` and `examples/pharma-m2-europe/profile.json`.

## Agents

- [AGENTS.md](AGENTS.md): rules for any agent. It never sends without approval, never invents experience and logs every action.
- [CLAUDE.md](CLAUDE.md) and [`skills/apply-pilot`](skills/apply-pilot/SKILL.md): Claude Code.
- [docs/harnesses.md](docs/harnesses.md): Claude Code, Codex, DeepSeek/opencode and career-ops setup.

## Privacy

The package contains no personal data and needs none to run its tests. CVs, trackers, browser sessions, emails and API keys stay in `APPLY_PILOT_HOME`, and `apply-pilot init` writes a `.gitignore` there for browser sessions, scans and exports. Nothing in the CLI sends email or submits forms.

## Acknowledgements

apply-pilot reads and writes the same tracker format as **[career-ops](https://github.com/career-ops-hq/career-ops)** by Santiago Fernández de Valderrama (MIT). career-ops is an optional companion, not a dependency, and no career-ops code is included here. See [NOTICE.md](NOTICE.md).

## License

MIT © Yuning Gu
