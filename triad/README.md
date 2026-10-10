# triad

Triad is a Claude Code plugin that splits development work across three model tiers to spend fewer tokens:

- **Orchestrator (Opus):** the main session. It decomposes the work, makes design decisions, reviews diffs and decides retries.
- **Coders (Sonnet):** `triad:triad-coder` agents. Each implements one well-scoped task in a fresh context.
- **Opus coders:** `triad:triad-opus-coder` agents, for open-ended pieces (a game AI, an architecture, tuning, visual polish). They share the coder cap and report format.
- **Helpers (Haiku):** `triad:triad-helper` agents. They do menial work: search, running tests and summarizing failures, log triage, formatting, docs lookup and boilerplate. They make no design decisions.

The orchestrator spawns coders and helpers directly; a Haiku job needs no Sonnet agent in between. Coders reach Haiku through the `delegate_menial` tool. Helpers never spawn. The plugin's hooks enforce all of this; they don't just ask the model to follow it.

It also carries a port of the Legion workflow (plan, build, review, ship, and the rest), working on Legion's `.planning/` layout as is.

## Install

Requires Claude Code 2.1.287 or later.

From the marketplace in this repository:

```
/plugin install triad --marketplace ace027/Multi-model-orchestrator
```

Or from a checkout:

```
claude --model opus --plugin-dir ./triad
```

Run the main session on Opus: the orchestrator is the main loop, and the hooks set the coders' and helpers' models themselves.

## Use

Work as usual. The orchestrator hands implementation tasks to coders and menial jobs to helpers when that is cheaper than doing them itself; on small tasks it often does the work alone.

To watch what it spends:

