---
description: Board of directors — full deliberation and a binding vote on a proposal, or a quick assessment of the current phase
argument-hint: "meet <topic> | review [--phase N]"
---
Board of directors for the Triad project. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__board,mcp__triad__persona_brief`. Members are read-only persona agents; the vote formula, artifacts, memory record and commit are all in code.

1. Parse the mode. `meet <topic>` or `review`. Anything else (or `meet` with no topic): show the usage (`/triad:board meet <topic>` full deliberation; `/triad:board review` quick assessment of the current phase) and stop.
2. **review**: call board action `review` (pass `phase` when given). Show the table it returns. Nothing is saved. Next: address the concerns, or `/triad:board meet <topic>` for a binding decision.
3. **meet**:
   a. Call board action `compose` with the topic and show the slate (agent, division, lenses). If it says fewer than the minimum scored, ask the user to rephrase the topic, name members, or (only with exactly 2) opt into a board of 2 (`allow_two`). Otherwise ask (AskUserQuestion) "Confirm board composition for: {topic}" — Recommended slate / Custom composition. For custom, ask for agent ids (use persona_brief with the topic to offer the candidates); the tool validates them.
   b. Collect the proposal context: the relevant parts of PROJECT.md, the current phase, and anything the user said about the proposal. Keep it under 400 words.
   c. Call board action `meet` with `topic`, `context`, and `members` when custom (and `allow_two` when the user opted in). It runs independent assessments, the discussion rounds, the vote (one re-vote, then ABSTAIN), resolves the verdict in code, writes `.planning/board/{date}-{slug}/`, records the decision in memory and commits.
   d. Show the result, then route:
      - APPROVED: "Proceed. Next: /triad:build."
      - APPROVED WITH CONDITIONS: the numbered conditions; "Resolve the conditions, then /triad:build."
      - REJECTED: the key reasons; suggest revising the proposal, `/triad:advise {topic}`, or bringing a revised proposal back with `/triad:board meet`.
      - ESCALATED (tie): ask the user (AskUserQuestion) "The board is tied. As chair, how do you decide on: {topic}?" — Approve / Approve with additional conditions / Reject / Table for later. For conditions, ask for them. Call board action `decide` with the `dir` the result named, `decision` (approve, approve_conditions, reject, table) and `conditions`.
