---
description: Review a built phase: reviewer panel or classic, findings triaged in code, fixes routed to agents, up to 3 cycles
argument-hint: "[phase number] [--panel | --classic]"
---
Review a built phase of the Triad project in `.planning/`. Arguments: $ARGUMENTS

1. Load the tool: ToolSearch with query `select:mcp__triad__review_phase,mcp__triad__planning_status`.
2. If no phase number was given, call `planning_status` and use the phase it names. If the phase has not been built, tell the user to run `/triad:build` and stop.
3. Call `review_phase` with the phase and `mode` (`panel` unless the user asked for `--classic` or settings.json says otherwise). It runs the whole loop: reviewers, triage, fix agents, re-review, NN-REVIEW.md, STATE/ROADMAP and commits. It blocks until done; progress is in `.triad/legion.log`.
4. Report to the user: the result (PASSED, ESCALATED or STALE LOOP ABORTED), cycles, findings fixed, findings still open with their severity, and deferred suggestions.
   - PASSED: next is `/triad:plan N+1` (or the milestone is done if it was the last phase).
   - Otherwise: list the open blocker/critical/major findings and ask the user how to proceed (fix them, accept them, or re-plan). Do not override the result.
