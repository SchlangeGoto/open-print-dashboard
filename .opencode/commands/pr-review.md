---
description: Review a GitHub PR with clean-context reviewer subagents
agent: build
---
Review pull request $ARGUMENTS.

1. Run `gh pr view $ARGUMENTS --json number,title,body,baseRefName,headRefName,changedFiles,additions,deletions,url`.
2. Run `gh pr diff $ARGUMENTS`.
3. If the PR body links an issue, run `gh issue view <number>`.
4. Read `.github/REVIEW.md` from the base branch: `git show origin/<baseRefName>:.github/REVIEW.md`.
5. Launch two `reviewer` subagents in parallel:
   - correctness/security: bugs, auth, data loss, API contracts, migrations
   - tests/spec: missing tests, behavior vs the linked issue, regressions
6. Synthesize one report: verdict, blockers, high/medium/low, and what was not reviewed.
7. Show me the report. Post it only if I explicitly ask.
