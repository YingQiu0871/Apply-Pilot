# Claude Code notes for apply-pilot

Follow [AGENTS.md](AGENTS.md); its ground rules apply to you in full.

Claude Code specifics:

- Install the skill so it loads whenever the user talks about applications: copy `skills/apply-pilot/` to `~/.claude/skills/apply-pilot/` (or to `.claude/skills/` in the user's data repo).
- Set `APPLY_PILOT_HOME` in the user's project `CLAUDE.md` or settings `env`, so every command hits the same data directory.
- Use the browser tools (Claude in Chrome or the built-in browser) for job sites and mail. Let the user sign in, and re-find element refs before every click that sends or submits.
- After each action, update the tracker in the same turn (rule 3) and keep `apply-pilot ui` running for the user.
- Commit messages carry no Claude attribution or co-author trailers (rule 4).
