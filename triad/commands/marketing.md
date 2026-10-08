---
description: Marketing workflow — campaign brief, campaign document with channel strategy and content calendar in .planning/campaigns/, cross-channel consistency and the marketing quality review
argument-hint: "[campaign | review | status <state>] [name]"
---
Marketing workflow. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__domain,mcp__triad__persona_run,mcp__triad__planning_status`. Detection, teams, wave patterns, the campaign scaffold, lifecycle status and the completion check are in code (domain tool). Campaign documents are supplementary: never block a phase on them.

**campaign** (default)
1. Call domain action `detect` with the current phase. If it is not a marketing phase, say so and ask whether to continue anyway.
2. Brief questions (AskUserQuestion; skip what the phase or CONTEXT.md already answers): Q1 objective (Brand awareness / Launch announcement; User acquisition / Growth; Community building / Engagement; Product promotion / Conversion). Q2 target audience (free text: demographics, interests, platforms). Q3 channels, multi-select: twitter, instagram, tiktok, reddit, blog, email, app-store, growth (show the agent for each). Q4 timeline (Sprint (1-2 weeks); Standard (4-6 weeks); Ongoing (3+ months)). Q5 key message or value proposition (free text).
3. Call domain action `team` (domain marketing, answers: objective, channels, visual, tracking) and show it. One responsible agent per content item; the strategist reviews and owns long-form; channel specialists own platform-native formats; cross-division agents support but never own slots.
4. Call domain action `write` (kind campaign, the campaign name, fields: objective, audience, channels, message, timeline). Then persona_run `marketing-content-social-strategist` (read_only false, writable = that path, label `campaign-plan`) to fill: the core messaging (one-sentence core message, three supporting points — rational, emotional, social proof — 2-3 hashtags, primary CTA); success metric targets; the channel strategy rows (content types and frequency per channel, adapted per channel: Twitter punchy threads, Instagram aspirational captions 150-300 words, TikTok 15-60s scripts, Reddit value-first 200-500 words never salesy, Blog 800-2000 words, Email 200-400 words with a button CTA; an adaptation never changes the core message); and the content calendar for the timeline (Sprint: daily on 2-3 channels; Standard: W1 teaser, W2 daily launch burst, W3-4 3-4x/week per channel, W5 optimize, W6 measure; Ongoing: monthly themes) with an owner agent in every row. Call domain action `check` and fix what it reports once.
5. Report the path and team. Plans for the phase reference the campaign; Wave 1's summary carries the core messaging brief and every Wave 2 agent gets the same brief plus only its own calendar slots.

**status <state>** — domain action `status` with the campaign path: Planning → Active (build starts) → Measuring (content waves done) → Complete (reviewed, outcomes recorded).

**review** — persona_run `marketing-content-social-strategist` (read_only) on the campaign and the phase's content: core message consistency, channel adaptation, calendar completion (no gaps), brand voice, CTA alignment, and the consistency checklist (core message and supporting points distributed, hashtags consistent, visual guidelines sent, CTA destinations aligned, per-channel tone documented, launches staggered 2-4 hours). Report findings with severity; append them to the phase review file.
