# Results

What each build phase measured in live runs, with the scripts that reproduce them. The evidence files are in `bench/results/`. Costs are what the runs cost at the time; rerunning them costs about the same.

| Phase | Measured | Cost of the recorded runs |
|---|---|---|
| 2 | Tiers enforced end to end; ledger matches the CLI's billing | $0.42 |
| 3 | Compression and tool deferral against Phase 2 behaviour, 5 tasks | $1.44 |
| 4 | Haiku prompt ceiling: no request over 100k | $0.75 |
| 5 | Legion-format build, review and plan, no migration | $1.15 |
| 6 | Dry-run build, intent validation, board meeting | $0.56 |
| 7 | Opus only vs Legion vs Triad, 5 tasks, plus a rerun after the guide trim | $4.95 |
| 7 | Harder graded tasks, Opus only vs Triad | $1.26 |
| 7 | Browser games, Opus only vs Triad | $5.54 |
| 8 | Triad 0.8.0 (twice) and Opus (again) on the games and harder tasks | about $8.6 |
| 9 | Structured workflow (Triad 0.9.0) on Tron, twice, plus phase 3 rebuilt on the Opus coder | about $19.2 |
| 9 | The same workflow with every agent on Opus (`allOpus`) | about $12.1 (plus about $2.0 for a run stopped at the API usage limit) |

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

All 15 runs passed their hidden checks. One run per cell; Legion's `discounts` run came first, the rest a day later on the same Claude Code build.

```
task       config ok      cost    tokens    in+cw    out  secs  agents
discounts  legion Y      0.401    197274    47981   6637    63
discounts  opus   Y      0.154    102668    11194   4003    35
discounts  triad  Y      0.224    124590    32921   5048    44  coder:1 orchestrator:1
logfix     legion Y      0.484    386654    54745   7281    80
logfix     opus   Y      0.168    196504    12926   3384    39
logfix     triad  Y      0.196    162415    20319   4786    74  coder:1 orchestrator:1
noisy      legion Y      0.163    177147    18936   1829    26
noisy      opus   Y      0.077     94377     8010    980    16
noisy      triad  Y      0.094     88596    11546   1038    19  orchestrator:1
rename     legion Y      0.495    487599    50960   7706    85
rename     opus   Y      0.213    224322    23769   2732    33
rename     triad  Y      0.187    165230    21406   2587    49  compressor:1 orchestrator:1
testwrite  legion Y      0.248    221141    21359   5108    46
testwrite  opus   Y      0.148     79856    10023   4254    39
testwrite  triad  Y      0.174    122569    18572   6244    52  coder:1 orchestrator:1
```

| config | passed | cost | tokens |
|---|---|---|---|
| Opus only | 5/5 | $0.760 | 697.7k |
| Legion | 5/5 | $1.791 | 1,469.8k |
| Triad 0.7.0 | 5/5 | $0.875 | 663.4k |

- **Triad against Legion:** the same 5/5 for 51% less cost and 55% fewer tokens. Triad was cheaper on every task. This meets the SPEC section 6 condition for removing Legion.
- **Legion** ran every task on Opus alone through `/legion:quick`: its single agent never became a subagent, so the persona and registry text it loads is pure overhead on tasks this size.
- **Triad against Opus alone:** 5% fewer tokens but 15% more cost. Triad was cheaper only on `rename` (compression fired). The gap is cache writes: 104.7k against 65.9k, and the main loop writes its cache at the 1-hour rate. Since Phase 4 the orchestrator guide grew from 1.2k to 3.1k characters and gained the Legion command index, all on every main-loop request; on `noisy` Triad wrote 11.5k cache tokens where the Phase 3 run wrote 8.4k. Phase 3's Triad total on these tasks was $0.591. Trimming the guide back (moving the command index behind a deferred tool) is the obvious next step.
- Triad spawned a coder on 3 tasks and no helper; Opus kept the small jobs itself, as in Phase 3.

