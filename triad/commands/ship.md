---
description: Ship a reviewed phase: 6 pre-ship gates in code, ship report, PR or push, post-ship verification, optional canary
argument-hint: "[--phase N] [--dry-run] [--preview] [--canary] [--auto]"
---
Ship a reviewed phase of the Triad project. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__ship,mcp__triad__github,mcp__triad__dry_run`.

0. `--dry-run`: call `dry_run` with command `ship` (and the phase from `--phase`), show the prerequisite report and stop: no gates run, no files, agents or git changes.
1. Call ship action `check` with `phase` (from `--phase`) and `dry_run` (true with `--preview`). It resolves the phase, runs all six gates (build complete, review passed including unresolved CRITICAL/HIGH security findings, no open blocker escalations, verification commands, tests, clean tree) and writes `SHIP-REPORT.md`. If it returns an error (no project, phase not reviewed), show it and stop.
   - The verification commands and the test suite never run inside the tool call. When the result says `GATE RUN NEEDED`, run the script it names with the Bash tool and `run_in_background: true` (start any service the tests need first, as you would for a test run), wait for the background task to finish, then call `check` again with the same arguments. Do not run the commands another way or judge the results yourself: `check` reads them. The results hold for the commit they ran on, so `publish` and a second `check` reuse them.
   - After a session restart, call `check` again: a run that was cut short is asked for again from the start.
2. Show the gate table. If any gate failed, show the failures with their fix hints and stop: the verdict is final, do not offer to override it. With `--preview`, show the gate results and the PR preview and stop: nothing was written.
3. Ask the user how to publish with AskUserQuestion. The check result says whether `gh` is ready for this repo:
   - gh ready: "Create PR (Recommended)" (method `pr`), "Push to current branch" (`push`), "Mark shipped only" (`mark`).
   - gh not ready: "Push to current branch", "Mark shipped only", and say why a PR is not offered (the reason the check gave).
   Stop if the user cancels. This confirmation gate is skipped when `planning_status` (load `mcp__triad__planning_status`) reports confirmation gates off (control mode autonomous) or with `--auto`: then take the recommended option (Create PR when gh is ready, else Push to current branch).
4. Call ship action `publish` with the phase and the chosen `method`. It never force-pushes. If the npm audit gate blocks the PR, show the critical advisories and stop. Show the PR URL (or the pushed branch), the post-ship verification result and the commit.
5. Canary, if `--canary` was given or the user asks for it now: only when settings.json has `adapter.deploy_command` (otherwise say so and skip). Call ship action `canary` with the phase (and any extra health-check commands the user names). It deploys and schedules checks at 1, 5 and 15 minutes; the results come back here as messages. When a check reports unhealthy, show it and ask the user whether to roll back; never roll back automatically (gates off: report it and do not roll back).
6. Next: `/triad:plan N+1`, or `/triad:milestone` when this was the milestone's last phase.
