# Results

What each build phase measured in live runs, with the scripts that reproduce them. The evidence files are in `bench/results/`. Costs are what the runs cost at the time; rerunning them costs about the same.

| Phase | Measured | Cost of the recorded runs |
|---|---|---|
| 2 | Tiers enforced end to end; ledger matches the CLI's billing | $0.42 |
| 3 | Compression and tool deferral against Phase 2 behaviour, 5 tasks | $1.44 |
| 4 | Haiku prompt ceiling: no request over 100k | $0.75 |
| 5 | Legion-format build, review and plan, no migration | $1.15 |
| 6 | Dry-run build, intent validation, board meeting | $0.56 |
| 7 | Opus only vs Legion vs Triad, 5 tasks (incomplete, see below) | $0.40 so far |

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

The unit tests cover the projection, the wrap-up note, the stop with a schema-conforming `partial`, withheld results, oversized briefs, and that coders are never stopped. This is the live acceptance run. `bench/ceiling/run.sh <dir> [options]` asks one helper to read 24 note files (~465 KB) in full and append a line per file to SUMMARY.md; the orchestrator continues with fresh helpers when one returns `partial`. `bench/ceiling/check.py` passes when no Haiku request went over 100,000 prompt tokens, the ledger's helper usage equals the CLI's billed Haiku usage (no request went unseen), and SUMMARY.md has every file's headline. Evidence in `bench/results/phase4/`.

| | ceiling on (defaults) | control (ceiling off) |
|---|---|---|
| Haiku requests | 52 | 30 |
| largest Haiku prompt | 92,072 | 248,450 |
| requests over 100k | **0** | **15** |
| ledger vs billed Haiku usage | equal | equal |
| wrap-up notes / results withheld / stopped with partial | 1 / 1 / 1 | 0 / 0 / 0 |
| helpers returning partial | 3 (the orchestrator continued each) | 0 |
| SUMMARY.md | 24/24 headlines, 23/24 counts | 24/24 headlines, 24/24 counts |
| cost (CLI) | $0.30 | $0.45 |

With the ceiling, the first helper did weeks 1 to 7, reached 92k, took the wrap-up note and returned `partial`; the orchestrator split the rest across fresh helpers and finished. One more helper was stopped by the hook before a request that would have passed 95k, and its `partial` (done/left from the one-shot) let the orchestrator respawn on the files left. Without the ceiling, one helper read 23 files in one conversation and sent half its requests above the line at the higher rate. The capped run was also cheaper.

Findings:
- The engine refuses subagents writing standalone report files ("Subagents should return findings as text"). Helpers that tried to write part files were blocked and returned their lines as text instead. Briefs should ask helpers to return findings, and let the coder or orchestrator write report files.
- `$.model.complete` one-shots (summaries, progress notes) are billed but are not in the CLI's `total_cost_usd` or `modelUsage`; the ledger counts them under `compressor`.
- The first live attempt found two compression bugs, now fixed: a project under `/tmp` had every Read treated as log-like (the folder test ran on the absolute path), and reading a saved output in `.triad/out` was compressed again.

## Phase 5: Legion workflow

Acceptance (`bench/run_legion.sh <dir>`): `bench/legion/repo` is a Legion-format project (phase 1 complete and reviewed, phase 2 planned with one current-format plan and one legacy plan, `commit_prefix: legion`). Headless `/triad:build` then `/triad:review`, no migration step. Evidence in `bench/results/phase5/`:

- Both plans ran on Sonnet coders, all 4 verification commands passed (run by the mod), a SUMMARY.md per plan, commits `feat(legion): execute plan 02-0N — …`, `chore(legion): update state after wave N of phase 2`, `chore(legion): complete phase 2 execution — Reporting`.
- Panel of 3 reviewers, all PASS; 3 minor/advisory findings at 55-75% confidence deferred, `invlib/cli.py` a hot spot; `chore(legion): phase 2 review passed — Reporting`; STATE at 100% (3/3 plans), ROADMAP row Complete and `[x] Phase 2`. The project's own tests pass; the CLI behaves as the plan says.
- Cost: build $0.15, review $0.17 (CLI); the ledger, which also counts the plugin's spawned agents, says $0.18 and $0.19.
- Legion's own `.planning/` (71 plans) through `/triad validate` and `/triad status`: 11 pass, 55 warnings, 2 failures (two plans name `testing-evidence-collector`, which is not in Legion's roster), "all phases complete" (`legion-own-planning.txt`).

