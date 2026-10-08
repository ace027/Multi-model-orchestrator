---
description: Read-only expert consultation from one persona on a topic, with follow-ups and an optional memory record
argument-hint: "<topic> (e.g. architecture, UX, marketing, testing)"
---
Advisory session. Topic: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__persona_brief,mcp__triad__persona_run,mcp__triad__memory`. Advisory sessions never change STATE.md, ROADMAP.md or code.

1. No topic: show usage with examples by category (Engineering: architecture, API design, DevOps; Design: UX, accessibility, design systems; Business: strategy, operations; Marketing: content, growth, campaigns; Testing: QA strategy, performance, security; Product: roadmap, user research) and stop.
2. Read `.planning/PROJECT.md` if it exists (name, description, stack, constraints). Advice works without a project.
3. Call persona_brief with `task` = the topic. Ask the user (AskUserQuestion) "Which agent should advise on this topic?" with the top two (the first marked Recommended, each with its division and why it matched) and "Other (pick from the roster)". For Other, offer the roster ids from persona_brief results by division; accept only valid ids.
4. Call persona_run (read_only true, one run, label `{agent}-advisor`) with a brief: the topic; "READ-ONLY advisory session: do not create, modify or delete files"; the project context (or "No project context; give general domain expertise"); explore the codebase with Read/Glob/Grep to ground the advice; structure the answer as Assessment, Recommendations, Trade-offs, Next Steps; cite files; be direct about risks.
5. Show `## Advisory: {topic}`, `**Advisor**: {agent} ({division})`, then the answer.
6. Ask "Continue this advisory session?" — Ask a follow-up question / Switch topic / End session.
   - Follow-up: ask for the question, then persona_run the same agent with the original brief, a short summary of its prior advice, and `## Follow-Up Question`. Show it and return to this step.
   - Switch topic: start again at step 1 with the new topic.
   - End: if `.planning/memory/` exists, ask "Was this advisory session useful?" — Yes, record to memory / No, just end. On yes, ask for a one-sentence takeaway (or auto-generate it from the first recommendation), then call memory action `record` with type `pattern`, the summary (≤80 chars), tags `advisory`, the agent id and topic words, and text "Advisory from {agent} on {topic}: {key recommendation}". Tell the user it can be recalled with `/triad:learn --recall {topic}`.
