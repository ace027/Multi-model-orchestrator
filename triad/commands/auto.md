---
description: Run the whole project hands-off: start (if needed), then plan, build and review every phase with no questions; resumes where it stopped
argument-hint: "[project goal | path to a spec] [--until N]"
---
Run the Triad project in `.planning/` end to end, without the user. Arguments: $ARGUMENTS

This run is non-interactive. Never call AskUserQuestion and never stop to ask in plain text. Wherever a command you run says to ask the user, take the recommended option or the default it names, and say in one line which you took. Permissions are not loosened: a tool the session may not use still needs the user.

1. Load the tools: ToolSearch with query `select:mcp__triad__planning_status`. Call `planning_status`. Its Budget line (when the option `maxSpend` is set) and its Process line (light or full per phase) apply to the whole run.
2. No project yet:
   - With no goal in the arguments, tell the user `/triad:auto` needs a goal or a spec path the first time, and stop.
   - Otherwise run the Skill tool with skill `triad:start` and, as its arguments, the goal followed by: "Autonomous run: take every answer from this goal and the files it names; ask nothing. Where they leave a choice open, pick the simplest option that meets the goal and record it under Key Decisions as assumed. Skip the phase review with the user." Read a spec path the goal names before drafting phases.
   A project already exists: ignore the goal (say so if one was given) and resume.
3. Loop, one step at a time. Before each step call `planning_status` again and act on the phase it names:
   - not planned: Skill `triad:plan` with `N --auto`;
   - planned, not built (or a build stopped part way): Skill `triad:build` with `N --auto`;
   - built, review pending: Skill `triad:review` with `N --auto`;
   - review passed: go on to the next phase; after the last phase (or phase N of `--until N`), go to step 5.
   Keep each step's report to a few lines; the files in `.planning/` hold the detail.
4. Stop early, and go to step 5, when:
   - a result says the spending budget is reached (`triad: the spending budget is reached`), or `planning_status`'s Budget line says reached;
   - planning halts on a BLOCKER (a critical security finding, a Blocking spec question, REWORK after the refine cap);
   - a build fails twice: run `triad:build` with `N --auto` once more after the first failure (it resumes from the failed plan), and stop if it fails again;
   - a review ends ESCALATED or STALE LOOP ABORTED;
   - the same step returns the same position twice in a row (no progress).
   Never fix code yourself between steps, override a review result, or skip a failing check.
5. Report: each phase with its result (planned, built, review passed, or where it stopped and why), the decisions taken as defaults, what is left with the exact command to continue (`/triad:auto` again resumes), and the spend (`/triad` shows it). When every phase passed, suggest `/triad:ship`; do not run it.
