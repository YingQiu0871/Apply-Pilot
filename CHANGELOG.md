# Changelog

## 0.2.0 — 2026-10-29

**Import**
- `apply-pilot import PATH` reads an existing application database from a file or a folder. Supported sources:
  - apply-pilot / career-ops `applications.md`, other Markdown tables;
  - Excel `.xlsx` (built-in reader, no extra dependency), CSV/TSV, JSON;
  - SQLite `.db` (Node 22.5+).
- Column names are recognised in English, French, German and Chinese, and statuses map to the tracker states.
- `import` previews first. `--write` appends only rows that are not tracked yet, and source files are never changed.
- The control panel has the same import card.

**Sources**
- 12 career-site systems: Workday, SuccessFactors, Phenom, Eightfold, SmartRecruiters, Personio, Greenhouse, Lever, Ashby, Teamtailor, Recruitee, Workable.
- `scan boards`: JobTech (Sweden) and Euraxess without a key; France Travail, Adzuna, Jooble and Careerjet with free keys in `APPLY_PILOT_HOME/.env` (template in `config/env.example`).
- `scan websearch`: multilingual queries through Brave Search API, Mojeek API or a self-hosted SearXNG.
- `scan all` runs all three.
- Each scan records found/kept per source, so a board that went silent stands out.
- Unsupported providers are reported instead of being skipped silently.

**Panel and agents**
- Redesigned control panel with pages: overview, applications (detail drawer), follow-ups grouped by channel, activity timeline, AI agent, tools.
- Light and dark themes; Chinese and English.
- AI agent picker: pair with Claude Code, Codex CLI or DeepSeek. Each can open in a terminal on your data folder or run delegated tasks (evaluate new postings, draft follow-ups) that only write to `output/`.
- `apply-pilot shortcut` puts a double-click launcher on the desktop: `.lnk` on Windows, `.command` on macOS, `.desktop` on Linux.
- `eval pipeline` scores pending `data/pipeline.md` postings through a model API.
- `jd` fetches job descriptions; `keywords` checks CV keyword coverage; `merge-additions` merges batch TSV tracker additions.

**Fixes**
- Hard filters match whole words (an excluded "CEA" no longer hits "Ceapro") and look at titles, not full descriptions.
- Dates no longer shift by a day across time zones.
- Follow-up channel detection treats applications made through a portal as portal applications.

**Platforms**
- CI runs the test suite and a CLI smoke test on Windows, macOS and Linux with Node 20, 22 and 24.

## 0.1.0 — 2026-10-29

First release: tracker, scoring, follow-ups, letter lint, DOCX templates, LinkedIn scan, dashboard.
