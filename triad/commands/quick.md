---
description: Run one small ad-hoc task with a single coder, outside the phase plan, optionally committed and reviewed
argument-hint: "<task description> [--auto]"
---
Quick task for the Triad project: $ARGUMENTS

1. Load the tool: ToolSearch with query `select:mcp__triad__persona_brief`. Call it with the task to pick the persona; then call it with `agent` set to the chosen id to get the persona core.
2. If the task is too big for one agent (more than about 3 files of real change, or it needs design decisions you cannot make now), tell the user to plan it as a phase instead, and stop.
3. Brief one agent: triad:triad-coder (or triad:triad-helper if the persona's tier is haiku, naming its writable files). Put the persona core at the top of the brief, then the task, the files, the acceptance criteria and a verify command.
4. Check its result with the verify command and `git diff --stat`.
5. Ask the user (AskUserQuestion) whether to commit. This confirmation gate is skipped when `planning_status` (load `mcp__triad__planning_status` in a Legion project) reports confirmation gates off (control mode autonomous) or with `--auto`: then commit, unless settings.json `execution.auto_commit` is false or the control mode is read-only. If yes, commit with message `feat(<commit_prefix>): quick — <task>` (`commit_prefix` from the project root settings.json, default `triad`), and add a line under "Recent Decisions" or "Quick Tasks" in `.planning/STATE.md` if that file exists.
6. If the user asked for a review, spawn one triad:triad-coder as a read-only reviewer on the changed files (no writes; findings with severity blocker/critical/major/minor/advisory) and report what it found.