Setting this up found a bug in `run_bench.py`: `--allowedTools` takes several values, so the `opus` config's prompt was read as a tool name. The flag is now passed as `--allowedTools=...`. Phase 3 recorded only `p2` and `p3`, which were not affected.

### Rerun after the guide trim (0.7.1)

0.7.1 cut the orchestrator guide from about 3,100 to 1,420 bytes: the Legion coordination rules and the knowledge index now go out only with `/triad:*` prompts (as `prompt.submit` context). The `opus` and `triad` configs ran again (`bench/results/phase7b`); Legion was not rerun.

```
task       config ok      cost    tokens    in+cw    out  secs  agents
discounts  opus   Y      0.165    103741    11603   4483    40
discounts  triad  Y      0.222    115698    31472   5628    53  coder:1 orchestrator:1
logfix     opus   Y      0.090     95208     8066   1631    18
logfix     triad  Y      0.193    215310    29308   8417    72  coder:1 helper:1 orchestrator:1
noisy      opus   Y      0.074     93555     7680    921    14
noisy      triad  Y      0.118     78127    16802   1074    20  orchestrator:1
rename     opus   Y      0.216    178280    26194   2760    32
rename     triad  Y      0.158    142576    16443   2557    40  compressor:1 orchestrator:1
testwrite  opus   Y      0.138     79099     9624   3859    33
testwrite  triad  Y      0.150    110150    16058   5297    46  coder:1 orchestrator:1
```

| config | passed | cost | tokens | cache writes |
|---|---|---|---|---|
| Opus only | 5/5 | $0.683 | 549.9k | 63.1k |
| Triad 0.7.1 | 5/5 | $0.840 | 661.9k | 110.0k |

- **The trim did not close the gap.** Triad cost 23% more than Opus alone (15% in the first run) and its cache writes did not fall (110.0k against 104.7k). The guide is now about 350 tokens, so it is not where the overhead is.
- **The overhead is elsewhere in the main-loop prompt.** On `noisy`, where Triad spawned nothing, it wrote 16.8k input and cache tokens against Opus's 7.7k. What the plugin adds to every request besides the guide: its 20 command descriptions in the command listing, the Triad agent descriptions in the Agent tool, the `delegate_menial` schema and the deferred tool names. Each coder spawn adds a cache write of its own.
- **Runs are noisy.** Opus alone on `logfix` cost $0.168 in the first run and $0.090 here; single runs per cell cannot resolve differences of a few cents per task.
- Triad still beats Legion by a wide margin, so the removal decision stands.

### Quality of the work

The hidden checks are pass/fail, so the run directories were also compared by hand and each run's own tests were scored against extra mutants (`testwrite`: 9 more bugs in `inventory.py`; `discounts`: 7 bugs across the discount math, lookup, cart and CLI). No model calls; covers both Phase 7 runs.

