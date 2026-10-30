# Changelog

## 0.5.0 — 2026-10-30

- Cover letters: today's work drafts one for each tracked application with status Evaluated and a score at or above the Apply threshold (default 80/100), up to `profile.daily.letters` per run (default 3).
- Letters wait in the review queue. Edit one on the Today page, then save it. Saving writes `Cover_Letter.txt`, `.docx` and, with Word or LibreOffice, `.pdf` to a new folder under `output/letters/`, and logs it in the tracker. Nothing is sent and the status does not change.
- Answers are checked: forbidden claims and square-bracket placeholders are refused, also after you edit. Stock phrases and other writing issues are shown on the card.
- Optional `writing.letterTemplate` (`{ "file": "...", "first": 3, "last": 16 }`) fills your own .docx template, keeping its photo and styles. `writing.letterLanguage` sets the language (default English).
- New: `today --only letters`, and `review approve ID` saves a letter.

## 0.4.2 — 2026-10-30

- AI page: cards keep their layout when you choose an AI or run a test. Status labels have their own row, the result has a reserved place, and a long error is folded under "Details".
- A failed dsh start now shows the missing module first.

## 0.4.1 — 2026-10-30

- DeepSeek Harness (`dsh`) is a new AI choice. It uses your signed-in Harness, so no separate API key is needed.
- It runs like the other workers, without tools, in an empty temporary folder. Apply-Pilot reads the plugin list of your dsh at run time and disables every tool plugin, also ones a later dsh adds. Sessions stay in the temporary folder and are removed after each answer.
- dsh 0.1.5 takes its task only as a command-line argument, so a request is limited to 28,000 characters. It is started through its own Node, without a shell.

## 0.4.0 — 2026-10-30

Apply-Pilot now runs the daily work itself. You choose an AI once, then press one button and decide what comes back.

**Today page**
- New first page with "Start today's work": scan, evaluate pending postings, draft due email follow-ups. Limits are in `profile.daily` (default 10 evaluations and 5 drafts per run).
- First-run steps on the same page: choose an AI and pass a connection test, paste your CV, then check and confirm the experience, languages and search terms the AI lists. Search terms become a keyless Euraxess source if you have no sources yet. The old `profile.json` is kept as a backup.
- Review queue (`data/review.json`): nothing reaches the tracker until you decide. Add an evaluation to the tracker or ignore it. Edit a follow-up, copy it or open it in your mail app, then log it as sent. Pages Apply-Pilot cannot read are listed once for you to open.
- New commands: `today`, `review`, `agent --test`.

**AI connection**
- Test connection on the AI page, with a clear message for sign-in, quota and network problems.
- Enter the DeepSeek key on the AI page. It is stored in `.env` in the data folder.

**Safety**
- Background AI work now runs without tools. It starts in an empty temporary folder and gets one prompt through stdin. Claude Code runs with its tools off, Codex in its read-only sandbox, and DeepSeek is a plain API call. Apply-Pilot does the reading, fetching and writing itself.
- Answers are checked before they enter the queue. Forbidden claims are refused, also after you edit a draft. Companies and links come from the scan, and a recipient is kept only if it appears in your own notes.

**Changed**
- The old agent tasks that wrote to `output/` are gone. opencode is no longer used for background work; the DeepSeek agent now needs `DEEPSEEK_API_KEY`. Opening an agent in a terminal works as before.

## 0.3.3 — 2026-10-30

- Follow-ups: audit notes and bracketed tags such as `[mailbox audit 2026-10-29]` no longer reset the days of silence, so these applications are not hidden from the follow-up list.

## 0.3.2 — 2026-10-30

**Timeline**
- The application drawer now has a progress bar (evaluated, applied, reply, interview, outcome) and a rail with an icon per event, the time of day, scheduled send times and the gap between events. Long entries expand, and the full notes fold away.
- The Activity page has a stacked daily chart. Hover a bar for the counts and click it to filter by day.
- Category and status names appear in English and Chinese side by side, whichever language the panel uses. Notes keep the language they were written in.

**Finer categories**
- Events now carry a finer `type` under the broad `kind`: application, outreach, documents sent, my reply, follow-up, acknowledgement, auto-reply, positive reply, asked for more, under review, interview invite and held, position filled, rejected after interview, preparation, evaluation, audit.
- Applications get a stage inside their status. To decide: materials ready, recommended, consider, weak fit, not scored. Applied: queued, followed up, acknowledged, by email, outreach, via portal. Replied: meeting, positive, asked for more, under review, answered. Rejected: after interview, position filled, other.
- The applications list can filter by stage, and the overview cards show the largest stages.

**Fixes**
- "Not applied", "not yet submitted" and "already applied" no longer count as an application being sent.
- Rejections that only say "position filled" or "cannot host" are now rejections, not replies.
- Audit notes that mention an interview no longer show up as interviews. "asked whether..." in an outgoing email is no longer a reply.
- Timeline entries are no longer cut at 240 characters, and trailing `Link:` fields are dropped from them.
- Dated entries labelled `Note:` now reach the timeline.
- On narrow screens the navigation runs in one row. The closed drawer no longer casts a shadow on the page edge.

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
