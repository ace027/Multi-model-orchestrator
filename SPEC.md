# Triad: tiered-model orchestration mod for Claude Code

Replaces Legion. A Claude Code mod (a plugin whose JS hooks run inside Claude Code) that runs software-development work across three model tiers and minimizes total tokens.

Docs to read first (and follow where they differ from this spec):
- https://code.claude.com/docs/en/plugins/mods/overview
- https://code.claude.com/docs/en/plugins/mods/api
- https://code.claude.com/docs/en/plugins/mods/reference
- Generate the TypeScript types for the installed Claude Code version (see "Get the types for your build" in the mods "Create a mod" page) and treat them as the source of truth for event fields and method signatures. Requires Claude Code v2.1.287+.

## 1. Goals

1. **Opus 5.5 orchestrates**: decomposes work, makes architecture decisions, reviews diffs, decides retries. Never reads raw files or long outputs.
2. **Sonnet 5.5 codes**: implements one well-scoped task per agent, in a fresh context.
3. **Haiku 5.5 does menial work**: search/exploration, running tests and summarizing failures, log triage, formatting, docs lookup, turning an approved plan into a task checklist, and **writing boilerplate code** (scaffolding, config files, repetitive CRUD/test stubs, mechanical renames and moves). Anything that needs design judgment goes to Sonnet.
4. **Hierarchy**: Opus spawns Sonnet; Sonnet may spawn Haiku where useful; Haiku never spawns. Max depth 2 below the orchestrator.
5. **Token efficiency is the primary metric** (see section 7).
6. **Haiku prompt ceiling**: no single request to Haiku may have a prompt over 100,000 tokens, because Haiku 5.5 bills a higher rate above that (input $0.10 to $0.50 per million, output $0.50 to $2.50). The limit is per request, not per agent lifetime, so total tokens used over many small requests are fine. Opus and Sonnet have no limits.
7. **Full Legion parity first, then improvement** (see section 10). Nothing in Legion is dropped silently.

Non-goals: custom UI beyond a status command (panes are a later phase); patching Claude Code itself; supporting models other than the three tiers.

## 2. Phase 0: spike (do this first, report before building)

Build a throwaway mod and answer these. The architecture in section 3 depends on the answers.

| # | Question | Why it matters |
|---|----------|----------------|
| 1 | Can a subagent itself spawn a subagent (via the Agent tool or `$.agent.spawn`)? | Decides true tree vs flat fallback |
| 2 | Does `agent.spawn` fire for nested spawns, and does the event identify the parent / depth? | Needed to enforce depth cap and per-tier rules |
| 3 | Does `agent.spawn` returning `{ model }` override an agent definition's own `model`? | Model enforcement |
| 4 | Can a `tool.call` hook post-process a real tool's result (e.g. `const r = await next(e)` then rewrite)? Or is `session.append` the right place? | Haiku result compression |
| 5 | Is token usage observable per agent (not just per session)? | Budgets and the ledger |
| 6 | Does `agent.offer` know who is asking (which agent/tier)? | Per-tier agent menus |
| 7 | Can a hook validate or reshape a subagent's final return? | Enforcing the return schema |
| 8 | Can a mod see the prompt size of each Haiku request before it's sent (e.g. in `turn.step`), message that subagent mid-run (`$.session.send` to an `agentId`), and stop it or compact it? | Enforcing the Haiku prompt ceiling |
| 9 | Do cache read and cache write tokens count toward Haiku's 100k pricing line? The pricing docs don't say. Run the test in Appendix A | Setting the real limit; until measured, assume they count |

Deliverable: a short `SPIKE.md` with each answer, how it was verified, and the chosen mode below. **Result: Mode B** (see `SPIKE.md`).

**Mode A (true tree)**: if 1, 2 and 6 are yes. Sonnet agents get the Agent tool and spawn Haiku helpers directly.
**Mode B (routed flat)**: otherwise. Only Opus spawns agents. Sonnet agents get a registered tool `delegate_menial` (via `$.tool.register`) whose handler calls `$.model.complete({ model: 'haiku', ... })` for one-shot jobs, or `$.agent.spawn` for helpers that need tools. The mod, not the model, enforces the tiers.

## 3. Architecture

Plugin name: `triad`. Layout:

```
triad/
├── .claude-plugin/plugin.json
├── agents/            # coder.md (sonnet), helper.md (haiku) if static definitions suffice
├── hooks/
│   ├── hooks.json
│   └── register.js    # entry point; keep logic in imported modules if allowed
├── types/index.d.ts   # only if using $.state or adding a namespace
├── CLAUDE.md          # shared stable prefix (see caching)
└── *.test.ts          # claude plugin test
```

