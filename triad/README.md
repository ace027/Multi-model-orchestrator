# triad

Claude Code mod that runs development work across three model tiers: the main session on Opus orchestrates, `triad-coder` agents on Sonnet implement one task each, and `triad-helper` agents on Haiku do menial work. Mode B (routed flat; see `../SPIKE.md`): only the orchestrator has the Agent tool, and coders reach Haiku through the `mcp__triad__delegate_menial` tool, whose handler spawns the helper.

Run it with `claude --model opus --plugin-dir ./triad`. Requires Claude Code 2.1.287 or later.

## What the hooks enforce (Phase 2)

| Hook | Does |
|---|---|
| `session.start` | Registers `delegate_menial` and `/triad`, loads this session's ledger from `$.store`. |
| `prompt.context` | Adds the orchestrator guidance block (byte-stable, for caching). |
| `agent.offer` | Offers only `triad:triad-coder` and `triad:triad-helper` (with `strictMenu`). |
| `agent.spawn` | Forces the tier's model (coder Sonnet, helper Haiku) and `background: false`; refuses other agent types, spawns deeper than `maxDepth`, and spawns over the concurrency caps. Records the tree. |
| `tool.call` `Agent` | Checks the reply against the return schema and sends a non-conforming reply back once (`maxRetries`), naming the agent id for SendMessage. |
| `tool.call` `delegate_menial` | Coders only. Pre-flight size check (40k tokens), spawns a Haiku helper with the files it may write, waits for its answer in a child process (the hook budget does not count that wait), checks the schema, asks once for a resend. |
| `tool.call` `Edit`/`Write`/... | A helper may write only the files its brief names (`Writable files:` line, or the paths in the brief). |
| `turn.step`, `turn.complete`, `session.measure` | Feed the ledger: per request usage by agent and tier, priced per tier, including Haiku's over-100k rate (cache reads and writes count toward the line). |
| `command.run` `/triad` | Prints the tree, tokens and cost per tier, and budgets. |

The ledger is kept in `$.store` (`ledger:<session id>`) and written to `.triad/ledger.json` in the project (the folder has its own `.gitignore`). `bench/check_ledger.py` checks that every agent ran on its tier's model.

Options (`userConfig`): `maxDepth` 2, `maxCoders` 4, `maxHelpers` 6, `maxRetries` 1, `strictMenu` true.

## Tests

`claude plugin test triad` runs `triad.test.ts` (policy, ledger and hook tests). The test kit drops `agentId` from a plugin's own `$.agent.spawn`, so the helper round trip of `delegate_menial` is covered by the live acceptance run (`bench/run_accept.sh`) instead.

## Phase 2 acceptance

`bench/run_accept.sh <dir> [prompt]` copies the `bench/shop` fixture (add discount codes across four files plus tests, per `TASK.md`), runs `claude -p --model opus --plugin-dir triad`, and leaves the ledger in `<dir>/.triad/ledger.json`; `bench/check_ledger.py` checks it. Recorded run (`bench/results/phase2-ledger.json`, the CLI's own report beside it): the orchestrator on Opus (4 requests), 2 coders on Sonnet, 4 helpers on Haiku (one spawned by the orchestrator, three by coders through `delegate_menial`, at depth 2), all 15 fixture tests passing. Per-model tokens match the CLI's `modelUsage` exactly, and the ledger's cost ($0.4178) matches the CLI's ($0.4179); the gap is the engine's own side calls (session title), which never pass through `turn.step`. Largest Haiku prompt: 9,980 tokens.

Findings from the runs:
- The main loop writes its cache with the 1-hour TTL (2x input); subagents use the 5-minute rate. The ledger prices them that way.
- `session.measure`'s `cost` is not the session's running total (it reported $0.0001 on a $0.42 run), so the ledger prices usage itself.
- The orchestrator guidance (`prompt.context`) reached the main conversation only (1 injection per session).
- Without being asked, Opus used a single coder and the coder did not delegate on this small task; the recorded run asked for the tiers in the prompt. Whether to route more work to Haiku by default is a Phase 3 measurement.
- A `claude` started from inside another Claude Code session inherits its session id; the bench script gives each run its own.
