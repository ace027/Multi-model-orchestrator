# Commands

Every Triad command, what it does, and its arguments. Each `/triad:*` command is a plugin command: the orchestrator follows it, and the deterministic steps (parsing, scoring, checks, file layout, git) run in mod code behind a deferred `mcp__triad__*` tool. Those tools cost no prompt tokens until a command loads them, and they run in the main loop only.

A typical project runs `/triad:start`, then for each phase `/triad:plan`, `/triad:build`, `/triad:review` and `/triad:ship`. `/triad status` says where a project is and what to run next.

## Start and plan a project

### /triad:explore

`/triad:explore [idea]`

Research and clarify a product idea, then save a design document that can seed /triad:start.

Context first, Haiku research fan-out, one decision per question, Polymath (Opus) synthesis of 2-3 approaches, design doc in `.planning/explorations/` that `/triad:start <path>` reads.

### /triad:start

`/triad:start [one-line project idea | path to an exploration design doc]`

Start a Legion-format project: questioning flow, then PROJECT.md, ROADMAP.md and STATE.md in .planning/.

Questioning flow, then `project_init` writes PROJECT/ROADMAP/STATE from Legion's templates.

### /triad:map

`/triad:map [--check] [--refresh] [--scope <dir>] [--query <terms>]`

Map the codebase into .planning/CODEBASE.md and a retrieval index, or search an existing map.

Codebase map and `rg` index in code (`.planning/CODEBASE.md`, `.planning/codebase/`); Haiku writes the narrative sections; freshness check and query in code.

### /triad:spec

`/triad:spec [phase number]`

Pre-coding spec pipeline for a phase — gather, research, write, critique, assess — saved to .planning/specs/.

Gather, trigger, completeness and open-question check (PASS/CAUTION/REWORK, Blocking questions halt planning), path validation against `directory-mappings.yaml` and the complexity rating in code; research, writing and critique by personas. `.planning/specs/NN-slug-spec.md`.

### /triad:plan

`/triad:plan [phase number] [--dry-run] [--auto] [--auto-refine] [--skip-board] [--skip-security] [--security] [--spec] [--domain=design|marketing]`

Plan a phase of a Legion-format project: decompose into wave-ordered plans, write them, critique and auto-refine.

Opus decomposes the phase into wave-ordered plans (personas picked with `persona_brief`), `plan_write` writes schema-valid plans and runs the mechanical critique, Opus adds the judgment critique, up to 2 auto-refine rounds (`only`).

Flags: `--dry-run`, `--auto` (board quick-assess, spec, proposals, critique, design 7-pass review, security scan; BLOCKER halts), `--auto-refine`, `--skip-board`, `--skip-security`, `--security`, `--spec`, `--domain=`; GitHub phase issue sync.

## Build, review and ship

### /triad:build

`/triad:build [phase number] [--wave N] [--rerun] [--dry-run] [--just-harden | --just-document | --skip-frontend | --skip-backend] [--two-wave | --single-wave] [--skip-gates] [--auto]`

Execute a planned phase with the wave executor (one agent per plan, verification in code, a commit per plan); intent flags, two-wave mode and dry runs.

Wave executor in mod code: one agent per plan at its persona's tier (haiku personas on triad-helper, opus personas with the opus model), plans of a wave in parallel unless they share files, verification commands run by the mod, one follow-up fix on a failed check, a SUMMARY.md per plan (failures too), STATE/ROADMAP after every plan and wave, Legion's commit messages. Resumes from the first plan without a successful summary.

Flags: intent flags validated in code (`--just-harden` ad-hoc team, `--just-document`, `--skip-frontend`, `--skip-backend` plan filters), natural-language routing, `--dry-run`, two-wave mode (Wave A build + analysis, architecture gate, Wave B execution + remediation, production verdict, manifests).

### /triad:review

`/triad:review [phase number] [--panel | --classic] [--security | --just-security] [--dry-run] [--auto]`

Review a built phase: reviewer panel or classic, findings triaged in code, fixes routed to agents, up to 3 cycles.

Panel (2-4 reviewers by divisions touched, always one Testing) or classic; reports parsed and triaged in code (confidence ≥80 actioned, 50-79 deferred, <50 dropped; dedup by file and overlapping lines); must-fix findings (blocker/critical/major) routed to fix agents by file; re-review of changed files; stale-loop abort; up to `review.max_cycles`; NN-REVIEW.md, STATE, ROADMAP `[x]`.

Flags: `--security` / `--just-security` (scan in code, OWASP/STRIDE by the security persona, unresolved CRITICAL/HIGH block ship), `--dry-run`, domain reviews.

### /triad:quick

`/triad:quick [--fix] <task description | #issue> [--auto]`

Run one small ad-hoc task with a single coder, outside the phase plan, optionally committed and reviewed.

One coder on a small ad-hoc task, optional commit and review. `--fix` is fix mode: a `#N` names a GitHub issue (read with `gh`); the fix is committed, reviewed once, and pushed on a `fix/` branch as a pull request; STATE.md and ROADMAP.md are not touched.

### /triad:polish

