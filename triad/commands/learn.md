---
description: Record, recall, list or prune project learnings (.planning/memory/)
argument-hint: "<lesson> | --recall <topic> | --list | --prune"
---
Project memory for the Triad project. Arguments: $ARGUMENTS

Load the tool first: ToolSearch with query `select:mcp__triad__memory`.

Pick the mode from the arguments (first match wins):
- `--recall <topic>`: call memory with action `recall` and the topic; show the result as is.
- `--list`: action `list`; show the result.
- `--prune`: action `outcomes` with limit 1 to see the record count. If the count is at or under the prune threshold (settings.json `memory.prune_threshold`, default 200), ask the user (AskUserQuestion) "OUTCOMES.md has N records (threshold: T). Prune anyway?" with options Yes (prune records older than `memory.prune_age_days` days with importance <= 3) / No. On yes (or over the threshold), call action `prune` and show the report.
- Any other text is a lesson to record:
  1. Classify it: pattern (positive: always, use, prefer, works well), pitfall (negative: don't, never, avoid, breaks) or preference (we use, prefer X over Y, convention).
  2. Ask the user (AskUserQuestion): "I classified this as a **{type}**. Correct?" Options: Correct / It's a pattern / It's a pitfall / It's a preference.
  3. Call memory with action `record`, the type, a summary of at most 80 characters, 2-5 lowercase tags taken from the lesson's own words (never invented), and the full lesson as `text`.
  4. Show the result, then ask "Record another learning?" (Yes / Done). On Yes, ask for the text and repeat; on Done, mention `/triad:learn --recall <topic>`.
- No arguments: print the four usages with examples (`/triad:learn Always run migrations in a transaction`, `/triad:learn --recall migrations`, `/triad:learn --list`, `/triad:learn --prune`).

Never edit phase files, STATE.md or ROADMAP.md from this command.
