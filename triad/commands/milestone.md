---
description: Milestone dashboard, definition, completion summary and archiving
argument-hint: ""
---
Milestones for the Triad project.

Load the tools: ToolSearch with query `select:mcp__triad__milestone`.

1. Call milestone with action `status` and show it.
2. If no milestones are defined, ask (AskUserQuestion) "Would you like to define milestones for this project?" (Define milestones / Skip for now). On define: read the Phase Details in `.planning/ROADMAP.md`, group the phases by theme, dependency chains and natural deliverable breaks (every phase in exactly one milestone, contiguous ranges), present `| # | Milestone | Phases | Goal |`, and ask "Accept these milestone groupings?" (Accept / Modify). Write the accepted groups with action `define`; on a validation error, fix the ranges and try again.
3. Then loop: ask "What would you like to do?" with the actions the status lists (View milestone details, Complete milestone N, Archive milestone N, Redefine milestones) plus Done. After each action, show the status again and ask again, until Done.
   - View: call action `facts` for the milestone and present goal, per-phase plans, deliverables and requirement coverage (and `.planning/milestones/MILESTONE-N.md` if it exists).
   - Complete: call `facts`, write one line per phase on its key deliverable and pick the decisions relevant to the milestone, then call `complete` with `deliverables` (phase number to line) and `decisions`. If it reports that a summary exists, ask whether to overwrite (call again with overwrite: true) or skip.
   - Archive: ask "Archive Milestone N: {name}? This will move its phase directories from .planning/phases/ to .planning/archive/milestone-N/. Files remain accessible in the archive location." (Archive / Cancel); on Archive call `archive`.
   - Redefine: as in step 2; `define` replaces the section.
   - Done: "Milestone view closed."
4. If STATE.md has a `## GitHub` section with a milestone number for a milestone you completed, and `gh auth status` succeeds, close it: `gh api repos/{owner}/{repo}/milestones/{number} --method PATCH -f state=closed`.
