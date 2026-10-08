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

Covered by `claude plugin test` (projection, wrap-up note, stop with a schema-conforming `partial`, withheld results, oversized briefs, coders never stopped) and by a live acceptance run. `bench/ceiling/run.sh <dir> [options]` asks one helper to read 24 note files (~465 KB) in full and append a line per file to SUMMARY.md; the orchestrator continues with fresh helpers when one returns `partial`. `bench/ceiling/check.py` passes when no Haiku request went over 100,000 prompt tokens, the ledger's helper usage equals the CLI's billed Haiku usage (no request went unseen), and SUMMARY.md has every file's headline. Evidence in `bench/results/phase4/`.

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

Triad reads and writes Legion's `.planning/` layout as is: `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `phases/NN-slug/` with `NN-CONTEXT.md`, `NN-PP-PLAN.md`, `NN-PP-SUMMARY.md` and `NN-REVIEW.md`, and Legion's root `settings.json`. Both STATE field forms (`- **Phase**: N of M` and `Phase: N of M`), progress tables with or without a Reviewed column, legacy plan frontmatter (`plan: 2`, `agent:`) and older plans' `<verify><automated>` task checks are read without migration. Existing projects keep their `commit_prefix`; new ones get `triad`. Derived Legion material and its MIT notice: `LEGION-NOTICE.md`.

| Command | Kind | Does |
|---|---|---|
| `/triad:start` | plugin command (Opus judgment) | Questioning flow, then `project_init` writes PROJECT/ROADMAP/STATE from Legion's templates. |
| `/triad:plan [N]` | plugin command | Opus decomposes the phase into wave-ordered plans (personas picked with `persona_brief`), `plan_write` writes schema-valid plans and runs the mechanical critique, Opus adds the judgment critique, up to 2 auto-refine rounds (`only`). |
| `/triad:build` | plugin command over `build_phase` | Wave executor in mod code: one agent per plan at its persona's tier (haiku personas on triad-helper, opus personas with the opus model), plans of a wave in parallel unless they share files, verification commands run by the mod, one follow-up fix on a failed check, a SUMMARY.md per plan (failures too), STATE/ROADMAP after every plan and wave, Legion's commit messages. Resumes from the first plan without a successful summary. |
| `/triad:review` | plugin command over `review_phase` | Panel (2-4 reviewers by divisions touched, always one Testing) or classic; reports parsed and triaged in code (confidence ≥80 actioned, 50-79 deferred, <50 dropped; dedup by file and overlapping lines); must-fix findings (blocker/critical/major) routed to fix agents by file; re-review of changed files; stale-loop abort; up to `review.max_cycles`; NN-REVIEW.md, STATE, ROADMAP `[x]`. |
| `/triad:quick` | plugin command | One coder on a small ad-hoc task, optional commit and review. |
| `/triad status`, `/triad validate [--ci] [--fix]` | mod subcommands, no model | Dashboard and next action; schema and consistency checks (exit 0/1/2). |

The tools (`mcp__triad__planning_status`, `project_init`, `plan_write`, `plan_check`, `build_phase`, `review_phase`, `persona_brief`) are registered deferred, so they cost no prompt tokens until a `/triad:*` command loads them, and run in the main loop only. Authority: while an agent works a plan, every Edit/Write is checked against the plan's `files_modified` and `files_forbidden` under the control mode (surgical denies and the executor reverts unclaimed changes, guarded and autonomous warn and record an escalation, advisory logs). Progress goes to `.triad/legion.log`, each agent's raw answer to `.triad/legion/`.

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

Version 0.6.0.

Every Legion workflow now has a Triad equivalent (`PARITY.md`). Judgment work is a plugin command; anything deterministic (parsing, scoring, formulas, file layout, checks, git and `gh`) is mod code behind a deferred `mcp__triad__*` tool, so it costs no tokens and cannot drift. Persona agents run through `persona_run`: in parallel, at the persona's tier, with its distilled core on top of the brief, and read-only unless the command names writable files.