- `/triad` prints the agent tree (each agent's tier, status, requests, tokens and cost), the totals per tier, and the budgets.
- `/triad pane` opens the same as a live pane that redraws as agents run. Set `openPane` to open it at the start of every session.
- `.triad/ledger.json` in the project holds the full ledger. The `.triad/` folder has its own `.gitignore`.

For a structured project, use the Legion workflow:

| Command | Does |
|---|---|
| `/triad:explore`, `/triad:start` | Research an idea; start a project (`PROJECT.md`, `ROADMAP.md`, `STATE.md` in `.planning/`). |
| `/triad:spec`, `/triad:plan` | Spec a phase; decompose it into wave-ordered plans with a critique. |
| `/triad:build`, `/triad:review`, `/triad:ship` | Execute the plans, review the result and fix findings, ship it behind six gates. |
| `/triad:auto` | The whole project hands-off: start if needed, then plan, build and review each phase with no questions. Run it again to resume. `--estimate` plans every phase and shows the expected cost per phase without building; the rates scale to what your own past steps cost. Pair it with `maxProjectSpend`. Sends a push notification when it finishes or stops (option `notify`). |
| `/triad:quick` | One small task outside the plan. |
| `/triad status`, `/triad validate` | Where the project is and what to run next; schema checks. No model calls. |

[`../docs/commands.md`](../docs/commands.md) lists all 21 commands with their arguments. [`../docs/control-modes.md`](../docs/control-modes.md) explains how much freedom agents get during a build.

### Legion projects

Triad reads and writes Legion's `.planning/` layout without migration: `PROJECT.md`, `ROADMAP.md`, `STATE.md`, `phases/NN-slug/` with its `CONTEXT`, `PLAN`, `SUMMARY` and `REVIEW` files, and Legion's root `settings.json`. Older forms (both STATE field styles, legacy plan frontmatter, `<verify><automated>` task checks) are read as they are. Existing projects keep their `commit_prefix`; new ones get `triad`. `PARITY.md` at the repository root maps every Legion feature to its Triad equivalent. The Legion material Triad derives from, and its MIT notice, are in `LEGION-NOTICE.md`.

## Options

Set them in `/plugin` settings, or for a headless run with `--settings '{"pluginConfigs":{"triad@inline":{"options":{...}}}}'`.

| Option | Default | Does |
|---|---|---|
| `maxDepth` | 2 | Spawns deeper than this below the orchestrator are refused. |
| `maxCoders` | 4 | Coders running at once. |
| `maxHelpers` | 6 | Helpers running at once. |
| `maxRetries` | 1 | Times a reply that breaks the return schema is sent back before it is passed through. |
| `strictMenu` | true | Offer and allow only Triad agent types; other types would bypass the tiers. |
| `compress` | true | Save long Bash and Grep output (and log-like files read) to `.triad/out/` and give the agent its error lines plus a Haiku summary. |
| `compressThreshold` | 4000 | Output longer than this many tokens is compressed. |
| `deferTools` | true | Load only the tools the tiers use every turn; the rest stay reachable through ToolSearch. |
| `haikuCeiling` | 95000 | A helper whose next request is projected above this many tokens is stopped and returns `partial`. Keep it under 100,000, where Haiku's higher rate starts. |
| `haikuWrapAt` | 80000 | At this prompt size a helper is told to finish. |
| `coderMinutes` | 20 | After this long a coder is told to stop tuning, check its work and report (0: off). |
| `allOpus` | false | Comparison baseline: every agent runs on Opus (and the Haiku ceiling is off). |
| `maxSpend` | 0 | Spending budget per session, in USD (0: none). At 80% a notice; at the limit running agents are told to wrap up, and new agents and workflow steps are refused until it is raised. |
| `maxProjectSpend` | 0 | The same budget across every session on the project, in USD (0: none). Each session's spend is kept in `.planning/SPEND.json`, written as each workflow step starts and committed with it, so a resumed `/triad:auto` or a fresh clone still counts it (all but the last few turns of each session). |
| `lightPlans` | 2 | A phase with at most this many plans runs the light process: planning skips the board, spec, proposals, persona table and security and design passes, and review uses two reviewers for at most two cycles. 0: always the full process. |
| `fixMinor` | true | After a review passes, one coder round fixes its minor and medium-confidence findings; the checks run again and the round is undone if one fails. |
| `notify` | true | When `/triad:auto` finishes or stops, send one push notification line: how far it got, why it stopped, the spend. Needs push notifications on in Claude Code. |
| `openPane` | false | Open the Triad pane at session start. A pane opened this way seats from 144 terminal columns; `/triad pane` opens it at any width. |

A helper brief over 40k tokens is refused at spawn: give the job to a coder, or split it.

## How it works

| Hook | Does |
|---|---|
| `session.start` | Registers `delegate_menial` and `/triad`, loads this session's ledger from `$.store`; with `openPane`, opens the Triad pane. |
| `prompt.section` `communication` | Adds the orchestrator guidance (byte-stable, for caching) to the main loop only; a `prompt.context` block would also reach every subagent. |
| `tool.describe` | With `deferTools`, defers engine tools the tiers do not use every turn (in a clean environment: ListAgents, ReportFindings, ScheduleWakeup, Workflow); they stay reachable through ToolSearch. |
| `agent.offer` | Offers only `triad:triad-coder`, `triad:triad-opus-coder` and `triad:triad-helper` (with `strictMenu`). |
| `agent.spawn` | Forces the tier's model (coder Sonnet, helper Haiku) and `background: false`; refuses other agent types, spawns deeper than `maxDepth`, and spawns over the concurrency caps. Records the tree. |
| `tool.call` `Agent` | Checks the reply against the return schema and sends a non-conforming reply back once (`maxRetries`), naming the agent id for SendMessage. |
| `tool.call` `delegate_menial` | Coders only. Pre-flight size check (40k tokens), spawns a Haiku helper with the files it may write, waits for its answer in a child process (the hook budget does not count that wait), checks the schema, asks once for a resend. |
| `tool.call` `Bash`/`Grep`/`Read` | With `compress`, output over `compressThreshold` tokens (Read: log-like files only) is saved to `.triad/out/` and replaced by its error lines, verbatim, plus a Haiku summary (chunked at 60k tokens, merged). A failed Bash call keeps its failure. A helper whose next request would pass its ceiling gets a pointer to the saved output instead of the output. |
| `turn.step` (helpers) | Haiku ceiling. Before each helper request, projects its prompt: the previous request's exact size plus the conversation's growth at 2.5 chars a token (errs high), plus a margin. At `haikuWrapAt` (80k) the helper is told to finish; when the projection passes `haikuCeiling` (95k) the hook answers the step itself with a `status: partial` reply (done and left, from a Haiku one-shot over the transcript's tail, plus the files it wrote), so the request is never sent. Coders and the orchestrator are never stopped; a coder that has worked `coderMinutes` gets one note to wrap up and report. |
| `tool.call` `Edit`/`Write`/... | A helper may write only the files its brief names (`Writable files:` line, or the paths in the brief). |
| `tool.check` `Bash` | While a runner job is running (long verification commands run detached under `.triad/run/`), its wait script is allowed without asking; a runner agent may run nothing else. |
| `turn.step`, `turn.complete`, `session.measure` | Feed the ledger: per request usage by agent and tier, priced per tier, including Haiku's over-100k rate (cache reads and writes count toward the line). |
| `command.run` `/triad` | Prints the tree, tokens and cost per tier, and budgets. `/triad pane` opens the same as a live pane. |
| `ui.render` `Pane` `triad` | The Triad pane: the agent tree (role, tier, status, requests, tokens, cost per agent), spend per tier and in total, the session's measured cost once known, and running coders and helpers against their caps. It redraws on every spawn, request and finished turn, from a view the hooks keep in `$.state`. Under 60 columns each row shows cost only. |

The ledger prices every request per tier, including Haiku's rate above 100k prompt tokens (cache reads and writes count toward that line), and the main loop's 1-hour cache writes. It counts the plugin's own Haiku one-shots under `compressor`; the CLI's cost report leaves those out. It is kept in `$.store` (`ledger:<session id>`) and in `.triad/ledger.json`.

[`../docs/results.md`](../docs/results.md) has the measurements from each build phase: the ledger against the CLI's billing, the token savings from compression and deferral, the Haiku ceiling, and the Legion workflow runs.

## Development

`claude plugin test triad` runs the test suites; [`../CONTRIBUTING.md`](../CONTRIBUTING.md) has the other checks and the conventions. The test kit drops `agentId` from a plugin's own `$.agent.spawn`, so the `delegate_menial` round trip is covered by the live run in `bench/run_accept.sh` instead.

Version 0.13.3.