The live runs found three bugs the unit tests could not (the kit drops `agentId` from a plugin's own spawns), all fixed:
- The answer wait passed `timeoutMs` 610000 to `$.process.run`; the host caps it at 600000, so the first build stopped right after its agent started. A failed wait now fails the plan, not the build.
- A plugin's `$.agent.spawn` resolves after the agent has answered, so an answer could arrive before the wait began. Answers are now kept until a wait takes them.
- That spawn also passes through the `Agent` reply check, which rejected every review report for not following the coder schema; the loop saw empty reports and passed the phase. Legion executor agents now skip that check, and a reviewer that returns neither a verdict nor a finding never counts as a pass (it is asked again, then the review escalates).

Live `/triad:plan` (`bench/run_legion_plan.sh`, evidence in `bench/results/phase5/plan3/`): a new Phase 3 (Restock Orders, 3 requirements) added to the built fixture, then plan, build and review headless. Opus wrote 2 plans; the critique passed after one refine round; both plans built with all checks green; the panel passed with 1 deferred finding. Cost $0.83 for all three steps. It found two more bugs, both fixed with tests: a refine round (`plan_write` with `only`) rewrote CONTEXT.md from the partial plan list, and the word "json" in a Python CLI phase put a UI designer on the panel (generic format words no longer score personas, and the panel draws from the touched divisions first).

## Phase 6: the rest of Legion

`bench/run_phase6.sh` runs three headless checks on the Legion sample project. The evidence is in `bench/results/phase6/`. Costs come from the ledger and include subagents.

| Run | Result | Cost |
|---|---|---|
| `/triad:build 2 --dry-run --skip-frontend` | Prerequisites, mode and plan filter reported; `git status` empty afterwards | $0.15 |
| `/triad:build --just-harden --just-document` | Rejected by the intent validator before any work started | $0.08 |
| `/triad:board meet Store the inventory in SQLite instead of JSON files` | 3 independent assessments, 1 discussion round, vote 0-3 REJECTED; `.planning/board/` artifacts, an OUTCOMES record and a commit | $0.33 |
| Total | | $0.56 |

The board run found a scoring bug. The everyday word "store" matched `marketing-app-store-optimizer` by its id, so it led a storage decision. Id words are now a weak signal, and database technologies (SQLite, Postgres and others) imply "database". The same topic now leads with `engineering-backend-architect`. A test covers it.

## Phase 7: Opus only vs Legion vs Triad

SPEC section 7 asks for the bench tasks under (a) Opus alone, (b) Legion, (c) Triad, before Legion is removed. `bench/run_phase7.sh <legion checkout>` installs Legion with its own installer into a throwaway HOME (the real `~/.claude` is never touched) and runs `bench/run_bench.py` with the configs `opus`, `legion` and `triad`. Every run gets a fresh HOME. Legion runs through `/legion:quick`, told to take the recommended option wherever it would ask; Triad and Opus get the plain prompt.

**Incomplete.** One run finished before the API key reached its usage limit (the API answered "You have reached your specified API usage limits", until 2026-11-01). The other 14 runs failed before any request was sent and cost nothing.

| task | config | ok | cost | tokens | notes |
|---|---|---|---|---|---|
| discounts | legion | Y | $0.401 | 197.3k | 4 turns, all on Opus; it picked no subagent |
| discounts | triad (Phase 3 run, for reference) | Y | $0.156 | 106.0k | |

Setting this up found a bug in `run_bench.py`: `--allowedTools` takes several values, so the `opus` config's prompt was read as a tool name. The flag is now passed as `--allowedTools=...`. Phase 3 recorded only `p2` and `p3`, which were not affected.