`/triad:polish [path | glob | --phase N] [--scope=changed|dependents|directory] [--dry-run] [--preview] [--save] [--auto]`

Behavior-preserving code polish: comments, simplification, readability, consistency, with a test and type-check safety net.

Scope (cap 50 files), test and type-check baseline, four passes, per-file revert on a regression, in code around the agents.

### /triad:ship

`/triad:ship [--phase N] [--dry-run] [--preview] [--canary] [--auto]`

Ship a reviewed phase: 6 pre-ship gates in code, ship report, PR or push, post-ship verification, optional canary.

Six pre-ship gates and the ship report in code; PR, push or mark via `git`/`gh`; canary on the mod clock (never auto-rollback).

## Decide and advise

### /triad:board

`/triad:board meet <topic> | review [--phase N]`

Board of directors — full deliberation and a binding vote on a proposal, or a quick assessment of the current phase.

Slate by registry score (max 2 per division); independent assessments, discussion rounds, a binding APPROVE/REJECT vote with one re-vote then ABSTAIN; the resolution formula (≥2/3 approved, majority with conditions, even tie escalated to the user) in code; `.planning/board/{date}-{slug}/` artifacts, a memory record and a commit. `review` is the assessment phase only.

### /triad:advise

`/triad:advise <topic> (e.g. architecture, UX, marketing, testing)`

Read-only expert consultation from one persona on a topic, with follow-ups and an optional memory record.

Persona picked by registry scoring; one read-only advisor; follow-ups; optional memory record.

## Domain workflows

### /triad:design

`/triad:design [system | research | review | audit] [name]`

Design workflow — design brief, aesthetic consultation, design system and UX research documents in .planning/designs/, three-lens design review and the post-build design audit.

Domain detection (MKT-/DSN- ids, `workflow_type`, `--domain`; keywords only hint), teams, wave patterns, document scaffolds (`.planning/designs/`, `.planning/campaigns/`), lifecycle status, completion checks and design grades in code; brief, consultation, documents and the three-lens / marketing reviews by personas.

### /triad:marketing

`/triad:marketing [campaign | review | status <state> | report] [name]`

Marketing workflow — campaign brief, campaign document with channel strategy and content calendar in .planning/campaigns/, cross-channel consistency and the marketing quality review.

Shares the domain machinery with `/triad:design` (above).

## Memory and tracking

### /triad:learn

`/triad:learn <lesson> | --recall <topic> | --list | --prune`

Record, recall, list or prune project learnings (.planning/memory/).

Memory lives in `.planning/memory/` with four-bracket decay: old entries are archived, never deleted. `/triad:plan` recalls it on the phase's topics, and `/triad:advise` can record a takeaway.

### /triad:retro

`/triad:retro [--phase N] [--milestone M] [--dry-run] [--preview] [--portfolio]`

Structured retrospective on a completed phase or milestone, saved to project memory.

Metrics in code; the retrospective is written by a persona and saved to project memory.

### /triad:milestone

`/triad:milestone`

Milestone dashboard, definition, completion summary and archiving.

Milestone status, completion and archiving, in code.

### /triad:portfolio

`/triad:portfolio [register | unregister [name]]`

Cross-project portfolio dashboard, dependencies, agent allocation and Studio Producer analysis.

The registry is `~/.claude/legion/portfolio.md`, shared with Legion; dependencies and allocation are computed in code.

## Personas

### /triad:agent

`/triad:agent [one-line description of the specialist]`

Create a custom persona for this project, validated and added to the roster.

Guided persona creation; the 8 validation checks run in code.

### /triad:roster

`/triad:roster gaps [--category=<cat>] [--validate-intents] [--output=<path>] | limit`

Roster gap analysis — production-role coverage, severity, intent teams and the agent limit.

`gaps` (the default) writes a report of uncovered production roles by severity, with the numbers computed in code and the impact prose added by the orchestrator; `limit` shows the roster against the agent limit.

## Mod subcommands

These run in mod code with no model call, so they cost nothing.

| Command | Does |
|---|---|
| `/triad` | Prints the agent tree, tokens and cost per tier, and the budgets. |
| `/triad pane` | Opens the same as a live pane that redraws as agents run. |
| `/triad status [--dry-run]` | Dashboard for a `.planning/` project: phase, progress, the next command to run, and the control mode. `--dry-run` prints the checks and planned actions as a dry-run report instead. |
| `/triad validate [--ci] [--fix]` | Schema and consistency checks of `.planning/`: plan frontmatter, STATE and ROADMAP agreement, persona names, settings and the authority matrix. Exit code 0 (pass), 1 (warnings) or 2 (failures); `--ci` prints only the summary line; `--fix` repairs what it safely can and lists the fixes. |

## Build authority

While an agent works a plan, every Edit and Write is checked against the plan's `files_modified` and `files_forbidden` under the project's control mode (see [control-modes.md](control-modes.md)). Surgical denies the write and the executor reverts unclaimed changes; guarded and autonomous warn and record an escalation; advisory logs. Progress goes to `.triad/legion.log`, and each agent's raw answer to `.triad/legion/`.
