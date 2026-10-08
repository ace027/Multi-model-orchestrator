# triad

Claude Code mod that runs development work across three model tiers: the main session on Opus orchestrates, `triad-coder` agents on Sonnet implement one task each, and `triad-helper` agents on Haiku do menial work. Mode B (routed flat; see `../SPIKE.md`): only the orchestrator has the Agent tool, and coders reach Haiku through the `mcp__triad__delegate_menial` tool, whose handler spawns the helper.

Run it with `claude --model opus --plugin-dir ./triad`. Requires Claude Code 2.1.287 or later.

## What the hooks do

| Hook | Does |
|---|---|
| `session.start` | Registers `delegate_menial` and `/triad`, loads this session's ledger from `$.store`. |
| `prompt.section` `communication` | Adds the orchestrator guidance (byte-stable, for caching) to the main loop only; a `prompt.context` block would also reach every subagent. |
| `tool.describe` | With `deferTools`, defers engine tools the tiers do not use every turn (in a clean environment: ListAgents, ReportFindings, ScheduleWakeup, Workflow); they stay reachable through ToolSearch. |
| `agent.offer` | Offers only `triad:triad-coder` and `triad:triad-helper` (with `strictMenu`). |
| `agent.spawn` | Forces the tier's model (coder Sonnet, helper Haiku) and `background: false`; refuses other agent types, spawns deeper than `maxDepth`, and spawns over the concurrency caps. Records the tree. |
| `tool.call` `Agent` | Checks the reply against the return schema and sends a non-conforming reply back once (`maxRetries`), naming the agent id for SendMessage. |
| `tool.call` `delegate_menial` | Coders only. Pre-flight size check (40k tokens), spawns a Haiku helper with the files it may write, waits for its answer in a child process (the hook budget does not count that wait), checks the schema, asks once for a resend. |
| `tool.call` `Bash`/`Grep`/`Read` | With `compress`, output over `compressThreshold` tokens (Read: log-like files only) is saved to `.triad/out/` and replaced by its error lines, verbatim, plus a Haiku summary (chunked at 60k tokens, merged). A failed Bash call keeps its failure. A helper whose next request would pass its ceiling gets a pointer to the saved output instead of the output. |
| `turn.step` (helpers) | Haiku ceiling. Before each helper request, projects its prompt: the previous request's exact size plus the conversation's growth at 2.5 chars a token (errs high), plus a margin. At `haikuWrapAt` (80k) the helper is told to finish; when the projection passes `haikuCeiling` (95k) the hook answers the step itself with a `status: partial` reply (done and left, from a Haiku one-shot over the transcript's tail, plus the files it wrote), so the request is never sent. Coders and the orchestrator are never stopped. |
| `tool.call` `Edit`/`Write`/... | A helper may write only the files its brief names (`Writable files:` line, or the paths in the brief). |
| `turn.step`, `turn.complete`, `session.measure` | Feed the ledger: per request usage by agent and tier, priced per tier, including Haiku's over-100k rate (cache reads and writes count toward the line). |
| `command.run` `/triad` | Prints the tree, tokens and cost per tier, and budgets. |

The ledger is kept in `$.store` (`ledger:<session id>`) and written to `.triad/ledger.json` in the project (the folder has its own `.gitignore`). `bench/check_ledger.py` checks that every agent ran on its tier's model.

Options (`userConfig`): `maxDepth` 2, `maxCoders` 4, `maxHelpers` 6, `maxRetries` 1, `strictMenu` true, `compress` true, `compressThreshold` 4000, `deferTools` true, `haikuCeiling` 95000, `haikuWrapAt` 80000. A helper brief over 40k tokens is refused at spawn (give it to a coder, or split it). Headless runs can set them with `--settings '{"pluginConfigs":{"triad@inline":{"options":{...}}}}'`.

## Tests

`claude plugin test triad` runs `triad.test.ts` (policy, ledger and hook tests). The test kit drops `agentId` from a plugin's own `$.agent.spawn`, so the helper round trip of `delegate_menial` is covered by the live acceptance run (`bench/run_accept.sh`) instead.

## Phase 2 acceptance

`bench/run_accept.sh <dir> [prompt]` copies the `bench/tasks/discounts/repo` fixture (add discount codes across four files plus tests, per `TASK.md`), runs `claude -p --model opus --plugin-dir triad`, and leaves the ledger in `<dir>/.triad/ledger.json`; `bench/check_ledger.py` checks it. Recorded run (`bench/results/phase2-ledger.json`, the CLI's own report beside it): the orchestrator on Opus (4 requests), 2 coders on Sonnet, 4 helpers on Haiku (one spawned by the orchestrator, three by coders through `delegate_menial`, at depth 2), all 15 fixture tests passing. Per-model tokens match the CLI's `modelUsage` exactly, and the ledger's cost ($0.4178) matches the CLI's ($0.4179); the gap is the engine's own side calls (session title), which never pass through `turn.step`. Largest Haiku prompt: 9,980 tokens.

Findings from the runs:
- The main loop writes its cache with the 1-hour TTL (2x input); subagents use the 5-minute rate. The ledger prices them that way.
- `session.measure`'s `cost` is not the session's running total (it reported $0.0001 on a $0.42 run), so the ledger prices usage itself.
- The orchestrator guidance was then a `prompt.context` block. A Phase 3 probe found those blocks also reach subagents' first message, so it moved to `prompt.section` (main loop only).
- Without being asked, Opus used a single coder and the coder did not delegate on this small task; the recorded run asked for the tiers in the prompt. Whether to route more work to Haiku by default is a Phase 3 measurement.
- A `claude` started from inside another Claude Code session inherits its session id; the bench script gives each run its own.

## Phase 3 benchmark

`bench/run_bench.py` runs the tasks in `bench/tasks` (each a repo, a `TASK.md`, and a hidden `check.py`; every check fails on the untouched repo) under each config through `bench/hermetic.sh`, and writes `bench/results/phase3/<config>/<task>.json` plus `summary.md`. Configs: `p2` = Phase 2 behaviour (`compress` and `deferTools` off), `p3` = defaults, `opus` = no plugin.

| task | kind | p2 ok / cost / tokens | p3 ok / cost / tokens |
|---|---|---|---|
| discounts | small multi-file feature | Y / $0.216 / 112.0k | Y / $0.156 / 106.0k |
| logfix | bug found in a 1.5 MB log | Y / $0.199 / 126.2k | Y / $0.089 / 72.1k |
| noisy | bug behind 85 KB of test output | Y / $0.080 / 95.5k | Y / $0.082 / 87.0k |
| rename | 181 call sites across 60 files | Y / $0.203 / 200.1k | Y / $0.114 / 93.5k |
| testwrite | tests scored against 7 mutants | Y / $0.151 / 103.7k | Y / $0.150 / 103.3k |
| **total** | | **5/5, $0.849, 637.5k** | **5/5, $0.591, 461.8k** |

Tokens are all tokens the CLI reports (input, output, cache read and write, all models). p3 used 28% fewer tokens and cost 30% less, with no task lost. One run per cell, so per-task differences carry run-to-run noise (the agent's path differs between runs); the totals are the measurement.

What the runs show:
- Compression fired once (rename: 6.6k tokens to 0.4k). Opus kept its own output short: it ran tests with `-q`, grepped the log rather than reading it, and tailed long output. Compression is a guard for agents that do not, not the main saving on these tasks.
- Deferral removes about 2.3k tokens from every main-loop request (four tool descriptions, 8.2k characters), so it saves on every turn of every run.
- The tiers were rarely used: Opus did 7 of the 10 tasks alone and handed 3 to one coder; no run used a helper. Tasks this size are cheaper for Opus to do than to brief. Routing behaviour is the open question for Phase 4.
- Two hidden checks were wrong at first (a hidden test file named so that unittest discovery skipped it, and a string compare of JSON); `bench/tasks/*/check.py` now has negative controls run against the untouched repos and a mutated migration.

## Phase 4: Haiku prompt ceiling

Built and covered by `claude plugin test` (projection, wrap-up note, stop with a schema-conforming `partial`, withheld results, oversized briefs, coders never stopped). The live acceptance is `bench/ceiling/run.sh <dir> [options]`: one helper is asked to read 24 note files (~465 KB, well over 100k tokens) in full, and the orchestrator continues with a fresh helper when it returns `partial`. `bench/ceiling/check.py` passes when no Haiku request went over 100,000 prompt tokens, the ledger's Haiku usage equals the CLI's billed Haiku usage (so no request went unseen), and SUMMARY.md names every file with its headline. The control run sets `haikuCeiling` and `haikuWrapAt` to 10,000,000 to show the same job crosses the line without the ceiling. Not yet run: the API key reached its usage limit (until 2026-11-01).
