# PARITY.md: Legion to Triad parity checklist

- **Legion audited:** `9thLevelSoftware/legion` at commit `30662e34ec7f22c182f37897bc067c444f157c41` (package version 8.0.6), 971 files excluding `.git/`.
- **Spec:** `SPEC.md` sections 5, 9 and 10.
- **Method:** I read the repo files directly; none of Legion's scripts, installers or tests were run. The audit covers every command, skill, persona, hook, config key, schema, test, script, adapter and CI workflow, plus the other notable artifacts.
- **Status values:** **Ported** (same behavior, same files), **Improved** (same contract, but deterministic work moves into mod code, enforcement moves into hooks, or model tiering is added), **Replaced** (a different mechanism covers the need), **Not applicable** (no equivalent is needed in a Claude Code mod; each one gives a reason).
- Rows marked **confirmed default** are my own choice of status. They are collected in [Items the spec doesn't cover](#14-items-the-spec-doesnt-cover) for the user to confirm.

## Summary counts

| Category | Ported | Improved | Replaced | Not applicable | Total |
|---|---:|---:|---:|---:|---:|
| 1. Commands | 2 | 16 | 1 | 0 | 19 |
| 1a. Command options and modes | 9 | 8 | 1 | 0 | 18 |
| 2. Skills (33 skills + 9 supporting files) | 12 | 25 | 3 | 2 | 42 |
| 3. Agents and personas (49 + 2 archived) | 46 | 2 | 1 | 2 | 51 |
| 4. Hooks | 0 | 5 | 1 | 0 | 6 |
| 5. Configuration keys | 25 | 23 | 5 | 5 | 58 |
| 6. Schemas | 0 | 6 | 0 | 0 | 6 |
| 7. `.planning/` layout and file names | 17 | 5 | 3 | 1 | 26 |
| 8. Tests (41 files + fixture/mock groups) | 18 | 27 | 2 | 4 | 51 |
| 9. Scripts and `bin/` | 1 | 8 | 0 | 6 | 15 |
| 10. Adapters | 0 | 0 | 1 | 12 | 13 |
| 11. Conventions and behaviors | 7 | 8 | 1 | 1 | 17 |
| 12. CI, packaging and other artifacts | 1 | 2 | 4 | 14 | 21 |
| **Total** | **138** | **135** | **23** | **47** | **343** |

There are 16 discrepancies with the spec (section 13). The user's decisions on the open items are recorded in section 14.

---

## 1. Commands (`commands/`, 19 files)

Triad names: judgment workflows become plugin commands (`/triad:<name>`). Deterministic ones become mod commands.

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `commands/start.md` (`/legion:start [design-doc-path]`) | Guided 3-stage questioning, writes PROJECT/ROADMAP/STATE, registers project in portfolio | Improved | Opus runs the 5-8 exchange flow; the `project_init` tool writes PROJECT/ROADMAP/STATE in code from Legion's templates; the command then registers the project through the `portfolio` tool (`register`) |
| `commands/plan.md` (`/legion:plan <N>`) | Decomposes a phase into wave-structured PLAN.md files with agent recommendations, optional critique, spec and GitHub issues | Improved | Opus decomposes; `plan_write` writes the plan files in code, validates frontmatter against the schema and runs the mechanical critique; Opus does the judgment critique itself |
| `commands/build.md` (`/legion:build`) | Runs phase plans in waves with personality-injected agents, then atomic commits and summaries | Improved | Wave executor in mod code; one agent per plan at its persona's tier; verification commands run in code; resumes from SUMMARY files |
| `commands/review.md` (`/legion:review`) | Dev-QA loop with classic or panel reviewers, fix routing, max cycles, then escalation | Improved | Sonnet reviewers; dedup, hot spots, the 80% confidence filter and the cycle cap in code; multi-pass evaluators, coverage thresholds and authority domain filtering in code; FIXES.md per fix cycle |
| `commands/status.md` (`/legion:status`) | Progress dashboard and next-action routing (Read/Grep/Glob only) | Improved | Pure code (`/triad status`, `status.ts`), no model; the next action comes from STATE/ROADMAP rules, plus up to three suggestions from `intent-teams.yaml` `context_rules` for the lifecycle position; the control-mode line shows the flags and gates |
| `commands/quick.md` (`/legion:quick [--fix]`) | Ad-hoc single task with agent selection, optional commit, inline review and PR | Improved | One agent at its persona's tier (Sonnet unless the persona is haiku), picked by registry scoring in code; a coder can hand boilerplate to Haiku with `delegate_menial`; `--fix` adds an inline review and a PR |
| `commands/advise.md` (`/legion:advise <topic>`) | Read-only expert consultation from a selected persona | Ported | Read-only Sonnet advisor, denied write tools by a `tool.call` hook |
| `commands/portfolio.md` (`/legion:portfolio`) | Multi-project dashboard, cross-project dependencies, agent allocation, optional Studio Producer (Opus) | Improved | Aggregation, dependencies and allocation in code; optional Studio Producer persona (Opus) through `persona_run` |
| `commands/milestone.md` (`/legion:milestone`) | Milestone status, definition, completion metrics and archiving | Improved | Code writes MILESTONE-N.md and archives phases; Opus writes the deliverable lines from the facts the tool returns; GitHub milestone close through `gh` |
| `commands/agent.md` (`/legion:agent`) | 3-stage guided persona creation with 8 schema checks | Improved | Opus runs the 3 stages; the 8 checks run in code; the new persona gets a `tier:` field |
| `commands/map.md` (`/legion:map`) | Generates CODEBASE.md and `.planning/codebase/` index (index.jsonl, symbols.json, search.md) | Improved | Code builds the index (`git ls-files` plus regex scans for symbols, routes, imports); a Haiku helper drafts the narrative sections; no embeddings |
| `commands/explore.md` (`/legion:explore`) | Polymath pre-flight research and clarification, then writes a design doc | Improved | Opus with the Polymath persona; Haiku fans out research; saves to `.planning/explorations/` |
| `commands/board.md` (`/legion:board meet\|review`) | Board-of-directors deliberation (meet) or quick parallel assessment (review) | Ported | Opus convenes; members are parallel Sonnet agents; votes and artifacts persisted to `.planning/board/` |
| `commands/retro.md` (`/legion:retro`) | Structured retrospective; saves RETRO.md; supports cross-project mode | Improved | Metrics and evidence gathered in code; a Sonnet persona (studio operations) writes the retrospective; saved to RETRO.md in code |
| `commands/ship.md` (`/legion:ship`) | Pre-ship gates, ship report, PR via `gh`, post-ship checks, canary monitoring | Improved | Gates and PR creation in code via `gh`; canary checks scheduled with `$.clock.after` at 1, 5 and 15 minutes; always-on security gate hook on `gh pr create` |
| `commands/learn.md` (`/legion:learn`) | Record, recall, list and prune project lessons in `.planning/memory/` | Improved | Memory manager in code; Opus classifies the lesson; four-bracket decay; archive, never delete |
| `commands/polish.md` (`/legion:polish`) | 4-pass code cleanup, capped at 50 files, reverts files whose tests regress | Improved | One Sonnet code polisher runs the 4 passes; the 50-file cap, test and type-check baseline and per-file revert run in code |
| `commands/validate.md` (`/legion:validate`) | Validates `.planning/` files, schemas, cross-refs, roster and config | Improved | Pure code with the schemas (and `settings.schema.json`) built in, no model |
| `commands/update.md` (`/legion:update [--check]`) | Detects runtime, checks npm for latest version, reinstalls | Replaced | Replaced by `claude plugin update` and the marketplace |

### 1a. Command options and modes

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `--dry-run` on plan/build/review/status/retro/ship/polish | Deterministic prerequisite report with no side effects | Improved | The `dry_run` tool builds the prerequisite report in code (port of `scripts/dry-run-report.js` logic), zero tokens, for plan, build, review, status (`/triad status --dry-run`), retro, ship and polish; Legion's display-only retro/ship/polish previews are `--preview` |
| `plan --auto-refine` | Critique, then automatic re-plan, max 2 cycles | Improved | Mechanical critique in code, Opus judgment pass, at most 2 refine rounds (the command's cap) |
| `plan --auto` (+ `--skip-board`, `--skip-security`) | Skips confirmation gates and runs board quick-assess, decompose, critique, design and security stages | Ported | Same stages; only skips confirmation gates, never loosens permissions |
| `plan --security` | Forces a security surface scan during planning | Ported | Security surface scan in code (`security scan`); Opus checks each plan touching auth, crypto, input handling or routes for security considerations |
| `build --phase N`, `review --phase N`, `retro/ship/polish --phase N` | Target a specific phase | Ported | Same flag semantics |
| `build --two-wave` / `--single-wave` / `--skip-gates` / `--skip-architecture` / `--skip-security` | Two-wave mode (build plus analysis wave, then remediation wave) and its gate controls | Ported | Implemented in the wave executor code; analysis roles on Sonnet |
| `build --just-harden`, `--just-document`, `--skip-frontend`, `--skip-backend` | Intent flags that filter plans or assemble an ad-hoc team from `intent-teams.yaml` | Improved | Flag parsing, mutual-exclusion validation and team resolution in code |
| `review --just-security` | Security-only review panel (OWASP and STRIDE) | Improved | `review_phase` with `intent: security-only` runs only the security intent team and drops out-of-domain findings in code; then `security scan`, one read-only `engineering-security-engineer` persona_run and `security save` |
| Natural-language intent detection (build/review Step 0.7) | Maps free-text arguments to intents via `nl_patterns` | Ported | Pattern match in code first, Opus only when ambiguous |
| `quick --fix` | Fix mode with inline review and PR | Ported | `quick.md` fix mode: commit, one read-only reviewer through `persona_run` with a PASS/FAIL verdict, then a branch, push and `gh pr create` (`Fixes #N` with an issue); STATE and ROADMAP are not touched |
| `map --check/--refresh/--scope/--query` | Freshness check, incremental refresh, scoped map, index query | Improved | Per spec, code-built index |
| `learn --recall/--list/--prune` | Recall, list and archive-prune memory | Improved | Code |
| `retro --milestone M` and cross-project mode | Milestone-level or cross-project retrospectives | Ported | Same flow, tiered as for `retro` |
| `ship --canary` | Post-deploy canary monitor | Improved | Canary checks scheduled in code with `$.clock.after` (1, 5 and 15 minutes); never auto-rollback |
| `polish --scope=changed\|dependents\|directory`, `<target-path>` | Scope selection | Ported | Per spec |
| `validate --fix`, `--ci` | Auto-fix and CI exit codes | Improved | Code |
| `update --check` | Version check only | Replaced | Plugin update shows available versions |
| `board meet <topic>` / `board review` | Full deliberation or quick assessments | Ported | Per spec |

---

## 2. Skills (`skills/`, 33 skill directories, 42 files)

Always-loaded core stays lean. Everything else is deferred (`tool.describe` with `isDeferred`) and loaded on condition, following Legion's own command-to-skill mapping.

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `skills/workflow-common-core/SKILL.md` | Always-load core: harness contract, adapter detection, state paths, settings and mode resolution, command-to-skill map, budgets, quick validation | Improved | Becomes the byte-stable orchestrator guide (`ORCHESTRATOR_GUIDE` in `register.ts` plus the knowledge index) in the main loop's system prompt via `prompt.section`; settings, mode resolution and quick validation run in code; adapter detection dropped (Claude Code only) |
| `skills/workflow-common/SKILL.md` | Deprecated compatibility shim; still holds unique sections (BLOCKER/ENVIRONMENT error classification, manual-edit detection, cost profiles) | Replaced | The deprecated shim is not ported. Its unique sections are in code: BLOCKER/ENVIRONMENT classification and manual-edit detection (`resilience.ts`, section 11); cost profiles are replaced by tiering |
| `skills/workflow-common-domains/SKILL.md` | Optional design, marketing and specialized conventions | Improved | Conventions live in the deferred `domain` tool (detection, teams, waves, documents, checks in code) and `/triad:design` / `/triad:marketing`, which load it |
| `skills/workflow-common-github/SKILL.md` | Optional GitHub conventions | Improved | Deferred `github` tool, loaded by the commands that sync; mode from `integrations.github` (prompt/enabled/disabled), and a missing `gh` is reported in one line |
| `skills/workflow-common-memory/SKILL.md` | Optional memory conventions | Improved | Deferred `memory` tool, loaded by the commands when `.planning/memory/` exists |
| `skills/questioning-flow/SKILL.md` | Adaptive project-init questioning (vision, requirements, preferences, cost profile) | Ported | Opus runs it; the cost-profile question is replaced by tiering (section 11) |
| `skills/questioning-flow/templates/project-template.md` | PROJECT.md template | Ported | Bundled with the leading comment stripped; filled in code by `project_init` |
| `skills/questioning-flow/templates/roadmap-template.md` | ROADMAP.md template | Ported | Bundled with the leading comment stripped |
| `skills/questioning-flow/templates/state-template.md` | STATE.md template | Ported | Bundled with the leading comment stripped; the `/legion:plan 1` hint reads `/triad:plan 1` |
| `skills/agent-registry/SKILL.md` | Maps agents by division and capability; recommendation scoring | Improved | Scoring (keyword 3, division 2, word-in-key 1, metadata, memory boost) in code |
| `skills/agent-registry/CATALOG.md` | Agent catalog data plus intent mappings | Replaced | Not bundled; the same catalog data is the persona metadata (`personas.ts`: division, languages, frameworks, artifact types, review strengths) that the scorer reads |
| `skills/agent-registry/DOMAINS.md` | Quick reference of authority domains | Ported | Data; authority-matrix.yaml remains canonical |
| `skills/agent-registry/GAP_ANALYSIS.md` | Roster coverage gap analysis engine | Improved | Gap scoring in code from `roster-gap-config.yaml` |
| `skills/agent-registry/MANDATORY-PERSONA-CONTRACT.md` | Contract every persona follows when planning, executing or reviewing | Improved | Kept in the persona cores that name it (5 of Legion's 6; the QA verification specialist's short core drops it) and in the plan brief's return block; the return-schema check (`policy.ts`) refuses a done reply that defers work back |
| `skills/portfolio-manager/SKILL.md` | Global portfolio registry, aggregation, dependencies, allocation | Improved | Code; optional Studio Producer (Opus) through `persona_run` |
| `skills/codebase-mapper/SKILL.md` | Engine for `/map`: CODEBASE.md and index artifacts, dependency risk | Improved | Code builds the index (`git ls-files` plus regex scans); a Haiku helper drafts the narrative sections; dependency risk from `npm outdated` (npm only) |
| `skills/phase-decomposer/SKILL.md` | Breaks a roadmap phase into wave-grouped plans with assigned agents | Improved | Opus decomposes; `plan_write` formats and validates in code |
| `skills/memory-manager/SKILL.md` | OUTCOMES/PATTERNS/ERRORS/PREFERENCES store, decay recall, pruning, Claude auto-memory bridge | Improved | Code; four-bracket decay; archive-not-delete; outcome records validated against the outcomes schema; Claude Code MEMORY.md read as an advisory note, never written |
| `skills/marketing-workflows/SKILL.md` | Campaign docs, content calendars, marketing decomposition | Improved | `/triad:marketing` plus the deferred `domain` tool (teams, waves, campaign document, lifecycle, checks in code); Sonnet personas through `persona_run` |
| `skills/design-workflows/SKILL.md` | Design systems, UX research, three-lens design review | Improved | `/triad:design` plus the deferred `domain` tool (teams, waves, system and research documents, grades in code); Sonnet personas through `persona_run` |
| `skills/spec-pipeline/SKILL.md` | 5-stage pre-coding spec pipeline | Ported | Per spec |
| `skills/plan-critique/SKILL.md` | Pre-mortem, assumption hunting, wave overlap checks, PASS/CAUTION/REWORK | Improved | Mechanical checks in code (overlap, verification, harness sections; undecided actions such as TBD and vague task actions such as "as appropriate" are REWORK, deferrals are warnings), written to CRITIQUE.md; Opus does the judgment pass |
| `skills/github-sync/SKILL.md` | Issues, PRs, milestone sync and readback via `gh` | Improved | `gh` calls in code via `$.process.run`; issue and PR bodies from code templates |
| `skills/wave-executor/SKILL.md` | Wave execution, personality injection, worktrees, sequential_files, handoffs | Improved | Mod code executor, resumable from SUMMARY files: persona core in each brief (the full body with `agent_personality_verbosity: full`), sequential_files, forward handoffs, opt-in worktrees |
| `skills/wave-executor/WAVE-A.md` | Two-wave pattern: build plus analysis wave protocol | Ported | In executor code |
| `skills/wave-executor/WAVE-B.md` | Two-wave pattern: execution plus remediation wave protocol | Ported | In executor code |
| `skills/execution-tracker/SKILL.md` | STATE/ROADMAP updates, atomic commit per plan, compaction | Improved | Code: STATE/ROADMAP updates and one commit per plan in the executor; `compact.ts` writes `{NN}-COMPACTED.md` at phase completion or once completed handoffs pass 6000 characters, and later waves use it |
| `skills/review-loop/SKILL.md` | Dev-QA loop, structured feedback, fix routing, escalation, cycle delta | Improved | Loop control, dedup and cycle delta in code; Sonnet reviewers and fixers |
| `skills/review-panel/SKILL.md` | Assembles 2-4 reviewers with 3-5 rubric criteria; synthesis | Improved | Panel composition rules in code |
| `skills/review-evaluators/SKILL.md` | Multi-pass evaluators (code quality, UI/UX, integration, business logic) | Ported | `evaluators.ts`: read-only passes for code quality, UI/UX (only when frontend files changed), integration and business logic beside the panel when `review.evaluator_depth` is multi-pass; their findings join triage |
| `skills/security-review/SKILL.md` | OWASP Top 10 and STRIDE security review | Ported | Sonnet security persona; feeds the ship security gate |
| `skills/ship-pipeline/SKILL.md` | Pre-ship gates, deploy verification, canary | Improved | Per `ship` row |
| `skills/milestone-tracker/SKILL.md` | Milestone definition, completion metrics, archiving, summaries | Improved | Code; Opus supplies the deliverable lines |
| `skills/agent-creator/SKILL.md` | Guided persona creation with 8 schema checks | Improved | Checks in code |
| `skills/polymath-engine/SKILL.md` | Research-first discovery engine for `/explore` | Ported | Opus Polymath; Haiku research fan-out |
| `skills/authority-enforcer/SKILL.md` | Validates authority boundaries during waves and reviews; decision logs | Improved | `authority.ts`: domain sections in briefs at spawn, out-of-domain review findings filtered (blockers kept with an override note), directory-mapping and plan-scope checks in the `tool.call` write hook, decisions in the authority log. Guarded warns, surgical refuses and reverts, advisory refuses writes, autonomous only warns |
| `skills/code-polish/SKILL.md` | Multi-pass cleanup engine | Improved | Per `polish` row |
| `skills/hooks-integration/SKILL.md` | Documents opt-in Claude Code shell hooks | Replaced | Always-on mod hooks (section 4) |
| `skills/board-of-directors/SKILL.md` | Governance tier: dynamic panels, deliberation, voting, persistence | Ported | Per `board` row |
| `skills/cli-dispatch/SKILL.md` | Routes tasks to external CLIs (Gemini, Codex, Copilot) with file handoff | Not applicable | Cross-CLI dispatch dropped (user decision, Phase 0 review): all work runs on the three Claude tiers |
| `skills/intent-router/SKILL.md` | Interprets `--just-*`/`--skip-*` flags and NL intents, validates combinations | Improved | Code |
| `skills/legion/SKILL.md` | Codex bridge mapping `/legion:*` to command files | Not applicable | Codex-plugin entry point; Triad runs only inside Claude Code |

---

## 3. Agents and personas (`agents/`, 49 files, 9 divisions)

All personas are ported as compact files with a `tier:` field that `agent.spawn` uses to set the model. Spawns get a distilled core (expertise, style, hard rules); with `execution.agent_personality_verbosity: full`, build plan and `persona_run` briefs get the whole Legion persona body instead (reviewers keep the core plus their rubric). Legion paths and `/legion:` commands in the bodies are rewritten to Triad's. The enriched frontmatter (`languages`, `frameworks`, `artifact_types`, `review_strengths`, `color`) is kept for scoring. Legion personas carry no `model:` key. Tiers below are Triad's: default `sonnet`, Studio Producer `opus` as Legion's portfolio command specifies, and Polymath `opus` per spec `explore`. Legion has no "mechanical" role tag, so no persona defaults to `haiku`; two run on `haiku` by user decision (see section 14).

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `agents/engineering-ai-engineer.md` (Engineering) | ML model development, deployment, integration | Ported | tier: sonnet |
| `agents/engineering-backend-architect.md` (Engineering) | Scalable backend, database, API design | Ported | tier: sonnet |
| `agents/engineering-frontend-developer.md` (Engineering) | Modern web frontend (React/Vue/Angular) | Ported | tier: sonnet |
| `agents/engineering-infrastructure-devops.md` (Engineering) | Infra, SRE, CI/CD | Ported | tier: sonnet |
| `agents/engineering-laravel-specialist.md` (Engineering) | Laravel/Livewire/FluxUI delivery | Ported | tier: sonnet |
| `agents/engineering-mobile-app-builder.md` (Engineering) | Native and cross-platform mobile | Ported | tier: sonnet |
| `agents/engineering-rapid-prototyper.md` (Engineering) | Fast proof-of-concept and MVP | Ported | tier: sonnet |
| `agents/engineering-security-engineer.md` (Engineering) | AppSec, OWASP, STRIDE | Ported | tier: sonnet |
| `agents/engineering-senior-developer.md` (Engineering) | Stack-agnostic senior implementation lead | Ported | tier: sonnet |
| `agents/design-brand-guardian.md` (Design) | Brand identity and consistency | Ported | tier: sonnet |
| `agents/design-ui-designer.md` (Design) | Visual design systems and components | Ported | tier: sonnet |
| `agents/design-ux-architect.md` (Design) | UX plus technical CSS/architecture foundations | Ported | tier: sonnet |
| `agents/design-ux-researcher.md` (Design) | User research and usability testing | Ported | tier: sonnet |
| `agents/design-visual-storyteller.md` (Design) | Visual narratives and multimedia | Ported | tier: sonnet |
| `agents/design-whimsy-injector.md` (Design) | Personality and delight in UX | Ported | tier: sonnet |
| `agents/marketing-app-store-optimizer.md` (Marketing) | App Store Optimization | Ported | tier: sonnet |
| `agents/marketing-content-social-strategist.md` (Marketing) | Editorial calendars, brand voice | Ported | tier: sonnet |
| `agents/marketing-growth-hacker.md` (Marketing) | Data-driven acquisition experiments | Ported | tier: sonnet |
| `agents/marketing-social-platform-specialist.md` (Marketing) | Multi-platform social execution | Ported | tier: sonnet |
| `agents/testing-api-tester.md` (Testing) | API validation and testing | Ported | tier: sonnet |
| `agents/testing-code-polisher.md` (Testing) | Code clarity and consistency (polish) | Ported | tier: sonnet; runs the four polish passes itself |
| `agents/testing-performance-benchmarker.md` (Testing) | Performance measurement and tuning | Ported | tier: sonnet |
| `agents/testing-qa-verification-specialist.md` (Testing) | Evidence-based verification and certification | Ported | tier: sonnet |
| `agents/testing-test-results-analyzer.md` (Testing) | Test result evaluation and quality metrics | Improved | tier: haiku (user decision); a Sonnet pass (testing-qa-verification-specialist) reviews its output, in `persona_run` and on build plans |
| `agents/testing-tool-evaluator.md` (Testing) | Tool and technology assessment | Ported | tier: sonnet |
| `agents/testing-workflow-optimizer.md` (Testing) | Test pipeline and CI optimization | Ported | tier: sonnet |
| `agents/product-feedback-synthesizer.md` (Product) | Synthesizes user feedback | Ported | tier: sonnet |
| `agents/product-sprint-prioritizer.md` (Product) | Sprint planning and prioritization | Ported | tier: sonnet |
| `agents/product-technical-writer.md` (Product) | API docs, guides, READMEs | Ported | tier: sonnet |
| `agents/product-trend-researcher.md` (Product) | Market and trend intelligence | Ported | tier: sonnet |
| `agents/project-management-experiment-tracker.md` (Project Management) | Experiment design and tracking | Ported | tier: sonnet |
| `agents/project-management-project-shepherd.md` (Project Management) | Cross-functional coordination (coordinator role) | Ported | tier: sonnet |
| `agents/project-management-studio-operations.md` (Project Management) | Studio operations efficiency | Ported | tier: sonnet |
| `agents/project-management-studio-producer.md` (Project Management) | Strategic portfolio orchestration | Ported | **tier: opus** (as in Legion `portfolio`) |
| `agents/project-manager-senior.md` (Project Management) | Converts phase specs into tasks (coordinator role) | Ported | tier: sonnet |
| `agents/support-executive-summary-generator.md` (Support) | Consultant-grade executive summaries | Improved | tier: haiku (user decision); a Sonnet pass (testing-qa-verification-specialist) reviews its output, in `persona_run` and on build plans |
| `agents/support-finance-tracker.md` (Support) | Financial planning and budgets | Ported | tier: sonnet |
| `agents/support-legal-compliance-checker.md` (Support) | Legal and compliance checks | Ported | tier: sonnet |
| `agents/support-support-responder.md` (Support) | Customer support responses | Ported | tier: sonnet |
| `agents/macos-spatial-metal-engineer.md` (Spatial Computing) | Swift/Metal 3D rendering | Ported | tier: sonnet |
| `agents/terminal-integration-specialist.md` (Spatial Computing) | Terminal emulation, SwiftTerm | Ported | tier: sonnet |
| `agents/visionos-spatial-engineer.md` (Spatial Computing) | visionOS, SwiftUI volumetric | Ported | tier: sonnet |
| `agents/xr-cockpit-interaction-specialist.md` (Spatial Computing) | XR cockpit control systems | Ported | tier: sonnet |
| `agents/xr-immersive-developer.md` (Spatial Computing) | WebXR AR/VR | Ported | tier: sonnet |
| `agents/xr-interface-architect.md` (Spatial Computing) | Spatial interaction design | Ported | tier: sonnet |
| `agents/agents-orchestrator.md` (Specialized) | Autonomous pipeline manager and leader; also Legion's install probe file | Replaced | tier: opus; never spawned (`persona_run` and the spawn point refuse it); its coordination role is distilled into the Opus orchestrator guide (user decision) |
| `agents/data-analytics-engineer.md` (Specialized) | Data pipelines, ETL, analytics | Ported | tier: sonnet |
| `agents/lsp-index-engineer.md` (Specialized) | LSP and code-intelligence systems | Ported | tier: sonnet |
| `agents/polymath.md` (Specialized) | Pre-flight design discovery | Ported | **tier: opus** (spec `explore`) |
| `.planning/archive/agents/marketing-reddit-community-builder.md` | Retired persona (archived) | Not applicable | Retired from Legion's roster; not in `agents/` |
| `.planning/archive/agents/marketing-tiktok-strategist.md` | Retired persona (archived) | Not applicable | Retired from Legion's roster; not in `agents/` |

---

## 4. Hooks

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| Pre-build validation (`skills/hooks-integration` 2.1, PreToolUse `Agent`) | Opt-in shell hook; blocks agent spawn if STATE.md lacks "Current" (checks STATE.md, not plans) | Improved | Always-on `tool.call` hook on Agent refuses spawns while STATE.md lacks "Current"; `build_phase` refuses a phase whose plans fail the plan-frontmatter schema (after legacy forms are read) before any agent starts |
| Post-build notification (2.2, PostToolUse `Agent`) | Opt-in hook that only echoes "Agent task completed" | Improved | Always-on; records outcome to memory and the token ledger |
| Pre-ship security gate (2.3, PreToolUse `Bash` on `gh pr create`) | Opt-in hook; runs `npm audit --audit-level=critical`, blocks on criticals | Improved | Always-on `tool.call` hook on PR creation; same blocking rule |
| Post-commit STATE.md update (2.1 overview item 4) | Listed as a 4th hook but no configuration is given | Improved | Execution tracker code updates STATE.md after each atomic commit |
| State File Quick Validation (`workflow-common-core`) | Per-command prompt-level format checks on PROJECT/ROADMAP/STATE | Improved | `planning_status`, called at the start of each workflow command, appends the `validate --ci` summary computed in code |
| Context Budget Ceilings (`workflow-common-core`, `release-check.js`) | Soft/hard KB caps on always-load skills per command | Replaced | Exact per-agent token ledger, deferred tools and output compression; byte budgets on the orchestrator guide and on each command, checked by `scripts/release-check.ts` in CI |

---

## 5. Configuration keys

### 5a. `settings.json` (validated by `docs/settings.schema.json`)

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `control_mode` (`autonomous\|guarded\|advisory\|surgical`, default guarded) | Selects the control-mode profile | Improved | Resolved to a five-flag profile in code; the write hook decides each write from the flags; `planning_status` and `/triad status` report the flags and whether confirmation gates are on; `autonomous` skips the gates and only warns, never loosens permissions |
| `models.planning` | Planning model (adapter default) | Replaced | Fixed tiers: Opus orchestrates, persona `tier:` decides spawn model |
| `models.execution` | Execution model | Replaced | Persona `tier:` (default sonnet) |
| `models.check` | Check model | Replaced | Checks run in code (verification commands, critique, validation); menial checking work goes to Haiku helpers |
| `models.planning_reasoning` (deprecated) | Extended thinking for planning | Not applicable | Deprecated in Legion, slated for removal; Opus orchestrator covers it |
| `planning.max_tasks_per_plan` (1-5, default 3) | Per-plan task cap | Improved | Enforced in code at plan validation |
| `planning.architecture_proposals_default` (`always\|prompt\|never`) | Minimal/Clean/Pragmatic proposals | Ported | `spec trigger` returns `proposals` from it (always: run, never: skip, prompt: offer) and plan step 2d follows it |
| `planning.spec_pipeline_default` | Whether to run the 5-stage spec pipeline | Ported | `spec trigger` reads it: always runs the pipeline, never skips it unless `--spec`, prompt applies the activation rules |
| `execution.auto_commit` | Atomic commit per plan | Ported | Code |
| `execution.commit_prefix` (default `legion`) | Commit message prefix | Ported | Existing values are honored; new Triad projects default to `triad` (user decision) |
| `execution.agent_personality_verbosity` (`full\|condensed`) | Full or condensed persona injection | Improved | Distilled core by default; with `full` in settings.json, build plan and `persona_run` briefs get the whole Legion persona body (`personasfull.ts`); reviewer and evaluator briefs keep the core plus their rubric |
| `execution.use_worktrees` (experimental) | Per-plan git worktrees | Ported | Opt-in: each plan runs in its own worktree under `.triad/worktrees/`, is verified there and merged back; a merge conflict fails the plan and keeps the worktree |
| `review.default_mode` (`classic\|panel`) | Review mode | Ported | Same |
| `review.max_cycles` (1-5, default 3) | Review cycle cap | Improved | Enforced in code |
| `review.evaluator_depth` (`single\|multi-pass`) | Evaluator depth | Ported | `multi-pass` (the default) adds the evaluator passes to the review; `single` keeps the panel only; it also gates `/triad:design audit` |
| `review.polish` (schema only, default true) | Post-review polish step | Ported | Same |
| `review.polish_scope` (schema only) | Scope of review-integrated polish | Ported | Same |
| `review.coverage_thresholds.overall/business_logic/api_routes` | Coverage gates (70/90/80) | Improved | `coverage.ts` parses existing istanbul, lcov, cobertura or pytest-cov reports and rates overall, business-logic and API-route files against the thresholds; gaps become non-blocking review findings |
| `board.default_size`, `min_size`, `discussion_rounds` | Board composition and rounds | Ported | Same |
| `board.assessment_timeout_ms` | Per-assessment timeout | Ported | Each member run waits at most this long; a member that times out has no assessment |
| `board.persist_artifacts` | Persist board artifacts | Ported | Same |
| `dispatch.enabled`, `fallback_to_internal`, `timeout_ms`, `max_retries` | Cross-CLI dispatch controls | Not applicable | Cross-CLI dispatch dropped (user decision, Phase 0 review): all work runs on the three Claude tiers |
| `memory.enabled` | Memory layer on/off | Ported | Same |
| `memory.project_scoped_only` (const true) | Memory stays in the project | Ported | Same |
| `memory.auto_prune`, `prune_threshold`, `prune_age_days` | Archive-prune policy | Improved | Code |
| `integrations.github` (`enabled\|disabled\|prompt`) | GitHub integration gate | Ported | Same |
| `$schema` | Points to settings schema | Ported | Same; validated in code |

### 5b. `.planning/config/control-modes.yaml`

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `profiles.autonomous` | All 5 flags false (authority enforcement off) | Improved | File kept. Triad's `autonomous` skips confirmation gates and downgrades authority checks to warnings (logged, never blocked); never approves tool calls or loosens permissions (user decision, see D7) |
| `profiles.guarded` | authority, domain filtering and approval on | Improved | Hook-enforced; warns |
| `profiles.advisory` | `read_only: true`, suggestions only | Improved | Read-only: the write hook refuses agent writes, so agents return suggestions; auto-commit suppressed |
| `profiles.surgical` | `file_scope_restriction: true` plus approval | Improved | `tool.call` blocks out-of-scope writes and reverts |
| Flags `authority_enforcement`, `domain_filtering`, `human_approval_required`, `file_scope_restriction`, `read_only` | 5-flag contract consumed downstream | Improved | Read in code: authority_enforcement adds the authority section to briefs, domain_filtering filters review findings, human_approval_required keeps confirmation gates on, file_scope_restriction and read_only decide writes in the hook; a profile that sets only some flags is merged with the guarded defaults, as Legion specifies |
| `version`, `description`, `flag_descriptions`, `when_to_use` | Metadata and docs | Ported | Kept verbatim |

### 5c. `.planning/config/escalation-protocol.yaml`

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `escalation_format` (`block_tag: escalation`, required/optional fields) | Structured `<escalation>` block format | Improved | Parsed and validated in code against `escalation_format`; invalid blocks are flagged in the build report, not defaulted |
| `severity_levels` (info, warning, blocker) | Severity semantics | Ported | Same |
| `escalation_types` (architecture, dependency, scope, schema, api, deletion, infrastructure, quality) | Escalation categories | Ported | Same |
| `control_mode_behaviors` (per mode) | How each mode handles escalations | Improved | Applied in code (`applyMode`): autonomous and advisory log as info, surgical floors at warning, guarded keeps the severity |
| `resolution` (`statuses`, `tracking`, `summary_format`) | Escalation lifecycle and SUMMARY.md format | Improved | Statuses kept in each SUMMARY.md Escalations table; the `escalation` tool lists open escalations and records a resolution |
| `usage`, `maintenance`, `version`, `description` | Docs and metadata | Ported | Kept |

### 5d. `.planning/config/agent-communication.yaml`

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `message_types.handoff_context`, `dependency_request`, `status_update` | Inter-wave message shapes | Improved | Executor code extracts and injects handoffs (forward only) |
| `summary_export_standard` (required/conditional sections, template) | SUMMARY.md required sections | Improved | `checkSummary` validates each SUMMARY.md the executor writes against `summary.schema.json` and the required and conditional sections; problems are build warnings |
| `agent_discovery.at_spawn`, `via_context` | Context given to each agent at spawn | Improved | Each plan brief names the plans running in parallel with it; the authority section at the top of the brief lists the co-agents and their domains |
| `cross_wave_rules.forward_only`, `no_runtime_messaging`, `orchestrator_mediation`, `escalation_inheritance` | Wave communication rules | Improved | Enforced by executor code |
| `usage`, `maintenance`, `version`, `description` | Docs and metadata | Ported | Kept |

### 5e. Other `.planning/config/` files (not named in spec)

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `.planning/config/authority-matrix.yaml` `agents.<id>` (49 entries: name, division, exclusive_domains, ...) | Exclusive domain ownership per persona | Improved | Loaded in `authority.ts` (the shipped domains when it is missing or does not parse); integrity errors from `parseMatrix`: `/triad validate` fails unknown agents and warns on a domain owned twice (Legion's own matrix has some; both agents then own it); plan and reviewer briefs get an Authority section with their own and co-agents' domains at spawn; reviews drop non-owners' out-of-domain findings; `/triad validate` checks its agent references |
| `authority-matrix.yaml` `conflict_resolution`, `specificity_hierarchy`, `usage`, `maintenance` | Domain conflict rules | Improved | `severity_override` (a blocker outside the reviewer's domain is kept with a note) and `specificity_hierarchy` (ownership ties) applied in `authority.ts`; `usage` and `maintenance` are docs |
| `.planning/config/directory-mappings.yaml` `mappings`, `packages`, `enforcement.strictness/exceptions/suggestions` | Environment mapping: where file kinds belong; path enforcement | Improved | `checkMapping` in the write hook for plan agents and coders: strict refuses with the suggested location, warn (the default) warns, off and `enforcement.exceptions` pass; also reads legacy `rules:`; `map` writes the file |
| `.planning/config/intent-teams.yaml` `intents`, `task_types`, `validation`, `nl_patterns` | Intent flag teams and validation rules | Improved | Code |
| `intent-teams.yaml` `command_routes`, `context_rules` | Routes commands and next-action by project state | Improved | Code: `command_routes` drive `intent route`; `context_rules` give `/triad status` its suggested next actions |
| `.planning/config/roster-gap-config.yaml` `gap_analysis.*` (agent_limit 52, role_categories, scoring, severity, replacement_candidates, current_gaps, report_generation, integrations) | Roster gap analysis config | Ported | Read by gap-analysis code |
| `.planning/templates/codebase-mappings.yaml` | Template for directory-mappings.yaml | Ported | Same template |
| `.planning/config/shared-registry.yaml`, `.planning/config/intent-teams.schema.json` | Referenced in skills but absent from the repo | Not applicable | Do not exist at this commit; tolerate if a user project has them |
| `.planning/config.json` (`model_profile`, `workflow.*`, `gsd/phase-...` branch templates) | Config for the GSD tool used to develop Legion; not read by any Legion command or skill | Not applicable | Not a Legion runtime config |

### 5f. Paths and runtime-level config

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `.legion-cli` project override | Forces a runtime adapter | Not applicable | Triad runs only in Claude Code |
| `AGENTS_DIR` resolution (`~/.claude/agents`, local `agents/`, manifests) | Locates persona files | Replaced | Personas ship inside the plugin |
| `~/.claude/legion/manifest.json`, `~/.legion/manifest.json` | Installer manifests | Replaced | Plugin install metadata |
| `{global_config_dir}/portfolio.md` (`~/.claude/legion/portfolio.md` on Claude Code) | Global portfolio registry | Ported | Triad reads and writes `~/.claude/legion/portfolio.md`: one registry, zero migration (user decision) |
| `~/.claude/projects/{project}/memory/MEMORY.md` bridge (memory-manager) | Optional sync with Claude Code auto-memory | Ported | Read only, as Legion's memory-manager rules say (never written): an advisory note beside memory recall while memory is enabled; a missing file is skipped |

---

## 6. Schemas

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `docs/schemas/plan-frontmatter.schema.json` (2020-12; required phase/plan/wave; agents, files_modified, files_forbidden, sequential_files, verification_commands, ...) | PLAN.md frontmatter contract | Improved | Same schema, validated in code at plan-write and build time |
| `docs/schemas/summary.schema.json` (plan_id, agent, outcome, completed_tasks, files_modified, decisions, handoffs, escalations, verification) | SUMMARY.md contract | Improved | `checkSummary` validates each SUMMARY.md the executor writes; adds exact token accounting (improvement 1) |
| `docs/schemas/review-finding.schema.json` (severity blocker/critical/major/minor/advisory, status, cycle) | Review finding contract | Improved | `findingErrors` validates every finding; invalid ones are listed under `## Invalid Findings` in REVIEW.md, not dropped; see discrepancy D9 on severity names |
| `docs/schemas/outcomes-record.schema.json` (id, date, phase, plan, agent, task_type, outcome, importance) | Memory outcome record | Improved | `storeOutcome` validates each record and rejects an invalid one with a message |
| `docs/settings.schema.json` (draft-07, `additionalProperties: false`) | settings.json contract | Improved | Validated in code; Triad's own policy settings live in `userConfig` |
| Plan schema history (v2 `agent` to `agents` migration, v6 fixtures) | Older plan files | Improved | Code accepts v2+ and normalizes on read (port of `migrate-plans-to-v2.js`) |

---

## 7. `.planning/` layout and file names (zero-migration contract)

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `.planning/PROJECT.md`, `ROADMAP.md`, `STATE.md`, `REQUIREMENTS.md` | Core project state | Ported | Same names and formats |
| `.planning/CODEBASE.md` | Brownfield architecture context | Ported | Written by `map` |
| `.planning/codebase/index.jsonl`, `symbols.json`, `search.md` | Codebase index | Improved | Built in code |
| `.planning/phases/{NN}-{slug}/{NN}-{PP}-PLAN.md` | Plan files | Ported | Same |
| `.planning/phases/{NN}-{slug}/{NN}-{PP}-SUMMARY.md` | Plan summaries | Ported | Same, plus token accounting |
| `.planning/phases/{NN}-{slug}/{NN}-CONTEXT.md` | Phase context | Ported | Same |
| `{NN}-REVIEW.md`, `{NN}-UAT.md`, `{NN}-RESEARCH.md`, `{NN}-VERIFICATION.md` | Review, UAT, research, verification records | Ported | Same |
| `{NN}-COMPACTED.md` | Compacted phase context for long phases | Ported | Written by the executor at phase completion or once completed handoffs pass 6000 characters; later waves use it in place of the dependency summaries |
| `CRITIQUE.md`, `FIXES.md`, `SHIP-REPORT.md`, `SECURITY-REVIEW.md`, `SPEC.md`, `{NN}-{PP}-RESULT.md` in phase dirs | Per-phase workflow artifacts | Improved | CRITIQUE.md (`plan_check`) and FIXES.md (review fix loop) as Legion; SHIP-REPORT.md and SECURITY-REVIEW.md under Legion's names (ship also reads a `{NN}-SECURITY-REVIEW.md` from earlier Triad runs); the spec goes to `.planning/specs/`; `{NN}-{PP}-RESULT.md` is not written, since agents return their result to the executor directly |
| `WAVE-A-MANIFEST.yaml`, `WAVE-B-MANIFEST.yaml` | Two-wave manifests | Ported | Same |
| `.planning/memory/OUTCOMES.md`, `PATTERNS.md`, `ERRORS.md`, `PREFERENCES.md`, `RETRO.md`, `ARCHIVE.md` | Memory store | Ported | Same |
| `.planning/milestones/MILESTONE-{N}.md`, `v{X}-REQUIREMENTS.md`, `v{X}-ROADMAP.md`, `v{X}-AUDIT.md` | Milestone records | Ported | Same |
| `.planning/archive/milestone-{N}/{NN-name}/` | Archived phases | Ported | Same |
| `.planning/explorations/YYYY-MM-DD-{slug}-design.md`, `.planning/exploration-*.md` | Exploration design docs | Ported | Same |
| `.planning/board/{YYYY-MM-DD}-{slug}/MEETING.md`, `assessments/{agent}.md`, `discussion.md`, `votes.md`, `resolution.md` | Board artifacts | Ported | Same |
| `.planning/dispatch/{task-id}-PROMPT.md`, `-RESULT.md`, `dispatch/archive/` | Cross-CLI handoff files | Not applicable | Cross-CLI dispatch dropped (user decision, Phase 0 review): all work runs on the three Claude tiers; existing files are left untouched |
| `.planning/specs/{NN}-{slug}-spec.md` | Spec pipeline output | Ported | Same |
| `.planning/designs/` (`{slug}-system.md`, `{slug}-research.md`) | Design workflow output | Ported | Same |
| `.planning/campaigns/{slug}.md`, `{phase-slug}/REPORT.md` | Marketing workflow output | Ported | The `domain` tool writes the campaign document and, with action `report`, `{phase-slug}/REPORT.md` |
| `.planning/logs/authority-decisions-{date}.log` | Authority decision log | Improved | Appended in code: the write hook logs out-of-scope and directory-mapping decisions, review filtering logs filtered findings and blocker overrides |
| `.planning/security-review-{ts}.md`, `security-audit-{ts}.md` | Security outputs | Ported | `security scan` and `save` without a phase write `.planning/security-review-{ts}.md`; audit mode writes `security-audit-{ts}.md` |
| `.planning/templates/agent-prompt.md` | Agent prompt template with authority injection | Improved | Becomes the brief builder in code (`planBrief`, `prepareRun`): authority section, persona core, plan context and return block |
| `.planning/templates/two-wave-manifest.md` | Two-wave phase plan template | Replaced | Not bundled; the executor writes WAVE-A/B manifests in an inline format in code |
| `.planning/templates/exploration-summary.md` | Exploration summary template | Replaced | Not bundled; `/triad:explore` writes the design doc in its own inline format |
| `.planning/templates/auto-update-manifest.md` | Manifest for auto-updating generated artifacts | Replaced | Not bundled; Triad keeps generated artifacts fresh with `map check` and `/triad validate` |
| `.triad/` (new) | Triad-only output (`.triad/out/<id>.txt`) | Improved | New, does not touch the `.planning/` contract |

---

## 8. Tests (`tests/`, 41 test files plus fixtures and mocks)

Spec: port schema conformance, cross-reference validation and `lint-commands` as `claude plugin test` suites. For the other suites I chose statuses myself confirmed default. Most Legion tests grep prompt text; Triad re-targets them to behavior tests of mod code.

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `tests/plan-schema-conformance.test.js` | Plans conform to plan schema v6 | Ported | `parity-plans.test.ts` "parity: plan-schema-conformance": Legion's plan-validation fixtures through `parsePlan` and the plan schema, plus `plan_write` output. Legion's vague-action fixture is a decisions BLOCKER (REWORK) |
| `tests/cross-reference-validation.test.js` | Command `execution_context` skill refs resolve | Ported | `parity-release.test.ts` "parity: cross-reference-validation": every `mcp__triad__*` tool and `/triad:*` command a command names exists (Triad has no skill files to resolve); `scripts/release-check.ts` runs it on the real commands in CI |
| `tests/lint-commands.test.js` | Commands have required frontmatter | Ported | `parity-release.test.ts` "parity: lint-commands" (`lintCommand` in `scripts/checks.ts`: frontmatter, description, argument-hint, orphan closing tags); `scripts/release-check.ts` lints every `/triad:*` command in CI |
| `tests/validate-plan-frontmatter.test.js` | Plan frontmatter validator | Ported | `parity-plans.test.ts` "parity: validate-plan-frontmatter and migrate-plans" and `legion.test.ts` "planning files", against the code validator |
| `tests/validate-settings.test.js` | settings.json validator | Ported | `parity-config.test.ts` "parity: validate-settings": Legion's settings-validation fixtures against the settings schema and `loadSettings` |
| `tests/agent-contract.test.js` | 49 agents, min size, required sections | Improved | `parity-config.test.ts` "parity: agent-contract": 49 personas, a `tier:`, core sections and metadata lists. Legion's deliverables and anti-patterns sections and its 80-line minimum are not checked: the distilled cores drop them |
| `tests/authority-matrix.test.js` | Authority matrix loading and rules | Improved | `legion6w1.test.ts` "authority matrix" and "finding filtering": loading and fallback, integrity errors, domain detection, ownership, the authority section in briefs, finding filtering with the blocker override |
| `tests/path-enforcement.test.js` | Path validation against directory mappings | Improved | `legion6w1.test.ts` "decision log and directory mappings" (`checkMapping` strict, warn, off, exceptions) and "hooks" (a coder's misplaced write refused by the `tool.call` hook and logged); `legion.test.ts` "authority" (plan scope) |
| `tests/control-modes.test.js` | Control-mode schema and flags | Improved | `legion6w1.test.ts` "control-mode profiles" (profile resolution, gates, each flag deciding a write) and `legion.test.ts` "authority" |
| `tests/escalation-protocol.test.js` | Escalation protocol file structure | Improved | `legion6w2.test.ts` "escalations": block validation, `control_mode_behaviors`, the project yaml over the defaults, the `escalation` tool's list and resolve |
| `tests/config-agent-references.test.js` | Config files reference real agents | Ported | `parity-config.test.ts` "parity: config-agent-references": Legion's and Triad's config files name only roster personas; `/triad validate` uses the same `agentRefs` |
| `tests/dispatch-conformance.test.js` | Board and dispatch settings schema | Ported | `parity-config.test.ts` "parity: dispatch-conformance (board settings)": board settings and defaults only; dispatch settings dropped with cross-CLI dispatch |
| `tests/deduplication.test.js` | Review finding deduplication | Improved | `legion.test.ts` "review triage", against the dedup code |
| `tests/plan-critique-overlap.test.js` | Wave file-overlap detection | Improved | `parity-plans.test.ts` "parity: plan-critique-overlap and two-wave-detection" with Legion's wave-overlap fixtures, and `legion.test.ts` "plans and critique" |
| `tests/sequential-files.test.js` | `sequential_files` convention | Improved | `parity-plans.test.ts` "parity: sequential-files": Legion's 8 cases against `runGroups` and `planWaves`. Departure: when only some plans of a wave share a sequential file, only the conflicting plans are serialized; Legion made the whole wave sequential |
| `tests/two-wave-detection.test.js` | Two-wave detection algorithm | Improved | `legion6d.test.ts` "two-wave": detection from flags, CONTEXT.md, then 4+ plans across service groups |
| `tests/intent-filtering.test.js` | Agent filtering by intent | Improved | `legion6d.test.ts` "intent router" (plan filters by agent, files or title) |
| `tests/intent-flag-parsing.test.js` | Intent flag parsing | Improved | `legion6d.test.ts` "intent router" (flag parsing) |
| `tests/intent-review.test.js` | Review panel intent filtering | Improved | `legion6w3.test.ts` "intent review": the intent filter keeps only the intent's domains; `--just-security` runs only the security team |
| `tests/intent-teams.test.js` | Intent team template loading | Improved | `legion6d.test.ts` "intent router" (bundled intent teams) and `legion6w3.test.ts` "status suggestions" (a project intent-teams.yaml overrides them) |
| `tests/intent-validation.test.js` | Mutual-exclusion rules | Improved | `legion6d.test.ts` "intent router" (mutual exclusion, command context, typos) |
| `tests/recommendation-engine.test.js` | Agent recommendation fixtures | Improved | `parity-config.test.ts` "parity: recommendation-engine" with Legion's 10 cases against the scorer. 3 cases rank differently and one misses a must-include persona; each is listed with its reason. Confidence levels are not modelled |
| `tests/roster-gap-analysis.test.js` | Gap analysis parsing and scoring | Improved | `legion6.test.ts` "roster gaps" |
| `tests/memory-manager.test.js` | OUTCOMES schema and store rules | Improved | `legion6.test.ts` "memory" and `legion6w3.test.ts` "memory" (outcome schema validation, the read-only Claude Code memory note) |
| `tests/migrate-plans.test.js` | v2 plan migration | Improved | `parity-plans.test.ts` "parity: validate-plan-frontmatter and migrate-plans" with Legion's migration fixtures, against read-time normalization |
| `tests/directory-mappings.test.js` | Standard location detection | Improved | `parity-config.test.ts` "parity: directory-mappings": `map` detects the standard locations and writes directory-mappings.yaml; glob matching; Legion's mapping fixtures carry the required fields |
| `tests/environment-mapping.test.js` | Full environment-mapping workflow | Improved | `parity-config.test.ts` "parity: environment-mapping": detect, validate and suggest with `validatePaths`; strict, warn and off. Legion's auto-update detection is covered by `map` rewriting the file on refresh |
| `tests/codebase-map-command.test.js` | Map modes and artifacts declared | Improved | `legion6.test.ts` "map", against the index builder |
| `tests/codebase-mapper-enrichment.test.js` | Dependency-risk spec text in SKILL.md | Improved | `parity-release.test.ts` "parity: codebase-mapper-enrichment (dependency risk)" with Legion's npm-outdated fixture. npm only; the heavy-dependency and unmaintained-package checks and other ecosystems are not ported |
| `tests/observability-summary.test.js` | Agent selection rationale in SUMMARY | Improved | `parity-release.test.ts` "parity: observability-summary": token usage, the Agent Selection Rationale in SUMMARY (semantic column "—": no semantic scorer) and the Phase Decision Summary in the build report |
| `tests/observability-cycle-delta.test.js` | Review cycle delta section | Improved | `parity-release.test.ts` "parity: observability-cycle-delta": resolved, new and unchanged per cycle. Departure: Legion's downgraded/upgraded classes are not kept; a re-raised finding takes its new severity |
| `tests/decision-complete-contract.test.js` | Decision-complete planning harness | Improved | `parity-plans.test.ts` "parity: decision-complete-contract": harness sections required; TBD, decide later, as needed and executor decides are REWORK; a deferral is a warning |
| `tests/no-agent-deferrals.test.js` | No agent self-deferral language | Improved | `parity-config.test.ts` "parity: no-agent-deferrals": the return-schema check refuses a done reply that hands work back |
| `tests/planning-count-caps.test.js` | Task-cap is per plan, not per phase | Ported | `parity-plans.test.ts` "parity: planning-count-caps" |
| `tests/validate-command-spawn-truthfulness.test.js` | Commands that claim spawning actually spawn | Ported | `parity-release.test.ts` "parity: validate-command-spawn-truthfulness" with Legion's command-spawn fixtures |
| `tests/dry-run-fixtures.test.js` | Dry-run prerequisite checks | Improved | `parity-plans.test.ts` "parity: dry-run-fixtures" with Legion's dry-run fixtures, and `legion6d.test.ts` "dry run" |
| `tests/context-budget.test.js` | Always-load KB ceilings | Replaced | `parity-release.test.ts` "parity: context-budget and release-check": byte budgets on the orchestrator guide and each command (`BUDGETS`); the token ledger is tested in `triad.test.ts` "ledger" |
| `tests/checksum-manifest.test.js` | checksums.sha256 matches package | Not applicable | Legion-repo-only: checks Legion's npm `checksums.sha256`; Triad ships no npm package |
| `tests/adapter-conformance.test.js` | Adapter frontmatter conformance | Not applicable | No runtime adapters |
| `tests/installer-smoke.test.js` | Installer per-runtime install | Not applicable | No installer |
| `tests/runtime-metadata.test.js` | Runtime metadata contracts | Not applicable | No multi-runtime metadata |
| `tests/fixtures/dry-run/{ok,missing-*}/.planning/**` | Fixture projects for dry-run | Ported | Bundled in `triad/tests/fixtures/` (`index.ts`); used by `parity-plans.test.ts` "parity: dry-run-fixtures" |
| `tests/fixtures/plan-validation/*.md`, `plan-valid-v6.md`, `plan-missing-verification.md`, `plan-overlap-forbidden.md` | Plan validation fixtures | Ported | Bundled; used by `parity-plans.test.ts` |
| `tests/fixtures/plans-wave-overlap/*.md` | Wave overlap fixtures | Ported | Bundled; used by `parity-plans.test.ts` "parity: plan-critique-overlap and two-wave-detection" |
| `tests/fixtures/settings-validation/*.json` | Settings fixtures | Ported | Bundled; used by `parity-config.test.ts` "parity: validate-settings" |
| `tests/fixtures/command-spawn/*.md` | Spawn-truthfulness fixtures | Ported | Bundled; used by `parity-release.test.ts` "parity: validate-command-spawn-truthfulness" |
| `tests/fixtures/migration/{before,after}/sample-plan.md` | Migration fixtures | Ported | Bundled; used by `parity-plans.test.ts` "parity: validate-plan-frontmatter and migrate-plans" |
| `tests/fixtures/recommendation/cases.json` | Recommendation cases | Ported | Bundled; used by `parity-config.test.ts` "parity: recommendation-engine" |
| `tests/fixtures/codebase-mapper/sample-npm-outdated.json` | Dependency-risk fixture | Ported | Bundled; used by `parity-release.test.ts` "parity: codebase-mapper-enrichment (dependency risk)" |
| `tests/fixtures/*.yaml` (agent-coverage-matrix, intent-teams, production-roles, sample-codebase-mappings) | Config fixtures | Ported | Bundled. sample-codebase-mappings.yaml is checked in "parity: directory-mappings"; the other three are only checked to parse ("parity: the Legion fixture YAML parses"), since Triad's gap analysis reads roster-gap-config.yaml |
| `tests/mocks/*` (authority-matrix json/yaml, control-modes.json, sample-findings.json) | Test mocks | Replaced | Bundled in `tests/fixtures/mocks/`, but the authority, control-mode and finding tests (`legion6w1.test.ts`) use inline data instead; only `mocks/authority-matrix.yaml` is read, by the YAML parse check |

---

## 9. Scripts and `bin/`

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `scripts/validate.sh` | Repo health checks (`npm run validate`) | Improved | Becomes `claude plugin validate` plus plugin test suite |
| `scripts/release-check.js` | Version sync, README metrics, command-skill map, context budgets, settings, plan, spawn checks | Improved | `scripts/release-check.ts` in CI: plugin.json version is semver and named in the README, command lint and byte budgets, the guide budget, cross-references, the fixture bundle; the checks are pure functions in `scripts/checks.ts`, tested in `parity-release.test.ts` |
| `scripts/validate-settings.js` | Ajv validation of settings.json | Improved | Mod code (shared by `validate`) |
| `scripts/validate-plan-frontmatter.js` | Ajv 2020-12 validation of plans | Improved | Mod code |
| `scripts/validate-command-spawn-truthfulness.js` | Lints commands for spawn claims | Ported | `scripts/spawn-truthfulness.ts` in CI; the rule is `spawnCheck` in `scripts/checks.ts`, tested against Legion's fixtures |
| `scripts/dry-run-report.js` | Builds deterministic dry-run reports | Improved | Mod code behind `--dry-run` |
| `scripts/recommendation-engine.js` | Agent scoring (metadata, semantic, division, archetype, memory) | Improved | Mod code (`registry.ts`): metadata keywords, id words, division and memory boost; no semantic or archetype scorer, so 3 of Legion's 10 recommendation cases rank differently (listed in `parity-config.test.ts`) |
| `scripts/migrate-plans-to-v2.js` | Migrates `agent` to `agents` in plans | Improved | Read-time normalization in code; no rewrite needed |
| `scripts/generate-knowledge-index.js` | Generates Dynamic Knowledge Index block for CLAUDE.md/AGENTS.md | Improved | Built at session start from the plugin's command frontmatter and the persona registry (sorted, byte-stable) and appended to the orchestrator guide |
| `scripts/generate-checksums.js` | Writes checksums.sha256 | Not applicable | Legion-repo-only: writes the `checksums.sha256` of Legion's npm package; Triad ships no npm package |
| `scripts/audit/next-finding-id.sh` | Next ID in Legion 4.7 audit findings DB | Not applicable | Legion-internal audit tooling |
| `scripts/audit/update-index.sh` | Rebuilds audit findings index | Not applicable | Legion-internal audit tooling |
| `scripts/audit/validate-findings-db.sh` | Validates audit findings JSONL | Not applicable | Legion-internal audit tooling |
| `bin/install.js` | Multi-runtime npm installer | Not applicable | Installer for other tools (section 9); plugin install replaces it for Claude Code |
| `bin/runtime-metadata.js` | Command list and 12 runtime contracts | Not applicable | Runtime metadata for the installer |

---

## 10. Adapters (`adapters/`)

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `adapters/ADAPTER.md` | Adapter spec (spawn, coordinate, ask_user, model_* , global_config_dir, quirks, lint_commands, max_prompt_size) | Not applicable | Triad targets Claude Code only; mod APIs replace adapter concepts |
| `adapters/claude-code.md` | Claude Code mapping: general-purpose Agent spawns, TeamCreate/SendMessage, opus/sonnet/haiku | Replaced | Native mod hooks: `agent.spawn` tiering, `triad-coder`/`triad-helper`, general-purpose hidden |
| `adapters/codex-cli.md` | Codex CLI runtime | Not applicable | Other runtime (cross-CLI dispatch also dropped) |
| `adapters/gemini-cli.md` | Gemini CLI runtime | Not applicable | Other runtime (cross-CLI dispatch also dropped) |
| `adapters/copilot-cli.md` | Copilot CLI runtime | Not applicable | Other runtime |
| `adapters/cursor.md` | Cursor runtime | Not applicable | Other runtime |
| `adapters/aider.md` | Aider runtime | Not applicable | Other runtime |
| `adapters/antigravity-cli.md` | Antigravity CLI runtime | Not applicable | Other runtime |
| `adapters/kiro-cli.md` | Kiro CLI runtime | Not applicable | Other runtime |
| `adapters/windsurf.md` | Windsurf runtime | Not applicable | Other runtime |
| `adapters/opencode.md` | OpenCode runtime | Not applicable | Other runtime |
| `adapters/kilo-cli.md` | Kilo CLI runtime | Not applicable | Other runtime |
| `adapters/kilo-code.md` | Kilo Code runtime | Not applicable | Other runtime |

---

## 11. Conventions and behaviors (CLAUDE.md, AGENTS.md, core skills)

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `CLAUDE.md` (Legion's) | Command list, structure, divisions, knowledge index, workflow, authority matrix, escalation, modes, conventions | Improved | Distilled into the byte-stable orchestrator guide in the main loop's system prompt (`register.ts`): workflow, divisions, authority, escalation triggers, control modes and the AskUserQuestion rule, plus the knowledge index. Triad writes no CLAUDE.md |
| `AGENTS.md` | Same content for non-Claude runtimes (says 48 agents) | Not applicable | Codex/other-runtime instructions file |
| Execution Harness Contract (read-before-write, evidence-before-action, minimal diff, verify-before-report; stop gates, `BLOCKED`) | Brief and plan contract | Improved | Briefs carry the fields; return schema `status: blocked`; scope enforced by hooks |
| "MANDATORY: User Interaction Rule" (always use AskUserQuestion) | Closed-set questions | Ported | The last rule of the orchestrator guide, and each command's confirmation-gate steps |
| Full personality injection ("Personality-first", "Full injection") | Whole persona file per spawn | Improved | Distilled core by default; `execution.agent_personality_verbosity: full` puts the whole Legion persona body (`personasfull.ts`) in build plan and `persona_run` briefs |
| Hybrid agent selection (recommend, user confirms) | User confirms agents | Ported | `plan.md` step 4b: a table of recommended personas, confirmed or changed with AskUserQuestion; skipped only when gates are off or with `--auto` |
| Confidence-gated findings (HIGH 80%+, MEDIUM, LOW discarded) and skeptical-by-default review | Review quality rules | Improved | 80% filter applied in code |
| Anti-sycophancy and anti-rationalization rules | Prompt rules | Ported | In the reviewer and fix briefs (`review.ts`, `reviewrun.ts`) and the orchestrator guide's escalation rule (never rationalize a small exception) |
| BLOCKER/ENVIRONMENT error classification with one auto-retry (`workflow-common`) | Error handling | Improved | `resilience.ts` classifies a failed check or a blocked agent by pattern; ENVIRONMENT gets one automatic retry, then becomes a BLOCKER; a BLOCKER is escalated, not retried |
| Manual-edit detection (diffs stored as corrective preferences) | Learns from user edits | Ported | Content hashes of agent-written files are kept in `.triad/legion/agent-files.json`; at the next build a file the user changed is stored as a corrective preference in PREFERENCES.md |
| Wave handoff conventions (forward-only, no runtime messaging, escalation inheritance, discovery) | Inter-wave communication | Improved | Executor code |
| Per-plan task cap, wave safety, `files_forbidden`, `expected_artifacts`, mandatory `verification_commands` | Plan hardening | Improved | Validated in code |
| Cost profile question (Balanced/Economy/Premium) in `/start` | User picks model mix | Replaced | Fixed tiering (Opus, Sonnet, Haiku) plus persona `tier:` |
| Dynamic Knowledge Index | File map of agents and skills | Improved | Built at session start and appended to the orchestrator guide, sorted and byte-stable |
| Human-readable markdown state | No binary state | Ported | `.planning/` stays markdown; Triad ledger lives in `$.store` |
| Commit signature and `legion` prefix | Commit conventions | Ported | Prefix from settings |
| Agent frontmatter metadata (`languages`, `frameworks`, `artifact_types`, `review_strengths`, `color`, `division`) | Metadata-aware selection | Ported | Kept in all 49 persona files, `color` included, plus `tier:` |

---

## 12. CI, packaging and other artifacts

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `.github/workflows/ci.yml` | npm ci, validate, release:check, checksum diff, `node --test` | Improved | `.github/workflows/ci.yml`: `claude plugin validate`, `claude plugin test` (every suite, the parity suites included), `scripts/release-check.ts` and `scripts/spawn-truthfulness.ts` |
| `.github/workflows/publish.yml` | npm and GitHub Packages publish with provenance | Not applicable | Legion-repo-only: publishes Legion's npm package. Triad is not on npm; it installs from the repo's marketplace (`.claude-plugin/marketplace.json`) |
| `checksums.sha256` (134 entries) | Integrity manifest for published files | Not applicable | Legion-repo-only: integrity manifest for Legion's npm tarball; Triad ships no npm package |
| `package.json` (bin `legion`, scripts, deps `yaml`, dev `ajv`, `gray-matter`) | npm packaging | Replaced | `.claude-plugin/plugin.json`; YAML and Ajv equivalents bundled in mod code |
| `package-lock.json` | Lockfile | Not applicable | No npm package |
| `.codex-plugin/plugin.json` | Codex plugin manifest | Not applicable | Codex runtime |
| `.kilo/plans/1778433176734-proud-planet.md` | Kilo dev plan for installer fix | Not applicable | Other-runtime dev note |
| `.gitignore` | Ignore rules | Improved | The mod writes `.triad/.gitignore` (`*`) at session start, so Triad's output never needs a root entry |
| `README.md` | User docs (says 19 commands, 33 skills, 49 agents) | Replaced | Triad docs: `README.md`, `triad/README.md` (install, use, options, how it works), `docs/commands.md` (all 20 commands), `docs/control-modes.md`, `docs/results.md` |
| `CHANGELOG.md` | Legion release history | Not applicable | Legion history |
| `CONTRIBUTING.md` | Contribution guide | Replaced | Triad's own `CONTRIBUTING.md`: setup, the four CI checks, test rules, PARITY.md upkeep |
| `REVIEW.md` | PR review guide for the Legion repo | Replaced | Triad's own `REVIEW.md` review checklist |
| `docs/index.html` | Project website | Not applicable | Legion marketing site |
| `docs/control-modes.md` | Control modes user doc | Ported | `docs/control-modes.md`, adapted to Triad: the five flags, the four profiles and how the hooks enforce them |
| `docs/runtime-audit.md` | Vendor-doc verification per runtime | Not applicable | Multi-runtime |
| `docs/runtime-certification-checklists.md` | Manual runtime certification | Not applicable | Multi-runtime |
| `docs/security/install-integrity.md` | Installer integrity and provenance | Not applicable | Legion-repo-only: integrity and provenance of Legion's npm installer; Triad has no installer |
| `docs/plans/2026-03-02-inspiration-audit-and-adoption.md` | Legion design history | Not applicable | Historical |
| `docs/superpowers/plans/*` (4) and `docs/superpowers/specs/*` (4) | Board/dispatch, 4.7 audit, contract cleanup, code-polish designs | Not applicable | Historical design docs; used only as reference when porting |
| `docs/audits/2026-04-16-legion-4-7/**` (FINDINGS-DB.jsonl, INDEX, METHODOLOGY, RUBRIC, findings/, proposals/, staging/; about 360 files) | Legion's Opus 4.7 prompt audit | Not applicable | Legion-internal audit; proposals (per-command model override) are covered by Triad tiering |
| Legion's own `.planning/` (PROJECT/ROADMAP/STATE, 40 phases, archive, milestones v1-v5, research, specs; about 350 files) | Legion's dev history in its own format | Not applicable | Not product content; reuse as the real-world zero-migration fixture (section 14) |

---

## 13. Discrepancies with SPEC.md section 10

| # | Spec says | Repo actually has | Effect on Triad |
|---|---|---|---|
| D1 | "All 21 skills port 1:1" | **33** skills (README also says 33). The spec list names 22 (review loop and panel are two). Not named in the spec: board-of-directors, cli-dispatch, intent-router, legion (Codex bridge), review-evaluators, security-review, ship-pipeline, workflow-common (deprecated shim), workflow-common-domains/-github/-memory | All 33 are covered in section 2 |
| D2 | 49 personalities, nine divisions | Correct: 49 files, 9 divisions (Engineering 9, Design 6, Marketing 4, Testing 7, Product 4, Project Management 5, Support 4, Spatial Computing 6, Specialized 4). Legion is inconsistent internally: `agent-registry/SKILL.md`, `AGENTS.md` and one README line say 48, and `authority-matrix.yaml` labels Engineering as "8 agents" | None; use 49 |
| D3 | "Studio Producer is Opus, as in Legion" | Persona files have no `model:` key. Opus comes from `commands/portfolio.md` and README, at spawn time only | `tier:` is new frontmatter in Triad |
| D4 | Commands table | All 19 commands match. The spec omits many options: `--dry-run` (7 commands), `plan --auto/--skip-board/--skip-security/--security`, `build --two-wave/--single-wave/--skip-gates/--skip-architecture`, intent flags `--just-harden/--just-document/--just-security/--skip-frontend/--skip-backend`, NL intent routing, `learn --recall/--list`, `retro --milestone`, `ship --canary` | Added in section 1a |
| D5 | "Runtime adapters and installer for 10 other tools" | 12 runtimes in `bin/runtime-metadata.js` and `adapters/`, so **11** besides Claude Code: Codex, Cursor, Copilot, Gemini, Antigravity, Kiro, Windsurf, OpenCode, Kilo CLI, Kilo Code, Aider | Still Not applicable |
| D6 | Cross-CLI dispatch to Gemini and Codex | `cli-dispatch` also targets **Copilot CLI** | Decide whether Copilot dispatch is kept |
| D7 | `autonomous` "only skips confirmation gates" | Legion's `control-modes.yaml` sets `autonomous` to `authority_enforcement: false`, `domain_filtering: false`, `human_approval_required: false` | Triad changes behavior here. Decide whether `autonomous` keeps authority (file-scope) checks on as warnings |
| D8 | "three opt-in hooks (pre-build plan validation ...)" | The pre-build hook checks only that STATE.md contains "Current", not plans. Post-build only echoes text. A fourth hook (post-commit STATE update) is listed but has no config | Triad's versions are real checks (section 4) |
| D9 | Review severities BLOCKER/WARNING/SUGGESTION | Prompts use BLOCKER/WARNING/SUGGESTION, but `review-finding.schema.json` uses `blocker/critical/major/minor/advisory` | Triad must accept the schema enum for zero migration and map prompt labels to it |
| D10 | "config files (`control-modes.yaml`, `escalation-protocol.yaml`, `agent-communication.yaml`)" | They live in `.planning/config/`, not `docs/`. Four more exist that the spec doesn't name: `authority-matrix.yaml`, `directory-mappings.yaml`, `intent-teams.yaml`, `roster-gap-config.yaml` | All covered in section 5 |
| D11 | "Validate against `docs/schemas/`" | Settings schema is `docs/settings.schema.json` (outside `docs/schemas/`, draft-07); the others are 2020-12 | Validator must support both drafts |
| D12 | Tests: schema conformance, cross-reference validation, `lint-commands` | 41 test files; most are not named (intent, authority, dedup, two-wave, recommendation, memory, etc.) | Covered in section 8 |
| D13 | Not mentioned | Legion's Claude Code adapter spawns `general-purpose` agents and uses TeamCreate/TaskCreate/SendMessage teams | Replaced by Triad's tiered spawn; spec already hides general-purpose |
| D14 | Not mentioned | `.planning/config.json` is config for the GSD tool, not Legion; Legion's own `.planning/` is about 350 files of dev history | Not applicable, but useful as fixture |
| D15 | Not mentioned | Legion has a context-budget system (soft/hard KB per command) and a 4.7 audit proposal for per-command model overrides | Replaced by ledger and tiering |
| D16 | "Agent registry scoring (keyword 3, division 2, partial 1, memory boost)" | Also exact language/framework +3, metadata, semantic and archetype boosts in `scripts/recommendation-engine.js` | Port the full scorer |

---

## 14. Decisions (reviewed with the user, Phase 0 gate)

1. **Haiku-tier personas:** `testing-test-results-analyzer` and `support-executive-summary-generator` run on Haiku; Sonnet reviews their output. All other personas stay on Sonnet (Studio Producer and agents-orchestrator on Opus).
2. **`agents-orchestrator`:** tier opus, distilled into the Opus orchestrator's guidance rather than spawned.
3. **Cross-CLI dispatch:** dropped entirely (Gemini, Codex and Copilot). Every row is Not applicable; everything runs on the three Claude tiers.
4. **`autonomous` mode:** skips confirmation gates; authority checks become warnings (logged, never blocked). Never approves tool calls or loosens permissions.
5. **Commit prefix:** existing values are honored; new Triad projects default to `triad`.
6. **Portfolio registry:** Triad reads and writes `~/.claude/legion/portfolio.md`.
7. **`/legion:*` aliases:** none.
8. **Review severities:** reviewers emit the schema's own enum (`blocker`, `critical`, `major`, `minor`, `advisory`); no mapping layer.
9. **All other spec-silent statuses confirmed as proposed:** two-wave execution (Ported), intent routing (Improved), `--dry-run` everywhere (Improved), `plan --auto` (Ported, gates only), environment mapping (Improved, warning), roster gap analysis (Ported/Improved), review-evaluators and security-review (Ported on Sonnet), workflow-common-domains/-github/-memory (Ported, deferred), MANDATORY-PERSONA-CONTRACT (Improved), post-commit STATE update and quick validation (Improved), context budgets and cost-profile question (Replaced), coverage thresholds (in code), plan schema migration (normalize on read), extra test suites (as in section 8), Legion's `.planning/` and dry-run fixtures (used as fixtures), REVIEW.md and validate/release scripts (Replaced/Improved), auto-memory bridge (Ported), archived personas (Not applicable).
