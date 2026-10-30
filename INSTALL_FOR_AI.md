# Apply-Pilot: installation guide for AI agents

This file is written for an AI agent (Claude Code, Codex, opencode, DeepSeek or similar) that has been asked to install and set up Apply-Pilot for a user. Follow the steps in order. Each step has a check, so do not move on until it passes. Read [AGENTS.md](AGENTS.md) before you run anything against the user's real data. Its rules apply throughout.

本文件写给受用户委托安装 Apply-Pilot 的 AI agent。请按顺序执行，每一步都有检查项，通过后再进行下一步。动用户真实数据之前，先读 [AGENTS.md](AGENTS.md)。

## Facts to know first

| Item | Value |
|---|---|
| Project name | Apply-Pilot |
| Repository | `https://github.com/YingQiu0871/Apply-Pilot.git` |
| CLI command | `apply-pilot` (lowercase) |
| Runtime | Node.js 20 or later; npm |
| Required dependency | `jszip` (installed by `npm install`) |
| Optional dependencies | `playwright` (LinkedIn scan, `jd --browser`), `exceljs` (`export xlsx`) |
| Data folder | `APPLY_PILOT_HOME`, else the folder saved with `apply-pilot home PATH` or in the panel, else `./apply-data`; `apply-pilot home` shows which |
| Secrets | `APPLY_PILOT_HOME/.env`, never `profile.json`, never the repository |
| Panel | `http://127.0.0.1:4321`, local only |

Never put the user's data inside the cloned repository. Never commit or push the data folder anywhere.

## Step 0: ask the user

Ask only what you cannot find out yourself:

1. Where should the data folder live? Suggest `~/job-search` on macOS/Linux or `%USERPROFILE%\job-search` on Windows.
2. Do they already have a tracker (Excel, CSV, Markdown, JSON, SQLite) to import? Get the path.
3. Which agent do they want to pair the panel with: Claude Code, Codex, DeepSeek or DeepSeek Harness?
4. Do they want a desktop icon?

Do not ask for passwords. Do not ask for API keys in chat: the user pastes keys into `.env` themselves (step 5).

## Windows shortcut: the MSI

If the user is on Windows and only wants to use Apply-Pilot (not develop it or scan LinkedIn), the installer is simpler than steps 1 to 3. Point them to the latest `Apply-Pilot-VERSION-x64-zh-CN.msi` or `-en-US.msi` on https://github.com/YingQiu0871/Apply-Pilot/releases and let them run it themselves, since installing software is their decision. It needs no administrator rights and includes Node.js. Then:

- The command is `%LOCALAPPDATA%\Programs\Apply-Pilot\apply-pilot.cmd`, on `PATH` for new terminals.
- The installer does not set `APPLY_PILOT_HOME`. On first launch from the Start-menu or desktop icon, the panel asks the user for a data folder: a new one (it runs the same setup as `apply-pilot init`) or an existing one. The choice is saved in `%APPDATA%\Apply-Pilot\settings.json`.
- If the user already has data, check with `apply-pilot home` which folder is active before you do anything else.

Continue at step 4 (profile). Playwright is not included, so `linkedin` and `jd --browser` need the source install.

## Step 1: check prerequisites

```bash
node --version    # must print v20 or later
npm --version
git --version
```

If Node is missing or older than 20, stop and tell the user. Installing Node changes their system: suggest https://nodejs.org (LTS), `winget install OpenJS.NodeJS.LTS` on Windows or `brew install node` on macOS, and let them run it.

## Step 2: get the code

```bash
git clone https://github.com/YingQiu0871/Apply-Pilot.git
cd Apply-Pilot
npm install
npm link
```

Do not use `npm i github:YingQiu0871/Apply-Pilot`, because recent npm versions refuse git dependencies by default.

If `npm link` fails for lack of permissions, do not use `sudo` on your own. Run the CLI as `node /path/to/Apply-Pilot/bin/apply-pilot.mjs ...` instead, and tell the user.

**Check:**

```bash
npm test                 # all tests pass
apply-pilot help         # prints the command list
```

Optional, only if the user wants LinkedIn scanning or Excel export:

```bash
npm install playwright exceljs
npx playwright install chromium
```

## Step 3: create the data folder

Set `APPLY_PILOT_HOME` for the current shell:

```bash
# macOS / Linux
export APPLY_PILOT_HOME="$HOME/job-search"
```

```powershell
# Windows PowerShell
$env:APPLY_PILOT_HOME = "$HOME\job-search"
```

Then initialise it. Use the generic template unless the user's search matches an example:

