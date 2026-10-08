---
description: Run one small ad-hoc task with a single coder, outside the phase plan, optionally committed and reviewed
argument-hint: "[--fix] <task description | #issue> [--auto]"
---
Quick task for the Triad project: $ARGUMENTS

0. Fix mode: if the arguments start with `--fix`, strip it and follow steps 1-4, then the fix-mode steps 7-9 below instead of 5-6. A `#N` in the task is an issue number: keep it for the PR; if the task is only `#N`, run `gh issue view N --json title,body` and use the title as the task and the body as context (if `gh` fails, ask the user for the task).

1. Load the tool: ToolSearch with query `select:mcp__triad__persona_brief`. Call it with the task to pick the persona; then call it with `agent` set to the chosen id to get the persona core.
2. If the task is too big for one agent (more than about 3 files of real change, or it needs design decisions you cannot make now), tell the user to plan it as a phase instead, and stop.
3. Brief one agent: triad:triad-coder (or triad:triad-helper if the persona's tier is haiku, naming its writable files). Put the persona core at the top of the brief, then the task, the files, the acceptance criteria and a verify command.
4. Check its result with the verify command and `git diff --stat`.
5. Ask the user (AskUserQuestion) whether to commit. This confirmation gate is skipped when `planning_status` (load `mcp__triad__planning_status` in a Legion project) reports confirmation gates off (control mode autonomous) or with `--auto`: then commit, unless settings.json `execution.auto_commit` is false or the control mode is read-only. If yes, commit with message `feat(<commit_prefix>): quick — <task>` (`commit_prefix` from the project root settings.json, default `triad`), and add a line under "Recent Decisions" or "Quick Tasks" in `.planning/STATE.md` if that file exists.
6. If the user asked for a review, spawn one triad:triad-coder as a read-only reviewer on the changed files (no writes; findings with severity blocker/critical/major/minor/advisory) and report what it found.

Fix mode (`--fix`) only. Quick fixes never change STATE.md or ROADMAP.md.

7. Commit, without asking (the review and the PR need it): `fix(<commit_prefix>): <task>`. No changes: say so and stop.
8. Inline review, one reviewer and one cycle: load `mcp__triad__persona_run` and call it read_only with agent `testing-qa-verification-specialist` (or `engineering-senior-developer` for a non-test fix), label `quick-fix-review`, and a brief: `# Quick Fix Review`, the task, the fixing agent, the output of `git diff HEAD~1`, and the instructions: a quick fix, not a feature; correctness, obvious regressions and missing error handling only, no style nits or refactors; findings as a table `| File | Lines | Severity | Finding |` with severity blocker/concern/nit; `**Verdict**: PASS` or `FAIL` with the blocking issues.
   - PASS: go to step 9.
   - FAIL: show the findings and ask the user (AskUserQuestion): "Fix and retry" (brief the step 3 agent again with the findings, commit, review once more; a second FAIL comes back to this question without the retry option), "Proceed anyway" (the PR body carries the findings) or "Abort" (say "Fix committed locally. Run `/triad:quick --fix` again after manual changes." and stop).
9. Pull request: run `gh auth status`; if `gh` is not ready, say "GitHub CLI not available. Changes committed locally at <hash>." and stop. On main or master, create the branch `fix/<slug>` (or `fix/<issue>-<slug>` with an issue; lowercase, hyphens, at most 50 characters) with `git checkout -b`. Push with `git push -u origin <branch>` (never force). Create the PR with `gh pr create --title "fix: <summary, at most 70 characters>" --body <body>`: `## Quick Fix` (task, agent, review verdict), `## Changes` (what changed and why), `## Review Findings` (the table, or "Clean review, no issues found"), and `Fixes #N` with an issue. Show the PR URL, the branch, the verdict and the linked issue.