| Command | Does (code / agents) |
|---|---|
| `/triad:map` | Codebase map and `rg` index in code (`.planning/CODEBASE.md`, `.planning/codebase/`); Haiku writes the narrative sections; freshness check and query in code. |
| `/triad:advise <topic>` | Persona picked by registry scoring; one read-only advisor; follow-ups; optional memory record. |
| `/triad:explore [idea]` | Context first, Haiku research fan-out, one decision per question, Polymath (Opus) synthesis of 2-3 approaches, design doc in `.planning/explorations/` that `/triad:start <path>` reads. |
| `/triad:board meet <topic>` / `review` | Slate by registry score (max 2 per division); independent assessments, discussion rounds, a binding APPROVE/REJECT vote with one re-vote then ABSTAIN; the resolution formula (≥2/3 approved, majority with conditions, even tie escalated to the user) in code; `.planning/board/{date}-{slug}/` artifacts, a memory record and a commit. `review` is the assessment phase only. |
| `/triad:spec [N]` | Gather, trigger, completeness and open-question check (PASS/CAUTION/REWORK, Blocking questions halt planning), path validation against `directory-mappings.yaml` and the complexity rating in code; research, writing and critique by personas. `.planning/specs/NN-slug-spec.md`. |
| `/triad:design`, `/triad:marketing` | Domain detection (MKT-/DSN- ids, `workflow_type`, `--domain`; keywords only hint), teams, wave patterns, document scaffolds (`.planning/designs/`, `.planning/campaigns/`), lifecycle status, completion checks and design grades in code; brief, consultation, documents and the three-lens / marketing reviews by personas. |
| `/triad:retro`, `/triad:learn` | Metrics and memory in code (`.planning/memory/`, four-bracket decay, archive never delete); the retrospective is written by a persona. |
| `/triad:milestone`, `/triad:portfolio` | Milestone status, completion and archiving; cross-project registry `~/.claude/legion/portfolio.md`, dependencies and allocation, in code. |
| `/triad:agent`, `/triad:roster` | Guided persona creation with the 8 checks in code; roster gap analysis and the agent limit. |
| `/triad:ship [--canary]` | Six pre-ship gates and the ship report in code; PR, push or mark via `git`/`gh`; canary on the mod clock (never auto-rollback). |
| `/triad:polish` | Scope (cap 50 files), test and type-check baseline, four passes, per-file revert on a regression, in code around the agents. |
| `/triad:plan` flags | `--dry-run`, `--auto` (board quick-assess, spec, proposals, critique, design 7-pass review, security scan; BLOCKER halts), `--auto-refine`, `--skip-board`, `--skip-security`, `--security`, `--spec`, `--domain=`; GitHub phase issue sync. |
| `/triad:build` flags | Intent flags validated in code (`--just-harden` ad-hoc team, `--just-document`, `--skip-frontend`, `--skip-backend` plan filters), natural-language routing, `--dry-run`, two-wave mode (Wave A build + analysis, architecture gate, Wave B execution + remediation, production verdict, manifests). |
| `/triad:review` flags | `--security` / `--just-security` (scan in code, OWASP/STRIDE by the security persona, unresolved CRITICAL/HIGH block ship), `--dry-run`, domain reviews. |

Legion inconsistencies were resolved in code and noted where they live (for example: the board follows the skill's vote, not the command's SUPPORT/OPPOSE; domain documents are flat files; the merged marketing roster ids are remapped).

### Phase 6 live acceptance

`bench/run_phase6.sh` runs three headless checks on the Legion sample project. The evidence is in `bench/results/phase6/`. Costs come from the ledger and include subagents.

| Run | Result | Cost |
|---|---|---|
| `/triad:build 2 --dry-run --skip-frontend` | Prerequisites, mode and plan filter reported; `git status` empty afterwards | $0.15 |
| `/triad:build --just-harden --just-document` | Rejected by the intent validator before any work started | $0.08 |
| `/triad:board meet Store the inventory in SQLite instead of JSON files` | 3 independent assessments, 1 discussion round, vote 0-3 REJECTED; `.planning/board/` artifacts, an OUTCOMES record and a commit | $0.33 |
| Total | | $0.56 |

The board run found a scoring bug. The everyday word "store" matched `marketing-app-store-optimizer` by its id, so it led a storage decision. Id words are now a weak signal, and database technologies (SQLite, Postgres and others) imply "database". The same topic now leads with `engineering-backend-architect`. A test covers it.
