---
description: Run the whole project hands-off: start (if needed), then plan, build and review every phase with no questions; resumes where it stopped
argument-hint: "[project goal | path to a spec] [--until N] [--estimate]"
---
Run the Triad project in `.planning/` end to end, without the user. Arguments: $ARGUMENTS

This run is non-interactive. Never call AskUserQuestion and never stop to ask in plain text. Wherever a command you run says to ask the user, take the recommended option or the default it names, and say in one line which you took. Permissions are not loosened: a tool the session may not use still needs the user.

Keep the run lean; every turn of yours re-reads the whole conversation. Load tools once, call the workflow tools directly where this says so, decide the next step from the result in hand, and keep the text between steps to a line or two. The files in `.planning/` hold the detail.

1. Load every tool the run needs in one call: ToolSearch with query `select:mcp__triad__planning_status,mcp__triad__project_init,mcp__triad__persona_brief,mcp__triad__portfolio,mcp__triad__plan_write,mcp__triad__plan_check,mcp__triad__intent,mcp__triad__github,mcp__triad__build_phase,mcp__triad__review_phase,mcp__triad__polish,mcp__triad__estimate` and max_results 12. The commands below each start by loading their tools: those are loaded already, so skip that step. Call `planning_status` once. Its Budget line (options `maxSpend` and `maxProjectSpend`) and its Process line (light or full per phase) apply to the whole run.
2. No project yet:
   - With no goal in the arguments, tell the user `/triad:auto` needs a goal or a spec path the first time, and stop.
   - Otherwise run the Skill tool with skill `triad:start` and, as its arguments, the goal followed by: "Autonomous run: take every answer from this goal and the files it names; ask nothing. Where they leave a choice open, pick the simplest option that meets the goal and record it under Key Decisions as assumed. Skip the phase review with the user." Read a spec path the goal names before drafting phases.
   A project already exists: ignore the goal (say so if one was given) and resume from the phase `planning_status` names.
3. `--estimate`: plan every phase that is not planned yet (step 4's plan step, nothing else), then call `estimate` and show its table, and stop. Nothing is built.
4. Loop over the phases, one step at a time, taking the next step from the result you just got:
   - not planned: Skill `triad:plan` with `N --auto`. Then build.
   - planned, not built (or a build stopped part way): call `build_phase` with the phase directly (no Skill). "Two-wave mode" with a Wave A report: call `build_phase` with `stage: "B"` unless the report has a blocker escalation or a CRITICAL finding (then stop). All plans succeeded: review.
   - built: call `review_phase` with the phase directly (no `mode`). If `.planning/designs/` or `.planning/campaigns/` exists, run Skill `triad:review` with `N --auto` instead, for the domain review. PASSED on a full-process phase: run Skill `triad:polish` with `--phase N --auto`. A light-process phase skips polish (the review fixed its minor findings).
   - review passed: the next phase; after the last phase (or phase N of `--until N`), go to step 6.
   Call `planning_status` again only when a result leaves the position unclear.
5. Stop early, and go to step 6, when:
   - a result says a spending budget is reached (`spending budget is reached`), or `planning_status`'s Budget line says reached;
   - planning halts on a BLOCKER (a critical security finding, a Blocking spec question, REWORK after the refine cap);
   - a build fails twice: call `build_phase` once more after the first failure (it resumes from the failed plan), and stop if it fails again;
   - a review ends ESCALATED or STALE LOOP ABORTED;
   - the same step returns the same position twice in a row (no progress).
   Never fix code yourself between steps, override a review result, or skip a failing check.
6. Report: each phase with its result (planned, built, review passed, or where it stopped and why), the decisions taken as defaults, what is left with the exact command to continue (`/triad:auto` again resumes), and the spend (`/triad` shows it). When every phase passed, suggest `/triad:ship`; do not run it.
