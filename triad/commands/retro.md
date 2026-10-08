---
description: Structured retrospective on a completed phase or milestone, saved to project memory
argument-hint: "[--phase N] [--milestone M] [--dry-run] [--portfolio]"
---
Retrospective for the Triad project. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__retro,mcp__triad__persona_run`.

1. `--portfolio`: cross-project mode. Read `~/.claude/legion/portfolio.md` for the registered projects, read each project's `.planning/memory/RETRO.md`, and summarize common patterns, shared action items and cross-project agent trends. Offer to save the summary to this directory's `.planning/memory/RETRO.md` (retro action `save`). Cross-project findings never feed agent scores. Stop there.
2. Otherwise call retro with action `gather` (pass `phase` or `milestone` when given). If it reports no project or an incomplete phase, show that and stop.
3. Write the report from the gathered evidence only; this is judgment work for a Sonnet agent. Call persona_run (read_only) with agent `project-management-studio-operations`, labelled `retro`, and a brief that contains the whole gather output and asks for the report in exactly this shape: `# Retrospective: {scope}`, `**Project**`, `**Scope**`, `**Date**`, `## What Went Well`, `## What Didn't Work`, `## Patterns to Keep`, `## Patterns to Drop`, `## Action Items` (table `| # | Action | Priority | Evidence |`, priority High/Medium/Low, including agent adjustments such as "prefer {agent} for {task_type}"), `## Metrics` (the computed lines, copied as is). Every finding must cite a phase, plan or file; patterns must recur across plans or phases; no unsupported claims.
4. Show the report. With `--dry-run`, say "DRY RUN — retrospective will be displayed but not saved" and stop.
5. Ask the user (AskUserQuestion) "Save retrospective findings to memory?" Options: Save to memory / View only (don't save) / Edit before saving. For edit, ask which sections need changes (What Went Well / What Didn't Work / Patterns / Action Items / Looks good — save as-is), apply the corrections, then save.
6. Save with retro action `save`: the scope line, condensed key findings (went well and didn't work), the action items table and the metrics lines. Tell the user the action items will appear as constraints in future `/triad:plan` runs. On view only: "Retrospective not saved. Run `/triad:retro` again to revisit."
