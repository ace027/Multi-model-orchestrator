---
description: Map the codebase into .planning/CODEBASE.md and a retrieval index, or search an existing map
argument-hint: "[--check] [--refresh] [--scope <dir>] [--query <terms>]"
---
Codebase map for the Triad project. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__map`.

1. `--query <terms>`: call map with action `query` and show the result as is. Stop. Do not regenerate anything.
2. `--check`: call map with action `check` and show the freshness report. Stop.
3. Without `--refresh`, call map action `check` first. If the status is `fresh`, tell the user the map is current (with its age) and ask (AskUserQuestion) "The codebase map is fresh. Regenerate anyway?" Options: Keep the current map / Regenerate. On keep, stop.
4. Call map with action `build` (pass `scope` when `--scope` is given). All the data sections, the index, symbols and directory mappings are computed in code. If it reports no source code or a bad scope, show that and stop.
5. If the build lists narrative sections to write, write them from the facts it returned plus targeted reads of the entry points and the highest fan-in files (read no more than 15 files). This is summarizing work: give a triad:triad-helper (Haiku) a read-only brief with the facts and the section list below, and have it return the sections; do not read the codebase at length yourself. Sections, each short and specific to this codebase, citing paths:
   - `Architecture Overview`: layers, request/data flow, 5-10 lines.
   - `Functionality Inventory`: table `| Feature | Entry | Key files |`.
   - `Module Ownership`: table `| Module | Responsibility | Suggested agent |` (Triad persona ids).
   - `Risk Areas`: the untested, high fan-in, hotspot and debt items worth caution.
   - `Agent Guidance`: rules for agents editing this codebase (conventions, where tests go, what not to touch).
   - `Setup / Runbook`: install, run, test commands from the manifests.
   - `Pattern Library`: 3-6 recurring code patterns with one example path each.
   - `Confidence`: HIGH, MEDIUM or LOW with one line of reason.
   Never include secret values. Call map action `narrate` with the sections.
6. Report: files mapped, languages and stack, artifacts written, top risks, and that `/triad:plan` and `/triad:quick` read the map. With `--scope`, say the map is scoped and not full-project.
