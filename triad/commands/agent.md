---
description: Create a custom persona for this project, validated and added to the roster
argument-hint: "[one-line description of the specialist]"
---
Create a custom Triad persona. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__agent,mcp__triad__roster,mcp__triad__persona_brief`.

Pre-flight: if `.planning/PROJECT.md` is missing, say "No Triad project found. Run `/triad:start` to initialize." and stop. Call roster action `limit`; if it says AT_LIMIT or EXCEEDED, show the suggestions and ask whether to consolidate first or create anyway (pass `force` only on an explicit yes).

On cancel at any stage: "Agent creation cancelled. No files were modified." Nothing is written before the last gate.

1. Stage 1. Unless the arguments already say it, ask "What kind of specialist do you want to add to your team? Give me the one-liner — what does this agent do?" Infer the domain, capability and differentiator, the division (Engineering, Design, Marketing, Product, Project Management, Testing, Support, Spatial Computing, Specialized or Custom) and an id `{division}-{specialty}` in kebab case. Call persona_brief with the one-liner: if an existing persona already covers it, say which and ask whether to continue. Gate (AskUserQuestion): "I'll create a {division} agent — '{id}'. Specialty: {desc}. Correct, or would you like to adjust?" Looks good / Adjust.
2. Stage 2. Ask only what is still unknown: "What are the top 3-5 things this agent can do that others can't?", "How does this agent think and communicate? What's its personality?", "Are there any hard rules it always follows?" Gate: show Division, Name, Capabilities, Personality, Hard rules; Proceed to tags / Adjust.
3. Stage 3. Propose 3-5 kebab-case task-type tags and the metadata lists (languages, frameworks, artifact_types, review_strengths: 1-8 kebab-case values each), a color, and the tier (sonnet unless the user says otherwise). Gate: Use these tags / Adjust tags.
4. Write the persona body yourself: second person, 80-120 lines, no placeholders, the user's hard rules verbatim under Critical Rules, the display name in the text, with headings `# {Name} Agent Personality`, `## 🧠 Your Identity & Memory`, `## 🎯 Your Core Mission`, `## 🚨 Critical Rules You Must Follow`, `## 🛠️ Your Technical Deliverables`, `## 🔄 Your Workflow Process`, `## 💭 Your Communication Style`, `## 🔄 Learning & Memory`, `## 🎯 Your Success Metrics`, `## ❌ Anti-Patterns`, `## ✅ Done Criteria`.
5. Call agent action `validate`. On failures, fix what is yours (body, lists) and re-validate; take corrections from the user for a name collision (offer `{id}-2` or a more specific id) and go back to Stage 1 for it.
6. Final gate: show the file path `.planning/agents/{id}.md` and the catalog row; ask "Ready to write?" Then call agent action `create` and show its summary.
