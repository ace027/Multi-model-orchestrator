---
description: Execute a planned phase with the wave executor (one agent per plan, verification in code, a commit per plan)
argument-hint: "[phase number] [--wave N] [--rerun]"
---
Execute a planned phase of the Triad project in `.planning/`. Arguments: $ARGUMENTS

1. Load the tool: ToolSearch with query `select:mcp__triad__build_phase,mcp__triad__planning_status`.
2. If no phase number was given, call `planning_status` and use the phase it names. If the phase has no plans, tell the user to run `/triad:plan N` and stop.
3. Call `build_phase` with the phase (and `wave` / `rerun` if given). It runs every wave itself: agents, verification commands, SUMMARY.md files, STATE/ROADMAP updates and commits. It blocks until done; progress is in `.triad/legion.log`. Do not start agents or edit files yourself while it runs.
4. Report its result to the user: each plan's outcome, failed checks, escalations, and the next command.
   - All plans succeeded: next is `/triad:review`.
   - A plan failed or is blocked: show its SUMMARY.md issues. Offer to re-plan it (`/triad:plan N`) or fix it and run `/triad:build` again, which resumes from the failed plan. Do not fix it yourself unasked.