### Agent types
- `triad-coder` (model: sonnet): implements one task. Tools: file read/edit/write, shell. Gets the Agent tool only in Mode A, and only for `triad-helper`.
- `triad-helper` (model: haiku): read, grep/glob, shell for tests, and write/edit limited to the paths named in the brief (enforced by a `tool.call` hook), so it can write boilerplate. No Agent tool. Roles chosen by the brief: explore, test-run, log-triage, boilerplate, format, docs-lookup, checklist. Haiku-written code is reviewed as a diff by the parent (Sonnet) before it's accepted; Haiku never makes design decisions, and escalates with `blocked` when the task needs one. Prompt ceiling: 100k per request (section 4).
- Orchestrator is the main session on Opus (set via settings `model` or `--model`). It is offered only `triad-coder` and `triad-helper` (for trivial things it shouldn't pay a Sonnet for).

### Hooks
- `agent.offer`: withhold agent types per tier (Haiku sees none; Sonnet sees only `triad-helper`; Opus sees both). Hide built-in general-purpose types that would bypass the tiers.
- `agent.spawn`: (a) force the model for the type (`{ model }`), (b) `{ deny }` when depth > 2 or when the concurrency cap is hit (default 4 coders, 6 helpers), with a reason the parent can act on. Opus and Sonnet are never denied or stopped on token grounds.
- Result compression (via `tool.call` post-processing or `session.append`, per spike #4): when a Bash/Read/Grep result exceeds a threshold (default ~4k tokens), write the full output to `.triad/out/<id>.txt`, run it through `$.model.complete` on Haiku with a task-aware summary prompt, and return the summary plus the file path so an agent can grep the original. Never compress edit/write results. Always keep error lines verbatim.
- `tool.describe` / `prompt.section`: defer rarely-used tool descriptions (`isDeferred: true`) and drop system prompt sections the tiers don't need. Measure before and after; revert anything that hurts task success.
- `session.measure`: update the ledger (section 7).
- `command.run`: `/triad` prints the current tree, per-tier tokens/cost, budgets remaining, and compression savings.

### Return schema (every Sonnet/Haiku agent returns this and nothing else)
```
status: done | blocked | partial
summary: <=5 lines
changes: [{ path, kind, one-line note }]   # diffs live on disk/git, not in the reply
verify: { command, result }                 # what was run to check it
blocked_reason: <only if blocked>
```
No transcripts, no pasted file contents. If a hook can validate returns (spike #7), reject non-conforming replies once; otherwise enforce through the agent prompts.

### Briefs (orchestrator to coder)
File paths, acceptance criteria, constraints, and the verify command. No pasted code. One task per agent; independent tasks run in parallel.

### Escalation
A worker returns `blocked` with a reason instead of retrying in a loop. The parent chooses: rebrief with more context, split the task, or take it over. Cap automatic retries at 1 per task.

### Caching
Keep the shared prefix (CLAUDE.md, conventions, tool list) byte-stable across all agents and turns: no timestamps, no per-agent ordering churn, no dynamic content before the cache breakpoint. Put anything per-task at the end of the brief.

## 4. Policy defaults (user-configurable via `userConfig`)

| Setting | Default |
|---|---|
| Max depth below orchestrator | 2 |
| Max concurrent coders / helpers | 4 / 6 |
| Opus and Sonnet token cap | None |
| Haiku prompt ceiling per request (the pricing line) | 100,000; "over 100,000" is the higher tier, so exactly 100,000 is still standard |
| Haiku enforced ceiling | 95k (margin for token-count error) |
| Haiku act-at threshold | 80k (wrap up or compact) |
| Haiku chunk size for oversized one-shot inputs | 60k |
| Compression threshold | ~4k tokens |
| Max auto retries per task | 1 |

### Haiku prompt ceiling rules

Every turn of an agent resends its whole conversation, so a Haiku agent's prompt grows with each step. The mod keeps every Haiku request under the line:

- **Pre-flight:** at spawn, if the brief plus any attached material would start above ~40k, the task goes to Sonnet or is split into smaller Haiku jobs instead.
- **In flight:** at 80k the agent is told to finish. If the next request's projected prompt would pass 95k, the mod stops the agent and it returns `partial` (what's done, what's left); the parent respawns a fresh Haiku on the remainder. Compaction is used instead only if the spike shows it works on subagents.
- **Prefer many short Haiku agents over one long one:** the parent splits work so each Haiku job is narrow.
- **One-shot calls** (`$.model.complete` for compression and summaries): inputs over 60k are chunked and merged map-reduce style. Never `$.model.fork` to Haiku when the conversation is near the ceiling, since fork carries the whole conversation.
- **Model rerouting:** a `turn.step` hook never moves a request to Haiku if its prompt is above the act-at threshold. It stays on its current model.
- **Counting:** count every input token sent in the request, including cache reads and writes; spike item 9 measured that both count toward the line. Output tokens are not limited.
- Opus and Sonnet are never limited or stopped on token grounds.

## 5. Phases

1. **Spike + Legion audit** (section 2 and 10). Clone `9thLevelSoftware/legion` and produce `PARITY.md`, a checklist of every command, skill, agent, hook, config key, schema and test, each marked Ported, Improved, Replaced, or Not applicable with a reason. Gate: `SPIKE.md` and `PARITY.md` reviewed by the user.
2. **Core**: agent types, `agent.offer`, `agent.spawn` enforcement, return schema, `/triad` status. Acceptance: a multi-file feature runs end to end with correct models at each tier, verified from the ledger.
3. **Compression + trimming**: result compression, deferred tool descriptions, prompt trimming. Acceptance: measurable token reduction on the benchmark with no drop in task success.
4. **Haiku prompt ceiling + escalation**: pre-flight, 80k wrap-up, 95k stop with `partial`, chunked one-shots, `blocked` handling, retry cap. Acceptance: with an oversized job, no Haiku request is ever sent above 100,000 tokens (verified against billed usage), and the agent returns a usable `partial`.
5. **Legion core workflow port**: `.planning/` layout and schemas, start, plan (with critique and auto-refine), build (wave executor), review (classic and panel), status, quick, validate, authority enforcement, control modes. Acceptance: an existing Legion project loads and completes a phase in Triad with no migration.
6. **Legion extended port**: map, explore, advise, board, retro, ship, learn and memory, polish, portfolio, milestone, agent creator, spec pipeline, github-sync, domain workflows (marketing, design), hooks. Acceptance: every `PARITY.md` row is Ported, Improved, Replaced, or Not applicable.
7. **Polish**: optional pane showing the tree and spend; docs; Legion removal (section 6).

## 6. Legion replacement

Do not delete Legion until Triad matches it on the benchmark. Then disable Legion where it's installed (`/plugin` or its own setup), confirm nothing else depends on it, and remove it. Port over any Legion behaviors the user still wants (ask which) as agents or commands.

## 7. Measuring token efficiency

- Ledger in `$.store`: per session and per tier, input/output/cached tokens and cost, plus compression savings (raw tokens in, summary tokens out).
- Benchmark: 5 to 8 representative tasks from real repos (bug fix, small feature, refactor, test-writing, multi-file change). Record success (tests pass, diff reviewed) and total tokens/cost for: (a) Opus only, (b) Legion, (c) Triad. Re-run after each phase.
- Report cache hit rate; a falling hit rate usually means the prefix is not stable.

## 8. Risks and constraints

- Mods run unsandboxed with the user's permissions. Keep file and process access narrow (`.triad/`, the repo, test commands); run `claude plugin validate` and review the `hooks:` / `calls:` output before shipping.
- A hook gets 10 seconds of its own running time (time inside `next` and API calls doesn't count). Compression and summarization must be async calls, not hook CPU.
- Haiku summaries are lossy. Always keep the raw output on disk and in the pointer; keep errors verbatim.
- A mod can approve tool calls without asking; Triad must never use `tool.check` to loosen permissions.
- Docs and types may change between Claude Code versions. Pin the minimum version and re-check on upgrade.
- Test with `claude plugin test` (stub `$.model.complete`, `$.agent.spawn`, `$.session.usage`) and manually with `claude --plugin-dir ./triad`.

## 9. Open questions for the user

- The pricing docs don't say whether cache read and write tokens count toward Haiku's 100k line. Answered by the spike: they do, both reads and writes (see `SPIKE.md`).
- Resolved at the Phase 0 gate: Legion's runtime adapters and installer don't apply to a Claude Code mod (Not applicable), and cross-CLI dispatch (Gemini, Codex, Copilot) is dropped. The other decisions are recorded in `PARITY.md` section 14.

## 10. Legion parity and improvements

Source: github.com/9thLevelSoftware/legion. This inventory comes from its README only; the last part of the README and the repo's actual files were not read, so Phase 0 must clone the repo and audit it directly. Every item ends up Ported, Improved, Replaced, or Not applicable.

Principles:
- **Same `.planning/` layout, file names, YAML frontmatter and JSON schemas**, so existing Legion projects load with zero migration. Schemas are validated in code.
- **Deterministic work moves into mod code** (zero tokens). Models are used only where judgment is needed, tiered by how much judgment.
- **Rules Legion enforces by prompt become rules the mod enforces by hook.**
- Judgment workflows ship as plugin commands (`/triad:plan`, ...). Deterministic ones are mod commands (names: letters, digits, `_`, `-`).

### Commands

| Legion | Triad |
|---|---|
| `start` (+ from a design doc) | Opus runs the 5-8 exchange questioning flow; Haiku writes PROJECT/ROADMAP/STATE from Opus's structured notes |
| `plan <N>` (+ `--auto-refine`, max 2 cycles) | Opus decomposes into wave-structured plans; Haiku formats plan files. Critique checks that are mechanical (missing verification commands, overlapping files in a wave) run in code. Judgment pass (pre-mortem, PASS/CAUTION/REWORK) by Sonnet. Optional architecture proposals (Minimal, Clean, Pragmatic) and 5-stage spec pipeline |
| `build` (+ `--phase N`) | Wave executor in mod code: same-wave plans in parallel, waves sequential, `sequential_files`, opt-in worktrees with merge-conflict detection, one Sonnet per plan, atomic commit per plan, task `<verify>` blocks run by Haiku |
| `review` | Sonnet reviewers, classic and panel modes (2-4 reviewers, max 2 per division, at least 1 Testing), 3-5 rubric criteria each. Severities use the review-finding schema's own enum (`blocker`, `critical`, `major`, `minor`, `advisory`), file:line plus what/why/fix, 80% confidence filter, anti-sycophancy rules, max 3 cycles with scoped re-review, then escalate with fix history. Dedup and hot-spot detection (files flagged by 2+ reviewers) in code |
| `status` | Pure code, no model |
| `quick [--fix]` | One Sonnet; Haiku for boilerplate; optional commit, inline review and PR |
| `advise` | Read-only Sonnet advisor |
| `portfolio`, `milestone` | Code, with Haiku summaries; archive and optional GitHub milestone sync |
| `agent` (creator) | Sonnet 3-stage workflow; the 8 schema checks run in code |
| `map` (+ `--check`, `--refresh`, `--scope`, `--query`) | Code builds the `rg`-based index (CODEBASE.md, index.jsonl, symbols.json, search.md); Haiku writes summaries; no embeddings |
| `explore` | Opus with the Polymath persona; Haiku fans out research; saves to `.planning/explorations/` |
| `board` (`meet`, `review`) | Opus convenes; members are Sonnet agents in parallel; votes and artifacts persisted |
| `retro` | Haiku gathers metrics, Sonnet writes RETRO.md |
| `ship` | Pre-ship checks and PR creation via `gh`, deployment verification, canary monitor on `$.clock.every`, security gate hook |
| `learn` (+ `--prune`) | Memory manager in code: outcomes, preference capture, four-bracket decay weighting (1.0 down to 0.1), archive-not-delete pruning |
| `polish` | 4-pass cleanup. Haiku runs the mechanical passes, Sonnet the judgment passes. Non-blocking, reverts any file whose tests regress, capped at 50 files, scope `changed`/`dependents`/`directory` |
| `validate` (+ `--ci`, `--fix`) | Pure code against `docs/schemas/`, no model |
| `update` | Replaced by plugin update |

### Agents (49 personalities, nine divisions) and skills

- Port every persona as a compact file with a `tier:` field (`opus`, `sonnet`, `haiku`) that `agent.spawn` uses to set the model. Default Sonnet. Studio Producer is Opus, as in Legion. `agents-orchestrator` is Opus too, distilled into the orchestrator's own guidance rather than spawned. Haiku is used for `testing-test-results-analyzer` and `support-executive-summary-generator`, with Sonnet reviewing their output.
- Legion injects the entire persona file into every spawned agent. Triad injects a distilled core (expertise, style, hard rules) and loads the full file only on request.
- Agent registry scoring (keyword 3, division affinity 2, partial match 1, plus memory boost) runs in code.
- All 33 skills port 1:1, except the Codex bridge skill and `cli-dispatch` (Not applicable; see `PARITY.md`). Named here: (core contract, questioning flow, registry, portfolio manager, codebase mapper, phase decomposer, memory manager, marketing and design workflows, spec pipeline, plan critique, github-sync, wave executor, execution tracker, review loop and panel, milestone tracker, agent creator, polymath engine, authority enforcer, code polish, hooks integration). The always-loaded core stays lean and the rest load conditionally, using `tool.describe` with `isDeferred`.

### Enforcement, hooks, modes

- Authority enforcement (`files_forbidden`, `files_modified`) becomes a live `tool.call` check instead of an after-the-fact diff. Guarded warns, surgical blocks and reverts, advisory logs.
- Legion's three opt-in hooks (pre-build plan validation, post-build notification, pre-ship security gate) become always-on mod hooks.
- Control modes `autonomous`, `guarded` (default), `advisory`, `surgical` keep their config files (`control-modes.yaml`, `escalation-protocol.yaml`, `agent-communication.yaml`). `autonomous` skips confirmation gates and turns authority checks into warnings (logged, never blocked). It never approves tool calls or loosens permissions. New projects default `execution.commit_prefix` to `triad`; existing values are kept. The portfolio registry stays at `~/.claude/legion/portfolio.md`. No `/legion:*` aliases.
- Structured escalation blocks, anti-rationalization rules, and BLOCKER/ENVIRONMENT error classification with one retry all carry over.
- Manual-edit detection (diffs of agent-modified files stored as corrective preferences) carries over.

### Not ported, or ported differently

- Runtime adapters and installer for 11 other tools: Not applicable (see section 9).
- Cross-CLI dispatch (Gemini, Codex, Copilot): dropped at the Phase 0 gate. Existing `.planning/dispatch/` files are left untouched.
- Tests and CI: port schema conformance, cross-reference validation and `lint-commands` as `claude plugin test` suites and a CI workflow. `checksums.sha256` is replaced by the plugin marketplace's own integrity checks.

### Improvements beyond parity (proposals)

1. Exact token accounting per agent and per plan, written into SUMMARY.md, replacing Legion's estimated prompt budget.
2. Result compression and prompt trimming (sections 3 and 7).
3. Scope, schema, and critique rules enforced in code rather than by prompt.
4. Resumable builds: wave and plan state persisted so an interrupted build continues where it stopped.
5. Per-persona and per-task model tiering instead of Sonnet for everything.
6. A parity regression suite: for each Legion command, a fixture project whose `.planning/` artifacts Triad must reproduce, and a benchmark against Legion on the same tasks (section 7).

## Appendix A: does Haiku's 100k pricing line count cached tokens?

The pricing, prompt-caching and context-window docs all say Haiku 5.5 charges more for prompts over 100,000 tokens, and none says whether cache reads or cache writes count toward that length. They advise testing with real requests and comparing billing against the `usage` fields. This test settles it for spike item 9. Total cost is under about $4.

Setup: a dedicated API key and workspace (so the Console cost view isolates these requests), model `claude-haiku-5-5`, `max_tokens: 1`. Size every prompt with the token counting endpoint and record the `usage` object from each response (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`). Run requests back to back so the cache stays warm (5-minute lifetime).

| Run | Requests | Prompt shape | Per-request cost if cached tokens count | If they don't |
|---|---|---|---|---|
| A (the test) | 100 | ~95k cache read + ~10k fresh = ~105k total | ~$0.0098 | ~$0.0020 |
| B (control, clearly standard) | 100 | ~40k cache read + ~10k fresh = ~50k total | ~$0.0014 | ~$0.0014 |
| C (control, clearly higher tier) | 10 | ~110k fresh, no cache | ~$0.055 | ~$0.055 |
| D (cache writes) | 20, each with a unique prefix | ~95k cache write + ~10k fresh | ~$0.064 | ~$0.013 |

Costs come from the published rates (input $0.10 or $0.50, cache hit $0.01 or $0.05, 5-minute cache write $0.125 or $0.625, all per million tokens, standard or higher tier), ignoring the 1 output token. In A, the first request writes the cache and costs more; drop it or subtract it.

Read the result from the Console's cost for each run's time window, divided by its request count:
- B and C confirm the two rates are visible in billing at all.
- A near $0.0098 means cache reads count toward the line. Near $0.0020 means they don't.
- D near $0.064 means cache writes count. Near $0.013 means they don't.

Record the outcome in `SPIKE.md`. If cached tokens don't count, change the Haiku ceiling rules in section 4 to count only the tokens that do.
