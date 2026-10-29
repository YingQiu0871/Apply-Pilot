# Changelog

## 0.3.1 — 2026-10-29

- The installer no longer sets `APPLY_PILOT_HOME`. In 0.3.0 it pointed users who had no such variable at a new, empty `Documents\Apply-Pilot`, so existing data seemed to vanish.
- First-run screen: when the data folder holds no data, the panel asks for one. You can create a new folder or pick an existing one, and it shows how many applications it found there.
- Tools → Data folder switches folders while the panel runs.
- The choice is saved in a per-user settings file (`%APPDATA%\Apply-Pilot\settings.json`, `~/Library/Application Support/Apply-Pilot/settings.json`, `~/.config/apply-pilot/settings.json`).
- The data folder is looked up in this order: `APPLY_PILOT_HOME`, the settings file, then `./apply-data`.
- New `apply-pilot home [PATH] [--init]` shows or saves the data folder.
- Fixed: the panel process crashed when a task finished.
- Upgrading from 0.3.0: Windows removes the variable that 0.3.0 set. If the panel then asks for a folder, choose your existing one: it shows the number of tracked applications before you confirm.

## 0.3.0 — 2026-10-29

- Windows installer: per-user `.msi` in English and Chinese, built by `npm run build:msi` (WiX Toolset 3.14) and attached to each GitHub release by the `msi` workflow. It needs no administrator rights and bundles Node.js, JSZip and ExcelJS. It adds Start-menu and desktop icons, puts `apply-pilot` on `PATH`, and sets `APPLY_PILOT_HOME` to `Documents\Apply-Pilot` unless one is already set. The first launch creates the data folder. Uninstalling keeps the data.
- New icon (`assets/icon.svg`, `assets/apply-pilot.ico`), used by the panel, the desktop launcher and the installer. `npm run build:icons` re-renders it.
- `PRIVACY.md`: what is stored, where, and when data leaves your computer.

## 0.2.1 — 2026-10-29

- Project name is now written **Apply-Pilot** (repository `YingQiu0871/Apply-Pilot`; the old URL redirects). The command, npm package and file names stay lowercase `apply-pilot`.
- README is bilingual, English and Chinese side by side; `README.zh-CN.md` is merged into it.
- New `INSTALL_FOR_AI.md`: step-by-step installation and setup for AI agents, with a check after each step.
- Desktop launchers are named `Apply-Pilot.lnk`, `Apply-Pilot.command` and `Apply-Pilot.desktop`.

## 0.2.0 — 2026-10-29

**Import**
- `apply-pilot import PATH` reads an existing application database from a file or a folder. Supported sources:
  - Apply-Pilot / career-ops `applications.md`, other Markdown tables;
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
