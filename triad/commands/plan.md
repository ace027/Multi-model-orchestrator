---
description: Plan a phase of a Legion-format project: decompose into wave-ordered plans, write them, critique and auto-refine
argument-hint: "[phase number]"
---
Plan a phase of the Triad project in `.planning/`. Phase: $ARGUMENTS (default: the phase STATE.md points to).

1. Load the tools: ToolSearch with query `select:mcp__triad__planning_status,mcp__triad__plan_write,mcp__triad__plan_check,mcp__triad__persona_brief`.
2. Call `planning_status` for the position. Read the phase's block in `.planning/ROADMAP.md` (goal, requirements, success criteria, recommended agents), `.planning/PROJECT.md`, and the SUMMARY.md handoffs of the previous phase. If the phase already has plan files, ask the user: re-plan from scratch, or keep them and stop.
3. Ground the plan in the code: give a triad:triad-helper a narrow read-only brief to report the files, interfaces and test commands the phase touches. Do not read the codebase at length yourself.
4. Decompose the phase into plans. Each plan:
   - has at most 3 tasks (`planning.max_tasks_per_plan` in settings.json), each with exact files, decision-complete actions, `verification` shell commands that exit 0 when it is done, and a done sentence;
   - lists every file it may change in `files_modified` and what it must not touch in `files_forbidden`;
   - has plan-level `verification_commands` that prove the plan as a whole;
   - names its persona in `agents` (first one runs it; call `persona_brief` with the plan's task to choose);
   - sits in a wave: plans in the same wave run in parallel and must not share files; a plan depends only on earlier waves (`depends_on`: "NN-PP").
   Make the decisions here. Nothing may say "decide later", "TBD" or "as needed".
5. Call `plan_write` with the phase, the context (goal, requirements, what earlier phases built, key decisions) and the plans (`replace: true` if the user chose to re-plan).
6. Critique. The tool returns a mechanical verdict. Also judge, yourself, what code cannot: are requirements covered, are the tasks decision-complete, will the verification commands actually prove the success criteria, is the wave order right?
7. Auto-refine: if the verdict is REWORK, or your judgment finds a real gap, fix the affected plans and call `plan_write` again with `only` set to their plan numbers. At most 2 refine rounds. Then call `plan_check` once more.
8. Report to the user: the plans by wave (one line each), the final verdict, any remaining CAUTION items, and the next command `/triad:build`.
