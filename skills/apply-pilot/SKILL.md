---
name: apply-pilot
description: Run a job or internship search with the apply-pilot CLI. Covers scanning postings, deduplicating and scoring them against the user's rubric, tracking applications, finding follow-ups that are due, linting letters, and showing the live dashboard. Use whenever the user mentions applications, internships, job postings, follow-ups, or the application tracker.
---

# Apply-Pilot

1. Read `AGENTS.md` in the Apply-Pilot package (`npm root -g`/apply-pilot or the repo clone). Its ground rules are mandatory:
   - never send or submit without explicit approval;
   - never invent experience;
   - log every action at once;
   - the user is the sole author;
   - the user handles logins;
   - personal data stays out of the package.
2. Check the setup with `apply-pilot doctor`. If the data directory is missing, run `apply-pilot init` and ask the user to fill in `profile.json` (facts, rubric, filters).
3. Start the dashboard if it isn't running: `apply-pilot ui` (http://localhost:4321).
4. For a posting:
   - save the JD text;
   - run `apply-pilot eval prompt jd.txt`;
   - answer the prompt yourself as strict JSON;
   - run `apply-pilot eval score answer.json --jd jd.txt`;
   - give the user the score, the gaps and a recommendation;
   - `apply-pilot add ...` once the user decides.
5. For letters: build them from the user's template (`apply-pilot docx list` / `docx build`). Run `apply-pilot lint` and fix what it flags. Show the final text and attachments, then wait for approval.
6. After anything happens, record it: `apply-pilot status NUM STATUS --note "YYYY-MM-DD: ..."`.
7. For follow-ups: `apply-pilot followups` lists what is due. Draft short, plain follow-ups in the original thread and send only what the user approves.
