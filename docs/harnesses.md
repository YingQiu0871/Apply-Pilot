# Using Apply-Pilot from different agent harnesses

Apply-Pilot is a plain Node CLI with a JSON-in/JSON-out evaluation step, so any agent that can run shell commands can drive it. The rules in [AGENTS.md](../AGENTS.md) apply to all of them.

## Claude Code

```bash
git clone https://github.com/YingQiu0871/Apply-Pilot.git && cd Apply-Pilot && npm install && npm link
cp -r skills/apply-pilot ~/.claude/skills/
```

In the project where your data lives, add to `CLAUDE.md`:

```markdown
APPLY_PILOT_HOME is ./apply-data. Use the apply-pilot skill for anything about applications.
```

Claude evaluates postings itself (`eval prompt` → JSON → `eval score`), so no API key is needed.

## Codex CLI

Codex reads `AGENTS.md` from the working directory. Copy or link the package's `AGENTS.md` into your data project, or reference it from your own `AGENTS.md`. For unattended runs, use the non-interactive mode:

```bash
codex exec "Run apply-pilot followups and draft follow-ups for the due rows into output/followups.md. Do not send anything."
```

## DeepSeek (and other OpenAI-compatible models)

Direct API, no agent needed:

```bash
export DEEPSEEK_API_KEY=sk-...
apply-pilot eval run jd.txt --provider deepseek            # deepseek-chat
apply-pilot eval run jd.txt --provider deepseek --model deepseek-reasoner --add
```

Other providers work the same way:
- `--provider openai`, `openrouter` and `anthropic` read `OPENAI_API_KEY`, `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY`.
- `--provider ollama` needs no key.
- `--base-url` points the call at any OpenAI-compatible endpoint.

As an agent backend (opencode or similar with a DeepSeek model), give it `AGENTS.md` as its instructions file. It then uses the CLI exactly like Claude Code or Codex.

## career-ops (optional)

[career-ops](https://github.com/career-ops-hq/career-ops) uses the same `data/applications.md` table. Point both tools at one directory:

```bash
export APPLY_PILOT_HOME=~/job-search
export CAREER_OPS_HOME=~/src/career-ops
apply-pilot careerops tracker sync      # runs career-ops' tracker.mjs with CAREER_OPS_DATA=$APPLY_PILOT_HOME
```
