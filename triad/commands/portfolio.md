---
description: Cross-project portfolio dashboard, dependencies, agent allocation and Studio Producer analysis
argument-hint: "[register | unregister [name]]"
---
Portfolio across Triad projects. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__portfolio,mcp__triad__persona_run`. The registry is `~/.claude/legion/portfolio.md`; it works from any directory.

1. `register`: call portfolio action `register` for this directory and show the result. Stop. `unregister [name]`: confirm with the user (AskUserQuestion), then call action `unregister` with `project` (default this directory). Stop. Never remove Stale projects on your own.
2. Otherwise call portfolio action `dashboard` and show it as is. If it says there is no registry or it is empty, stop there.
3. Menu loop (AskUserQuestion "What next?"): View project details / Add dependency / Studio Producer analysis / Done.
   - View project details: ask which project (the registered names), call action `details`, show the current phase, plan breakdown, recent decisions, next action and open issues from it.
   - Add dependency: ask the source project and its phase, the target project and its phase, and the type (blocks: hard; informs: soft), plus a one-line reason. Call action `add_dep`; show its message.
   - Studio Producer analysis: call persona_run (read_only) with agent `project-management-studio-producer` (Opus tier), label `studio-producer-portfolio`, and a brief: `# Portfolio Analysis Task`, `## Portfolio State` (the full dashboard text), `## Instructions`: holistic analysis of resource conflicts, dependency risk and strategic alignment; the highest-priority cross-project actions; sequencing for specialties several projects compete for; which projects to pause, accelerate or deprioritize; use your Strategic Portfolio Plan shape; under 500 words, executive summary first. Show the answer.
   - Done: "Portfolio view closed. Run `/triad:portfolio` anytime to check in."
