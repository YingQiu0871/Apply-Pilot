# Agent guide for apply-pilot

Read this before you act on someone's job search with this package. It applies to every harness: Codex, Claude Code, opencode, DeepSeek or any other model driving the CLI.

## Ground rules (not optional)

1. **Never submit or send on your own.** No email send, no "submit application" click, no LinkedIn message and no form submission without the user's explicit approval for that specific item. Show the recipient, subject, body and attachments first. Scheduling a send counts as sending.
2. **Never invent experience.** Strengths come only from `profile.candidate.facts`. Anything in `profile.writing.forbiddenClaims` may appear only as an honest gap ("I have not used X yet").
3. **Log every action at once.** After each submit, send, follow-up, reply or rejection, run `apply-pilot status NUM STATUS --note "YYYY-MM-DD: what happened"` or `apply-pilot note NUM "..."`. The dashboard reads the tracker, so an action that isn't logged is invisible.
4. **The user is the author.** Do not add yourself as author or co-author in commits, trailers, package metadata or documents.
5. **Credentials stay with the user.** The user logs in to job sites and LinkedIn and creates accounts. You do not type passwords and you do not solve CAPTCHAs.
6. **Personal data stays in `APPLY_PILOT_HOME`.** Never copy CVs, trackers, emails or browser profiles into this package or any public repository.

## Daily loop

```text
scan ──► triage ──► evaluate ──► (user decides) ──► tailor + lint ──► (user approves) ──► submit ──► log
                                                                                                    │
                                     dashboard ◄── tracker (data/applications.md) ◄── followups ◄──┘
```

| Step | Command | Notes |
|---|---|---|
| Scan LinkedIn | `apply-pilot linkedin scan` | needs `playwright` and a session from `apply-pilot linkedin login` |
| Other boards | your harness's browser or web search | add rows with `apply-pilot add` |
| Triage | `apply-pilot triage inbox/linkedin-*.json` | drops tracked, filtered and job-seeker posts |
| Evaluate (agent) | `apply-pilot eval prompt jd.txt`, then answer with JSON, then `apply-pilot eval score answer.json --jd jd.txt` | no API key needed |
| Evaluate (API) | `apply-pilot eval run jd.txt --provider deepseek --add` | `DEEPSEEK_API_KEY` |
| Letters | `apply-pilot docx build ...`, then `apply-pilot lint letter.txt` | fix every lint issue or explain it |
| Track | `apply-pilot add`, `status`, `note` | statuses: Evaluated, SKIP, Discarded, Applied, Responded, Interview, Offer, Rejected |
| Follow up | `apply-pilot followups` | rules in `profile.followUp`, so drafts only, sending needs approval |
| Review | `apply-pilot ui` | http://localhost:4321 |

## Writing letters and emails

- Open with the team's problem or project, not with yourself.
- Use plain sentences. Each claim gets one concrete fact from the profile.
- Skip "this experience taught me…" morals and invented insights.
- Split long method lists.
- Say what is new to the candidate honestly and briefly.
- Run `apply-pilot lint` before showing a draft.

## Notes format

Start each note with a date (`2026-10-29: ...`). Use the words *submitted*, *follow-up*, *replied*, *interview* or *rejected*, so the dashboard timeline classifies the event. Write facts, not plans. "Follow up if no reply by 10/12" is a plan and belongs in your own reminders, not in the notes.
