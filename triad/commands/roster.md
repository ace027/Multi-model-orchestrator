---
description: Roster gap analysis — production-role coverage, severity, intent teams and the agent limit
argument-hint: "gaps [--category=<cat>] [--validate-intents] [--output=<path>] | limit"
---
Roster analysis. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__roster`.

1. `limit`: call roster action `limit` and show it. Stop.
2. Otherwise (`gaps`, the default): call roster action `gaps` with `category`, `validate_intents` (true unless the user turned it off) and `output` from the flags. All numbers are computed in code. If the report already exists, ask the user before calling again with `overwrite: true`. If the config is invalid, show the errors and stop.
3. Read the report and replace its `_Pending: impact and recommendation prose._` line in section 5 with short prose: for each critical and high gap, its impact on production readiness and the recommendation (create an agent with `/triad:agent`, enhance an existing persona, or accept the gap). Do not change any number.
4. Show the executive summary and the top gaps, and point to the report.
