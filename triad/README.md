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
