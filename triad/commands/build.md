---
description: Execute a planned phase with the wave executor (one agent per plan, verification in code, a commit per plan); intent flags, two-wave mode and dry runs
argument-hint: "[phase number] [--wave N] [--rerun] [--dry-run] [--just-harden | --just-document | --skip-frontend | --skip-backend] [--two-wave | --single-wave] [--skip-gates]"
---
Execute a planned phase of the Triad project in `.planning/`. Arguments: $ARGUMENTS

1. Load the tools: ToolSearch with query `select:mcp__triad__build_phase,mcp__triad__planning_status,mcp__triad__intent`.
2. If the arguments are plain words rather than a phase number and flags (for example "harden the auth code"), call intent action `route` with the text. HIGH confidence: say which command and flags it maps to and continue with them (if it is not a build, tell the user to run that command instead and stop). MEDIUM: ask the user to confirm the suggestion. LOW or NONE: show its suggestions and stop.
3. If no phase number was given, call `planning_status` and use the phase it names. If the phase has no plans, tell the user to run `/triad:plan N` and stop.
4. Call `build_phase` with the phase, `flags` set to the remaining flag text exactly as given (and `wave` / `rerun` if given). The tool validates the flags (an invalid combination returns "❌ Intent Validation Failed": show it and stop), applies intent filters, picks single- or two-wave mode, and runs every wave itself: agents, verification commands, SUMMARY.md files, STATE/ROADMAP updates and commits. It blocks until done; progress is in `.triad/legion.log`. Do not start agents or edit files yourself while it runs.
   - `--dry-run`: it returns the prerequisite report, the execution mode and the filter preview, with no writes. Show it and stop.
   - `--just-harden`: it returns the harden team and the files instead of running plans. Follow its instructions with persona_run (load `mcp__triad__persona_run`), then run the project tests and report findings and changes.
5. Two-wave gates (the result says "Two-wave mode"):
   - Architecture gate (after Wave A): show the Wave A report and ask the user (AskUserQuestion) Proceed to Wave B / Revise Wave A / Abort the phase. Proceed: call `build_phase` with the phase and `stage: "B"`. Revise: ask what to change, re-plan the affected plans with `/triad:plan N` or let the user edit, then call `build_phase` with `stage: "A"` and `rerun: true`. Abort: stop; the manifests stay for a later run.
   - Production gate (after Wave B): PASS goes on to step 6. NEEDS_WORK: ask the user to fix and re-run Wave B (`stage: "B"`) or accept the risks and continue to review. FAIL: show the failing plans; the phase stays open until Wave B passes.
6. Report the result to the user: each plan's outcome, skipped plans from an intent filter, failed checks, escalations, and the next command.
   - All plans succeeded: next is `/triad:review`.
   - A plan failed or is blocked: show its SUMMARY.md issues. Offer to re-plan it (`/triad:plan N`) or fix it and run `/triad:build` again, which resumes from the failed plan. Do not fix it yourself unasked.