```bash
apply-pilot init                              # generic
apply-pilot init --example pharma-m2-europe   # example: pharmacy M2 internships in Europe
```

This writes `profile.json`, `data/applications.md` and a `.gitignore` (browser sessions, inbox, output, spreadsheets, `.env`).

Save the folder as the user's default so later sessions, the panel and the desktop icon all find it. This writes only the small per-user settings file:

```bash
apply-pilot home "$APPLY_PILOT_HOME"
```

An environment variable also works and takes precedence. Tell the user before changing their shell profile or `setx`. In Claude Code you can set it in the project's `CLAUDE.md` or under `env` in `.claude/settings.json`. Run `apply-pilot home` with no argument to see which folder is active and why.

**Check:** `apply-pilot doctor`. Every required line starts with `✓`. A `✗` next to `playwright` or `exceljs` only means the optional dependency is missing. `doctor` exits 0 either way, so read the output.

## Step 4: fill in the profile

Edit `APPLY_PILOT_HOME/profile.json` with the user, not for them:

- `candidate.facts`: only experience the user confirms. Do not infer or embellish. Anything they have not done goes in `writing.forbiddenClaims`.
- `scoring.dimensions` and `thresholds`: their priorities and weights.
- `filters`: companies and keywords to exclude.
- `followUp`: `afterDays`, `maxFollowUps`, optionally `skipAppliedBefore`.
- `sources.portals`, `sources.boards`, `sources.websearch`, `sources.linkedin`: what to scan.

Use `config/profile.example.json` and `examples/pharma-m2-europe/profile.json` in the repository as references.

**Check:** `apply-pilot doctor` again; the profile line and scoring dimensions show `✓`.

## Step 5: API keys (optional)

```bash
cp config/env.example "$APPLY_PILOT_HOME/.env"            # macOS / Linux
```

```powershell
Copy-Item config\env.example "$env:APPLY_PILOT_HOME\.env"   # Windows
```

Tell the user which keys unlock which source (the comments in the file have the sign-up links) and let them paste the values in. Missing keys only disable that one source. Never print `.env` contents back to the user or into logs.

## Step 6: import existing data (if any)

Always preview first, show the user the result, and write only after they agree:

```bash
apply-pilot import "PATH/TO/FILE-OR-FOLDER"           # preview
apply-pilot import "PATH/TO/FILE-OR-FOLDER" --write   # after the user agrees
```

Supported: `applications.md`, Markdown tables, `.xlsx`, CSV/TSV, JSON, SQLite `.db` (Node 22.5+). Source files are not modified. Already-tracked rows are skipped.

**Check:** `apply-pilot list` shows the imported rows.

## Step 7: panel, desktop icon, agent

```bash
apply-pilot agent claude --test   # or: codex, dsh, deepseek (put DEEPSEEK_API_KEY in .env first)
apply-pilot ui --open             # opens http://127.0.0.1:4321
apply-pilot shortcut              # optional desktop launcher
```

The launcher is `Apply-Pilot.lnk` on Windows (starts the panel without a console window), `Apply-Pilot.command` on macOS and `Apply-Pilot.desktop` on Linux.

**Check:** the panel loads and the Today page shows no setup steps. `apply-pilot agent` marks the chosen agent with `●`, and the test reports an answer. If it reports a sign-in problem, ask the user to sign in to that agent in a terminal.

If port 4321 is taken, use `apply-pilot ui --port 4322 --open`.

## Step 8: hand over

Tell the user, briefly:

- where the data folder is and that it stays private;
- how to open the panel (icon or `apply-pilot ui --open`);
- the daily loop: press "Start today's work" on the Today page (or run `apply-pilot today`), decide what comes back, apply, log;
- that nothing is ever sent or submitted without their approval.

For Claude Code, also install the skill: copy `skills/apply-pilot/` to `~/.claude/skills/apply-pilot/`. See [docs/harnesses.md](docs/harnesses.md) for Codex and DeepSeek/opencode.

## Updating

```bash
cd Apply-Pilot
git pull
npm install
npm test
```

The data folder is untouched by updates. Check [CHANGELOG.md](CHANGELOG.md) for changes to `profile.json` fields.

## Do not

- Do not send email, submit applications or message anyone during setup.
- Do not type the user's passwords or solve CAPTCHAs. The user signs in (`apply-pilot linkedin login` opens a browser for them).
- Do not work around bot protection, spoof app identities or reuse keys found in a website's front end.
- Do not copy personal data into the repository or any public place.
- Do not add yourself as author or co-author anywhere.