- **noisy:** the same one-line fix (`ROUND_HALF_EVEN` to `ROUND_HALF_UP`) in all five runs, byte for byte.
- **rename:** the same 60-file migration in all five runs. Triad (first run) and Legion also reworded a docstring in `app/client.py` that still pointed at the deleted module.
- **logfix:** every run found the cause (the new firmware's `Z` suffix) and fixed `parse_ts` correctly. Triad's coder wrote the most thorough regression tests both times (exact datetime, lowercase `z`, a still-rejected timestamp with no offset); Legion's fix accepts only an uppercase `Z`.
- **discounts:** near-identical designs. Opus's tests were a little broader (a real-process exit-status test, a registry loaded from a temp file); Triad's CLI skips the code on `--code ""` instead of rejecting it. Every run's tests caught all 7 extra mutants.
- **testwrite:** every suite caught the 7 benchmark mutants and all 9 extra ones.

On these tasks the work is equivalent across Opus alone, Legion and Triad, although in Triad a Sonnet coder wrote the code for `discounts`, `logfix` and `testwrite`. The tasks are small and well specified, so quality saturates; telling the configs apart on quality would need harder, more open tasks.

## Harder tasks

The Phase 7 tasks are too small to separate the configs on quality: every run produced equivalent work. Two harder tasks with graded checks (`python3 bench/run_bench.py --tasks hard`):

- **csvimport:** a CSV importer for a small banking library, from a two-page format spec (`docs/csv-format.md` in the fixture): delimiter and number formats that depend on each other, quoting, three ways to write a negative, debit/credit columns, a footer rule, line-numbered row errors, and duplicate matching by count. The fixture's existing QIF importer uses a set for duplicates, which is wrong for CSV; copying it costs points. 30 hidden cases.
- **refunds:** a refund service with three tickets from support and finance (items refunded that never shipped, a double refund after a mail outage, partial refunds a cent over the charge) and a written refund policy. A fourth bug breaks the policy but has no ticket. 18 hidden cases; the untouched fixture scores 6/18.

Each check prints `score P/N`; a run succeeds at 80% with its own tests passing and tests added, and the score goes into the results table. `bench/selftest.py` checks both, with no model calls: each check must fail the untouched fixture and give the reference solution in `tasks/<task>/solution` full marks. Realistic mistakes, made in a copy of the reference, lose points:

| Mistake | Score |
|---|---|
| refunds: fixes the three tickets, misses the unreported bug | 15/18 |
| refunds: no double refund, but a failed notification still returns 503 | 16/18 |
| refunds: rounding still per request | 16/18 |
| csvimport: amounts through floating point | 29/30 |
| csvimport: duplicates by set, copied from the QIF importer | 29/30 |
| csvimport: slash dates always month-first | 29/30 |
| csvimport: no `Total` footer rule, signed debits accepted | 27/30 |

Like the other tasks' checks, the hidden tests and reference solutions sit in `bench/tasks`, outside the run's working copy.

### First run (`bench/results/hard1`)

```
task       config ok           cost    tokens    in+cw    out  secs  agents
csvimport  opus   Y 30/30     0.418    266809    24256  12523   115
csvimport  triad  Y 30/30     0.377    240584    43973  12141   107  coder:1 orchestrator:1
refunds    opus   Y 18/18     0.209    116031    15579   5603    51
refunds    triad  Y 18/18     0.260    156625    31287   6796    65  coder:1 orchestrator:1
```

- **Both configs scored full marks on both tasks.** Both found the unreported over-refund bug and fixed all four policy breaks the same way (cumulative rounding, record before notifying, queue failed notifications). In Triad a Sonnet coder wrote the code for both.
- **Cost:** Triad $0.637, Opus alone $0.627. Triad was cheaper on `csvimport`, the larger task, and dearer on `refunds`.
- **Tests:** Opus wrote more and stricter ones (`csvimport` 36 against 22; `refunds` 19 against 14). Each config's own tests caught every flawed implementation from the table above. Cross-checked, Triad's code passes all of Opus's tests but one: it accepts a single-digit slash date (`1/2/2026`), which Opus's tests reject; the spec does not say. Both configs also went past the reference solution: both reject malformed units in refund requests, and Opus's tests reject non-ASCII digits as amounts, which the reference accepts.
- The hidden checks are saturated again, so they cannot separate the two configs. The remaining differences (test thoroughness, edge cases the spec leaves open) need either harder hidden cases or several runs per cell.

## Browser games

Two longer tasks with a GUI (`python3 bench/run_bench.py --tasks games`), built from a written spec into an empty repo: plain HTML canvas and JavaScript, no build step, tests under `node --test`. Playwright for Node and Chromium are available to the run, and the task asks it to play the game and look at screenshots. The environment passes `PLAYWRIGHT_BROWSERS_PATH` and `NODE_PATH` through `bench/hermetic.sh` for this.

- **tron:** Light Cycles against the computer. The spec fixes the rules tick by tick (simultaneous moves, ignored reversals, draws, rounds, match to 3), the page and key handling, the colours, and a `window.tron` hook.
- **pacman:** the classic maze (`levels/classic.txt`), with pellets, power pellets, the tunnel, the ghost house and its release ticks, the scatter and chase schedule, all four ghost targeting rules, the frightened and eyes modes, the 200 to 1600 eating chain, deaths, levels and the extra life. All of it is defined per tick so the game is deterministic, and it is exposed through `window.pacman`.

The hidden checks (`bench/webgrade.cjs`) serve the work dir and drive it in headless Chromium:

| Part | tron | pacman | Pass mark |
|---|---|---|---|
| Rules through the hook | 20 cases | 32 scripted cases on small mazes and the classic maze | 80% |
| The page in real time: load, wait for Space, tick rate, keys, pause, and colour counts from real screenshots (things drawn, trails growing, pellets vanishing) | 8 | 8 | 7/8 |
| Open-ended | `chooseMove` tournament: 24 rounds against four bots on obstacle arenas, both sides | 4 long replays of the classic maze driven by a deterministic bot, compared field by field | tron 50%; pacman reported only |

A Pac-Man replay matches only if every rule is exact for up to 3000 ticks, including deaths, eaten ghosts, level clears and the extra life. That makes it a strict fidelity signal on top of the rule cases.

**Validating the specs:** two separate agents each wrote a reference game from the spec alone, without seeing the checks (`tasks/<game>/solution`). The Pac-Man expectations come from a third rules engine, written separately from the spec. Both references get full marks:

```
ok  tron       solution exit 0: score 52/52 rules 20/20 ui 8/8 ai 24/24
ok  pacman     solution exit 0: score 44/44 rules 32/32 ui 8/8 replay 4/4
```

Every place the reference writers reported as ambiguous was either left untested or fixed in the spec (the default for Tron's `ai` option). The Tron reference took about 28 minutes and beat every bot in every round. A strong AI can therefore max out the tournament as well, so it separates weak AIs from good ones but not good ones from each other.

### First run (`bench/results/games1`)

```
task       config ok             cost    tokens    in+cw    out  secs  agents
pacman     opus   Y 44/44       1.141   1101821    51200  34110   418
pacman     triad  Y 44/44       1.335   1250248   148006  74709   532  coder:2 helper:1 orchestrator:1
tron       opus   Y 52/52       2.188   3542743    79030  55574  1478
tron       triad  Y 52/52       0.872    720040    91754  36561   673  coder:2 orchestrator:1
```

- **Every run got full marks**, including all four Pac-Man replays (exact rules for up to 3000 ticks) and 24/24 in the Tron tournament. The checks are saturated again.
- **Cost:** Triad $2.21, Opus alone $3.33. On Pac-Man Triad cost 17% more. On Tron it cost 60% less: there Opus alone spent 25 minutes writing its own practice bots (`tests/bots.js`) and tuning its AI against them.
- **Tests:** Triad wrote more unit tests on both games (Pac-Man 33 against 18, Tron 26 against 17). Opus alone added browser tests on both games; Triad added them on Pac-Man only. None of the four runs' tests take screenshots; the browser tests drive the page through the hook and the DOM.
- **AI strength, head to head** (`bench/tron_crossplay.cjs`, 16 rounds per pair, no model calls):

| Pair | Score |
|---|---|
| Opus alone vs Triad | 11 – 5 |
| reference vs Opus alone | 9.5 – 6.5 |
| reference vs Triad | 12 – 4 |

  This is the first quality difference between the configs on any task. Opus's extra Tron spend bought a clearly stronger AI, although still not as strong as the reference, which took about 28 minutes. Sixteen rounds is a small sample, and each config was run once.

Screenshots of each game on its start screen and after a few seconds of play (taken afterwards from the runs' work dirs, 1024×768): `bench/results/games1/screens/`.

## Triad 0.8.0: cheaper orchestration (`bench/results/v080`)

The goal was the same output as Opus alone for less money. The games run showed where Triad's money went: the Opus orchestrator re-reads its whole context on every turn (20 turns and $0.65 on Pac-Man), fresh coders and helpers each pay to load context, and the one quality gap (the Tron AI) came from Opus alone tuning its AI against practice bots, which Triad's coder was never asked to do. 0.8.0 changes only the guide and the coder prompt:

- The orchestrator keeps its turns few (brief fully, wait, review once), makes small known edits itself, gives one coder a whole cohesive deliverable, and sends fixes to the same coder with SendMessage instead of a fresh agent.
- A quality goal that tests don't capture (an AI's strength, speed, looks) goes into the brief, and the coder builds a way to measure it and iterates against it.

Triad 0.8.0 ran twice (`a`, `b`) and Opus alone ran a second time (`opus2`), on the two games and the two harder tasks. **Every run got full marks again.** Cost per run:

| Task | Opus alone (2 runs) | Triad 0.7.1 | Triad 0.8.0 (2 runs) |
|---|---|---|---|
| pacman | $1.14, $1.15 | $1.33 | $0.82, $1.10 |
| tron | $2.19, $1.66 | $0.87 | $1.25; run `a` hit the 40-minute cap (at least $0.75) |
| csvimport | $0.42, $0.37 | $0.38 | $0.36, $0.37 |
| refunds | $0.21, $0.21 | $0.26 | $0.21, $0.21 |

- **The orchestrator's overhead is gone.** Its turns fell from 20 to 7–9 on Pac-Man, where Triad is now about 16% cheaper than Opus alone instead of 17% dearer. On the two harder tasks the orchestrator did the work itself, so the cost matches Opus alone; before, Triad cost slightly more.
- **The measured tuning had no end.** In run `a` the Tron coder built a benchmark (`tools/bench.js`) and kept playing 100-round matches against its previous versions until the 40-minute cap stopped the run. The game was finished and passed all 52 checks, but the CLI was killed before it reported its cost. The figure above is rebuilt from the session transcripts, which undercount output tokens.
- **The Tron AI did not get stronger.** Head to head (`bench/tron_crossplay.cjs`, 16 rounds per pair, points out of 16):

| AI | vs reference | vs Opus run 1 | vs Opus run 2 |
|---|---|---|---|
| Opus alone, run 1 | 6.5 | | 9 |
| Opus alone, run 2 | 9 | 7 | |
| Triad 0.7.1 | 4 | 5 | |
| Triad 0.8.0 `a` | 6 | 6.5 | 6 |
| Triad 0.8.0 `b` | 5 | 3 | 4 |

  Opus alone still builds the stronger AI: 22.5 of 32 points against run `a`, 25 of 32 against run `b`. Iterating against its own benchmark did not close the gap for a Sonnet coder, even in the run that tuned for 35 minutes.

**Where this leaves "same output, cheaper":** on everything the checks grade, Triad 0.8.0 matches Opus alone at the same cost or less (about 16% less on the largest graded task). On open-ended quality, Opus alone is still ahead, and the extra tuning spends Sonnet time without catching up. Next steps: give the tuning loop a budget (a fixed number of rounds or minutes) so it cannot run to the cap. Then either accept the AI gap, or let the orchestrator hand that one open-ended piece to an Opus coder.

## Triad 0.9.0: the structured workflow on Tron (`bench/results/wf090`, `wf090o`)

`bench/run_workflow.sh` runs the task through the commands a user would: `/triad:start` (requirements taken from TASK.md and the spec), then `/triad:plan N`, `/triad:build N` and `/triad:review N` for every roadmap phase, headless, with `--auto` and control mode autonomous. Each command is its own `claude -p` session, so state passes through `.planning/` only. Both runs planned the same three phases: rules engine and test hook, playable game, computer player.

| Run | Score | Cost | Time | Opus | Sonnet |
|---|---|---|---|---|---|
| Opus only, run 1 (games1) | 52/52 | $2.19 | | | |
| Opus only, run 2 (v080) | 52/52 | $1.66 | | | |
| Workflow a | 52/52 | about $6.0 (phase 3 build timed out at 40 min; its ~$1.10 is from the transcripts) | 65 min | | |
| Workflow b | 51/52 (lost one game to the straight bot) | $6.71 | 59 min | $2.91 | $3.79 |

Run b by step: start $0.23, plans $1.97, builds $1.96, reviews $2.55. The planning and review layers cost more than the code.

What it produced beyond the code: `.planning/` with PROJECT, ROADMAP and STATE, three phases of wave-ordered plans with verification commands, a SUMMARY per plan, a REVIEW per phase with fixes applied, and one commit per plan (about 25 commits per run). Gap found: the plan and context files are written but never committed (the build commits only code and state). Fixed in 0.9.1: `/triad:build` commits the project files and the phase's plans before it runs any plan.

Gap fixed: the wave executor picked each plan's model from its persona's tier, so the AI plan ran on Sonnet even with the Opus coder in place. Plans now take `model: opus`, `/triad:plan` sets it for open-ended work, and `build_phase` runs those plans on `triad:triad-opus-coder`. `bench/run_rebuild.sh` then rewound both runs to the end of phase 2 and rebuilt phase 3 with the AI plan on Opus (`wf090o`). Both rebuilds ran out the 40-minute command timeout inside the AI plan (the plan's budget was "10 minutes of benchmark runtime", which the coder's own time does not count against); the code on disk scored 52/52 on both. Cost about $2.35 (a) and $4.1 (b), almost all the Opus coder.

Crossplay, every AI against every other on the 8 seeded arenas, both sides (points of 96):

| AI | Points |
|---|---|
| Reference | 65.5 |
| Opus only, run 2 | 60.5 |
| Opus only, run 1 | 53 |
| Workflow a, AI on Opus coder | 51 |
| Workflow b, AI on Opus coder | 51 |
| Workflow a, AI on Sonnet | 47 |
| Workflow b, AI on Sonnet | 8 |

(Raw pairs in `bench/results/wf090o/crossplay.txt`. Pairings vary by a few points between replays: opus1 vs opus2 was 9-7 earlier and 10-6 here.)

Findings:
- The structured workflow matches Opus on the graded checks and leaves a full project record, at about three times the cost on a task this size.
- The Sonnet-built AIs were the weak point (47 and 8). On the Opus coder both rebuilt AIs reached 51, level with Opus-only run 1 and below run 2; both were cut off mid-tuning.
- A budget written in the brief did not hold. Triad now enforces one in code: `coderMinutes` (default 20) sends a coder one wrap-up note once it has worked that long.

### The same workflow with every agent on Opus (`bench/results/wfopus`)

Comparing the workflow with Opus alone in one session is not like for like, since the workflow adds planning and review. So the same run went through `bench/run_workflow.sh` with `OPTS='{"allOpus":true}'`: the same commands, with every agent on Opus.

| Run | Score | Cost | Time |
|---|---|---|---|
| Triad tiers, b | 51/52 | $6.71 | 59 min |
| Triad tiers, a | 52/52 | about $6.0 | 65 min |
| All Opus | 52/52 | about $12.1 (phase 3 build timed out at 40 min; its ~$3.36 is from the transcript) | 72 min |

All Opus by step: start $0.26, plans $3.09, builds about $5.84, reviews $2.94. Most of the saving from the tiers is in the builds, where Sonnet does the coding (about $1.96 against $5.84).

Crossplay with the all-Opus AI added (`bench/results/wfopus/crossplay.txt`, points of 112):

| AI | Points |
|---|---|
| Opus only, run 1 | 74 |
| All-Opus workflow | 73.5 |
| Reference | 72.5 |
| Opus only, run 2 | 65 |
| Workflow a, AI on Sonnet | 54 |
| Workflow a, AI on Opus coder | 51.5 |
| Workflow b, AI on Opus coder | 49.5 |
| Workflow b, AI on Sonnet | 8 |

Findings:
- Triad's tiers run the same process at about half the cost of all Opus, and match it on the graded checks.
- On the open-ended piece (AI strength), all Opus is ahead: level with Opus alone and the reference. The rebuilt Opus-coder AIs sat with the Sonnet ones here. Both were cut off by the command timeout before the time note existed, so they show the cost of an unbounded tuning loop more than the coder's ceiling.

