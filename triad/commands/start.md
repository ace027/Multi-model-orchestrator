---
description: Start a Legion-format project: questioning flow, then PROJECT.md, ROADMAP.md and STATE.md in .planning/
argument-hint: "[one-line project idea]"
---
Start a new Triad project (Legion `.planning/` format). Idea from the user: $ARGUMENTS

1. Load the tools: ToolSearch with query `select:mcp__triad__planning_status,mcp__triad__project_init,mcp__triad__persona_brief`.
2. Call `planning_status`. If a project already exists, show the user its position and ask whether to overwrite it or stop. Stop unless they choose overwrite.
3. Run the questioning flow yourself, a few questions at a time (use AskUserQuestion where the answers are choices):
   - Vision: what it is, who it is for, the core value, what "done" looks like.
   - Requirements: the must-haves (number them REQ-01, REQ-02, ...), and what is out of scope.
   - Constraints: stack, platform, hosting, deadlines, anything fixed.
   - Existing code: if the repository already has code, have a triad:triad-helper map it (stack, layout, test command) instead of reading it yourself.
   - Key decisions already made, with the reason for each.
   Stop asking once you can write a decision-complete roadmap. Do not invent requirements the user did not give.
4. Draft the phases: each a coherent, shippable slice with a goal, the requirements it covers, success criteria and an estimated plan count (2-4 plans of at most 3 tasks). For each phase call `persona_brief` with the phase goal and pick 1-3 recommended persona ids from the result.
5. Show the user the phase list in a short table and ask for changes. Apply them.
6. Call `project_init` with the result (set `overwrite: true` only if the user chose it in step 2).
7. Register the project in the cross-project portfolio: load `mcp__triad__portfolio` and call it with action `register` (if the registry cannot be written, say so and continue).
8. Tell the user what was written and the next command, `/triad:plan 1`. If the repository has code, suggest `/triad:map` first. Do not commit; the user decides when.
