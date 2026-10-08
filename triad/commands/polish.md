---
description: Behavior-preserving code polish: comments, simplification, readability, consistency, with a test and type-check safety net
argument-hint: "[path | glob | --phase N] [--scope=changed|dependents|directory] [--dry-run] [--preview] [--save] [--auto]"
---
Polish code without changing behavior. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__polish,mcp__triad__github,mcp__triad__dry_run,mcp__triad__planning_status`.
Gates: every "ask the user" below is a confirmation gate, asked with AskUserQuestion. It is skipped, taking the default it names, when `planning_status` reports confirmation gates off (control mode autonomous) or with `--auto`.

0. `--dry-run`: call `dry_run` with command `polish`, the `target` (a path from the arguments) and the phase from `--phase`; show the prerequisite report and stop: no files, agents or git changes.

1. Call polish action `scope` with `target` (a path or glob from the arguments), `phase` (from `--phase`; with neither, the current phase) and `scope` (from `--scope`). Show the file count and the first files.
   - No files: say so and stop.
   - More than 20 files: ask the user with AskUserQuestion: "Polish all N files", "Only changed files (no importers)" (call `scope` again with `scope: changed`), or "Cancel" (gates off: only changed files).
2. Call polish action `run` with the resolved `files`, the `target` label, `dry_run` (true with `--preview`) and `save` from the flags. It takes the test and type-check baseline, runs one testing-code-polisher on the four passes, reverts the culprit file on a regression (all of the polish if it cannot isolate one), and commits.
3. Report: files changed, files reverted and why, the safety table, and (with `--save`) where POLISH.md was written. With `--preview`, report what would change; nothing was written.
4. Flagged items are changes the polisher judged too large to make safely (extract function, rename across files, dead code). If there are any, list them and ask the user with AskUserQuestion: "Apply them one by one", "Open them as GitHub issues" (only when github action `mode` is `enabled`; then create each with `gh issue create --label triad`), or "Skip" (gates off: Skip, listing them in the report). To apply one, give a coder the single item with its exact file and lines, run the tests after it, and stop at the first regression.
