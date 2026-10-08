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
| 2. Skills (33 skills + 9 supporting files) | 18 | 20 | 2 | 2 | 42 |
| 3. Agents and personas (49 + 2 archived) | 47 | 2 | 0 | 2 | 51 |
| 4. Hooks | 0 | 5 | 1 | 0 | 6 |
| 5. Configuration keys | 25 | 23 | 5 | 5 | 58 |
| 6. Schemas | 0 | 6 | 0 | 0 | 6 |
| 7. `.planning/` layout and file names | 21 | 4 | 0 | 1 | 26 |
| 8. Tests (41 files + fixture/mock groups) | 19 | 27 | 2 | 3 | 51 |
| 9. Scripts and `bin/` | 1 | 8 | 1 | 5 | 15 |
| 10. Adapters | 0 | 0 | 1 | 12 | 13 |
| 11. Conventions and behaviors | 7 | 8 | 1 | 1 | 17 |
| 12. CI, packaging and other artifacts | 2 | 1 | 7 | 11 | 21 |
| **Total** | **151** | **128** | **22** | **42** | **343** |

There are 16 discrepancies with the spec (section 13). The user's decisions on the open items are recorded in section 14.

---

## 1. Commands (`commands/`, 19 files)

Triad names: judgment workflows become plugin commands (`/triad:<name>`). Deterministic ones become mod commands.

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `commands/start.md` (`/legion:start [design-doc-path]`) | Guided 3-stage questioning, writes PROJECT/ROADMAP/STATE, registers project in portfolio | Improved | Opus runs the 5-8 exchange flow; Haiku writes the files from Opus's structured notes, using the same templates |
| `commands/plan.md` (`/legion:plan <N>`) | Decomposes a phase into wave-structured PLAN.md files with agent recommendations, optional critique, spec and GitHub issues | Improved | Opus decomposes; Haiku formats plan files; mechanical critique checks run in code; Sonnet runs the judgment critique; frontmatter is validated against the schema in code |
| `commands/build.md` (`/legion:build`) | Runs phase plans in waves with personality-injected agents, then atomic commits and summaries | Improved | Wave executor in mod code; one Sonnet per plan; Haiku runs `<verify>` blocks; resumable wave state |
| `commands/review.md` (`/legion:review`) | Dev-QA loop with classic or panel reviewers, fix routing, max cycles, then escalation | Improved | Sonnet reviewers; dedup and hot-spot detection in code; 80% confidence filter and cycle cap enforced in code |
| `commands/status.md` (`/legion:status`) | Progress dashboard and next-action routing (Read/Grep/Glob only) | Improved | Pure code, no model; next action computed from `intent-teams.yaml` `context_rules` |
| `commands/quick.md` (`/legion:quick [--fix]`) | Ad-hoc single task with agent selection, optional commit, inline review and PR | Improved | One Sonnet; Haiku for boilerplate; registry scoring in code |
| `commands/advise.md` (`/legion:advise <topic>`) | Read-only expert consultation from a selected persona | Ported | Read-only Sonnet advisor, denied write tools by a `tool.call` hook |
| `commands/portfolio.md` (`/legion:portfolio`) | Multi-project dashboard, cross-project dependencies, agent allocation, optional Studio Producer (Opus) | Improved | Aggregation in code; Haiku summaries; Studio Producer persona on Opus |
| `commands/milestone.md` (`/legion:milestone`) | Milestone status, definition, completion metrics and archiving | Improved | Code moves and archives files; Haiku summaries; optional GitHub milestone sync |
| `commands/agent.md` (`/legion:agent`) | 3-stage guided persona creation with 8 schema checks | Improved | Sonnet runs the 3 stages; the 8 checks run in code; new persona gets a `tier:` field |
| `commands/map.md` (`/legion:map`) | Generates CODEBASE.md and `.planning/codebase/` index (index.jsonl, symbols.json, search.md) | Improved | Code builds the `rg` index; Haiku writes summaries; no embeddings |
| `commands/explore.md` (`/legion:explore`) | Polymath pre-flight research and clarification, then writes a design doc | Improved | Opus with the Polymath persona; Haiku fans out research; saves to `.planning/explorations/` |
| `commands/board.md` (`/legion:board meet\|review`) | Board-of-directors deliberation (meet) or quick parallel assessment (review) | Ported | Opus convenes; members are parallel Sonnet agents; votes and artifacts persisted to `.planning/board/` |
| `commands/retro.md` (`/legion:retro`) | Structured retrospective; saves RETRO.md; supports cross-project mode | Improved | Haiku gathers metrics; Sonnet writes RETRO.md |
| `commands/ship.md` (`/legion:ship`) | Pre-ship gates, ship report, PR via `gh`, post-ship checks, canary monitoring | Improved | Gates and PR creation in code via `gh`; canary on `$.clock.every`; always-on security gate hook |
| `commands/learn.md` (`/legion:learn`) | Record, recall, list and prune project lessons in `.planning/memory/` | Improved | Memory manager in code (classification by Haiku); four-bracket decay; archive, never delete |
| `commands/polish.md` (`/legion:polish`) | 4-pass code cleanup, capped at 50 files, reverts files whose tests regress | Improved | Haiku runs mechanical passes, Sonnet runs judgment passes; revert and cap enforced in code |
| `commands/validate.md` (`/legion:validate`) | Validates `.planning/` files, schemas, cross-refs, roster and config | Improved | Pure code against `docs/schemas/` and `settings.schema.json`, no model |
| `commands/update.md` (`/legion:update [--check]`) | Detects runtime, checks npm for latest version, reinstalls | Replaced | Replaced by `claude plugin update` and the marketplace |

### 1a. Command options and modes

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `--dry-run` on plan/build/review/status/retro/ship/polish | Deterministic prerequisite report with no side effects | Improved | Report generated in code (port of `scripts/dry-run-report.js` logic), zero tokens |
| `plan --auto-refine` | Critique, then automatic re-plan, max 2 cycles | Improved | Per spec: mechanical critique in code, Sonnet judgment pass, cycle cap in code |
| `plan --auto` (+ `--skip-board`, `--skip-security`) | Skips confirmation gates and runs board quick-assess, decompose, critique, design and security stages | Ported | Same stages; only skips confirmation gates, never loosens permissions |
| `plan --security` | Forces a security surface scan during planning | Ported | Sonnet security reviewer |
| `build --phase N`, `review --phase N`, `retro/ship/polish --phase N` | Target a specific phase | Ported | Same flag semantics |
| `build --two-wave` / `--single-wave` / `--skip-gates` / `--skip-architecture` / `--skip-security` | Two-wave mode (build plus analysis wave, then remediation wave) and its gate controls | Ported | Implemented in the wave executor code; analysis roles on Sonnet |
| `build --just-harden`, `--just-document`, `--skip-frontend`, `--skip-backend` | Intent flags that filter plans or assemble an ad-hoc team from `intent-teams.yaml` | Improved | Flag parsing, mutual-exclusion validation and team resolution in code |
| `review --just-security` | Security-only review panel (OWASP and STRIDE) | Improved | Panel filtering in code; Sonnet security reviewer |
| Natural-language intent detection (build/review Step 0.7) | Maps free-text arguments to intents via `nl_patterns` | Ported | Pattern match in code first, Opus only when ambiguous |
| `quick --fix` | Fix mode with inline review and PR | Ported | Per spec |
| `map --check/--refresh/--scope/--query` | Freshness check, incremental refresh, scoped map, index query | Improved | Per spec, code-built index |
| `learn --recall/--list/--prune` | Recall, list and archive-prune memory | Improved | Code |
| `retro --milestone M` and cross-project mode | Milestone-level or cross-project retrospectives | Ported | Same flow, tiered as for `retro` |
| `ship --canary` | Post-deploy canary monitor | Improved | `$.clock.every` |
| `polish --scope=changed\|dependents\|directory`, `<target-path>` | Scope selection | Ported | Per spec |
| `validate --fix`, `--ci` | Auto-fix and CI exit codes | Improved | Code |
| `update --check` | Version check only | Replaced | Plugin update shows available versions |
| `board meet <topic>` / `board review` | Full deliberation or quick assessments | Ported | Per spec |

---

## 2. Skills (`skills/`, 33 skill directories, 42 files)

Always-loaded core stays lean. Everything else is deferred (`tool.describe` with `isDeferred`) and loaded on condition, following Legion's own command-to-skill mapping.

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `skills/workflow-common-core/SKILL.md` | Always-load core: harness contract, adapter detection, state paths, settings and mode resolution, command-to-skill map, budgets, quick validation | Improved | Becomes the byte-stable CLAUDE.md prefix; settings, mode resolution and quick validation run in code; adapter detection dropped (Claude Code only) |
| `skills/workflow-common/SKILL.md` | Deprecated compatibility shim; still holds unique sections (BLOCKER/ENVIRONMENT error classification, manual-edit detection, cost profiles) | Replaced | Covered by core prefix and code; unique sections extracted into Triad conventions (section 11) |
| `skills/workflow-common-domains/SKILL.md` | Optional design, marketing and specialized conventions | Ported | Deferred, loaded for MKT-/DSN- work |
| `skills/workflow-common-github/SKILL.md` | Optional GitHub conventions | Ported | Deferred, loaded when `gh` is authenticated |
| `skills/workflow-common-memory/SKILL.md` | Optional memory conventions | Ported | Deferred, loaded when OUTCOMES.md exists |
| `skills/questioning-flow/SKILL.md` | Adaptive project-init questioning (vision, requirements, preferences, cost profile) | Ported | Opus runs it; the cost-profile question is replaced by tiering (section 11) |
| `skills/questioning-flow/templates/project-template.md` | PROJECT.md template | Ported | Byte-identical, used by Haiku writer |
| `skills/questioning-flow/templates/roadmap-template.md` | ROADMAP.md template | Ported | Byte-identical |
| `skills/questioning-flow/templates/state-template.md` | STATE.md template | Ported | Byte-identical |
| `skills/agent-registry/SKILL.md` | Maps agents by division and capability; recommendation scoring | Improved | Scoring (keyword 3, division 2, partial 1, metadata, memory boost) in code |
| `skills/agent-registry/CATALOG.md` | Agent catalog data plus intent mappings | Ported | Read as data by the scoring code |
| `skills/agent-registry/DOMAINS.md` | Quick reference of authority domains | Ported | Data; authority-matrix.yaml remains canonical |
| `skills/agent-registry/GAP_ANALYSIS.md` | Roster coverage gap analysis engine | Improved | Gap scoring in code from `roster-gap-config.yaml` |
| `skills/agent-registry/MANDATORY-PERSONA-CONTRACT.md` | Contract every persona follows when planning, executing or reviewing | Improved | Folded into the stable prefix and enforced by the return schema and hooks |
| `skills/portfolio-manager/SKILL.md` | Global portfolio registry, aggregation, dependencies, allocation | Improved | Code with Haiku summaries |
| `skills/codebase-mapper/SKILL.md` | Engine for `/map`: CODEBASE.md and index artifacts, dependency risk | Improved | Code-built `rg` index, Haiku summaries |
| `skills/phase-decomposer/SKILL.md` | Breaks a roadmap phase into wave-grouped plans with assigned agents | Improved | Opus decomposes, Haiku formats, code validates |
| `skills/memory-manager/SKILL.md` | OUTCOMES/PATTERNS/ERRORS/PREFERENCES store, decay recall, pruning, Claude auto-memory bridge | Improved | Code; four-bracket decay; archive-not-delete |
| `skills/marketing-workflows/SKILL.md` | Campaign docs, content calendars, marketing decomposition | Ported | Deferred skill, Sonnet personas |
| `skills/design-workflows/SKILL.md` | Design systems, UX research, three-lens design review | Ported | Deferred skill, Sonnet personas |
| `skills/spec-pipeline/SKILL.md` | 5-stage pre-coding spec pipeline | Ported | Per spec |
| `skills/plan-critique/SKILL.md` | Pre-mortem, assumption hunting, wave overlap checks, PASS/CAUTION/REWORK | Improved | Mechanical checks in code; Sonnet judgment pass |
| `skills/github-sync/SKILL.md` | Issues, PRs, milestone sync and readback via `gh` | Improved | `gh` calls in code via `$.process.run`; Haiku drafts issue and PR text |
| `skills/wave-executor/SKILL.md` | Wave execution, personality injection, worktrees, sequential_files, handoffs | Improved | Mod code executor, resumable state |
| `skills/wave-executor/WAVE-A.md` | Two-wave pattern: build plus analysis wave protocol | Ported | In executor code |
| `skills/wave-executor/WAVE-B.md` | Two-wave pattern: execution plus remediation wave protocol | Ported | In executor code |
| `skills/execution-tracker/SKILL.md` | STATE/ROADMAP updates, atomic commit per plan, compaction | Improved | Code |
| `skills/review-loop/SKILL.md` | Dev-QA loop, structured feedback, fix routing, escalation, cycle delta | Improved | Loop control, dedup and cycle delta in code; Sonnet reviewers and fixers |
| `skills/review-panel/SKILL.md` | Assembles 2-4 reviewers with 3-5 rubric criteria; synthesis | Improved | Panel composition rules in code |
| `skills/review-evaluators/SKILL.md` | Multi-pass evaluators (code quality, UI/UX, integration, business logic) | Ported | Sonnet evaluators; honors `review.evaluator_depth` |
| `skills/security-review/SKILL.md` | OWASP Top 10 and STRIDE security review | Ported | Sonnet security persona; feeds the ship security gate |
| `skills/ship-pipeline/SKILL.md` | Pre-ship gates, deploy verification, canary | Improved | Per `ship` row |
| `skills/milestone-tracker/SKILL.md` | Milestone definition, completion metrics, archiving, summaries | Improved | Code with Haiku summaries |
| `skills/agent-creator/SKILL.md` | Guided persona creation with 8 schema checks | Improved | Checks in code |
| `skills/polymath-engine/SKILL.md` | Research-first discovery engine for `/explore` | Ported | Opus Polymath; Haiku research fan-out |
| `skills/authority-enforcer/SKILL.md` | Validates authority boundaries during waves and reviews; decision logs | Improved | Live `tool.call` check; guarded warns, surgical blocks and reverts, advisory logs |
| `skills/code-polish/SKILL.md` | Multi-pass cleanup engine | Improved | Per `polish` row |
| `skills/hooks-integration/SKILL.md` | Documents opt-in Claude Code shell hooks | Replaced | Always-on mod hooks (section 4) |
| `skills/board-of-directors/SKILL.md` | Governance tier: dynamic panels, deliberation, voting, persistence | Ported | Per `board` row |
| `skills/cli-dispatch/SKILL.md` | Routes tasks to external CLIs (Gemini, Codex, Copilot) with file handoff | Not applicable | Cross-CLI dispatch dropped (user decision, Phase 0 review): all work runs on the three Claude tiers |
| `skills/intent-router/SKILL.md` | Interprets `--just-*`/`--skip-*` flags and NL intents, validates combinations | Improved | Code |
| `skills/legion/SKILL.md` | Codex bridge mapping `/legion:*` to command files | Not applicable | Codex-plugin entry point; Triad runs only inside Claude Code |

---

## 3. Agents and personas (`agents/`, 49 files, 9 divisions)

All personas are ported as compact files with a `tier:` field that `agent.spawn` uses to set the model. Spawns get a distilled core (expertise, style, hard rules); the full file loads on request. The enriched frontmatter (`languages`, `frameworks`, `artifact_types`, `review_strengths`, `color`) is kept for scoring. Legion personas carry no `model:` key. Tiers below are Triad's: default `sonnet`, Studio Producer `opus` as Legion's portfolio command specifies, and Polymath `opus` per spec `explore`. Legion has no "mechanical" role tag, so no persona defaults to `haiku` (see section 14).

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
| `agents/testing-code-polisher.md` (Testing) | Code clarity and consistency (polish) | Ported | tier: sonnet; its mechanical polish passes are delegated to Haiku helpers |
| `agents/testing-performance-benchmarker.md` (Testing) | Performance measurement and tuning | Ported | tier: sonnet |
| `agents/testing-qa-verification-specialist.md` (Testing) | Evidence-based verification and certification | Ported | tier: sonnet |
| `agents/testing-test-results-analyzer.md` (Testing) | Test result evaluation and quality metrics | Improved | tier: haiku (user decision); Sonnet reviews its output |
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
| `agents/support-executive-summary-generator.md` (Support) | Consultant-grade executive summaries | Improved | tier: haiku (user decision); Sonnet reviews its output |
| `agents/support-finance-tracker.md` (Support) | Financial planning and budgets | Ported | tier: sonnet |
| `agents/support-legal-compliance-checker.md` (Support) | Legal and compliance checks | Ported | tier: sonnet |
| `agents/support-support-responder.md` (Support) | Customer support responses | Ported | tier: sonnet |
| `agents/macos-spatial-metal-engineer.md` (Spatial Computing) | Swift/Metal 3D rendering | Ported | tier: sonnet |
| `agents/terminal-integration-specialist.md` (Spatial Computing) | Terminal emulation, SwiftTerm | Ported | tier: sonnet |
| `agents/visionos-spatial-engineer.md` (Spatial Computing) | visionOS, SwiftUI volumetric | Ported | tier: sonnet |
| `agents/xr-cockpit-interaction-specialist.md` (Spatial Computing) | XR cockpit control systems | Ported | tier: sonnet |
| `agents/xr-immersive-developer.md` (Spatial Computing) | WebXR AR/VR | Ported | tier: sonnet |
| `agents/xr-interface-architect.md` (Spatial Computing) | Spatial interaction design | Ported | tier: sonnet |
| `agents/agents-orchestrator.md` (Specialized) | Autonomous pipeline manager and leader; also Legion's install probe file | Ported | tier: opus; distilled into the Opus orchestrator's guidance (CLAUDE.md prefix), not spawned (user decision) |
| `agents/data-analytics-engineer.md` (Specialized) | Data pipelines, ETL, analytics | Ported | tier: sonnet |
| `agents/lsp-index-engineer.md` (Specialized) | LSP and code-intelligence systems | Ported | tier: sonnet |
| `agents/polymath.md` (Specialized) | Pre-flight design discovery | Ported | **tier: opus** (spec `explore`) |
| `.planning/archive/agents/marketing-reddit-community-builder.md` | Retired persona (archived) | Not applicable | Retired from Legion's roster; not in `agents/` |
| `.planning/archive/agents/marketing-tiktok-strategist.md` | Retired persona (archived) | Not applicable | Retired from Legion's roster; not in `agents/` |

---

## 4. Hooks

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| Pre-build validation (`skills/hooks-integration` 2.1, PreToolUse `Agent`) | Opt-in shell hook; blocks agent spawn if STATE.md lacks "Current" (checks STATE.md, not plans) | Improved | Always-on mod hook; validates plan frontmatter against the schema and STATE.md before build spawns |
| Post-build notification (2.2, PostToolUse `Agent`) | Opt-in hook that only echoes "Agent task completed" | Improved | Always-on; records outcome to memory and the token ledger |
| Pre-ship security gate (2.3, PreToolUse `Bash` on `gh pr create`) | Opt-in hook; runs `npm audit --audit-level=critical`, blocks on criticals | Improved | Always-on `tool.call` hook on PR creation; same blocking rule |
| Post-commit STATE.md update (2.1 overview item 4) | Listed as a 4th hook but no configuration is given | Improved | Execution tracker code updates STATE.md after each atomic commit |
| State File Quick Validation (`workflow-common-core`) | Per-command prompt-level format checks on PROJECT/ROADMAP/STATE | Improved | Code check at command start, warnings once per session |
| Context Budget Ceilings (`workflow-common-core`, `release-check.js`) | Soft/hard KB caps on always-load skills per command | Replaced | Exact per-agent token ledger plus deferred skills and compression; byte caps kept as a CI check |

---

## 5. Configuration keys

### 5a. `settings.json` (validated by `docs/settings.schema.json`)

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `control_mode` (`autonomous\|guarded\|advisory\|surgical`, default guarded) | Selects the control-mode profile | Improved | Enforced by hooks; `autonomous` skips confirmation gates and turns authority checks into warnings, never loosens permissions |
| `models.planning` | Planning model (adapter default) | Replaced | Fixed tiers: Opus orchestrates, persona `tier:` decides spawn model |
| `models.execution` | Execution model | Replaced | Persona `tier:` (default sonnet) |
| `models.check` | Check model | Replaced | Haiku helpers for checks |
| `models.planning_reasoning` (deprecated) | Extended thinking for planning | Not applicable | Deprecated in Legion, slated for removal; Opus orchestrator covers it |
| `planning.max_tasks_per_plan` (1-5, default 3) | Per-plan task cap | Improved | Enforced in code at plan validation |
| `planning.architecture_proposals_default` (`always\|prompt\|never`) | Minimal/Clean/Pragmatic proposals | Ported | Same semantics |
| `planning.spec_pipeline_default` | Whether to run the 5-stage spec pipeline | Ported | Same semantics |
| `execution.auto_commit` | Atomic commit per plan | Ported | Code |
| `execution.commit_prefix` (default `legion`) | Commit message prefix | Ported | Existing values are honored; new Triad projects default to `triad` (user decision) |
| `execution.agent_personality_verbosity` (`full\|condensed`) | Full or condensed persona injection | Improved | Distilled core by default; `full` loads the whole file |
| `execution.use_worktrees` (experimental) | Per-plan git worktrees | Ported | Opt-in, with merge-conflict detection |
| `review.default_mode` (`classic\|panel`) | Review mode | Ported | Same |
| `review.max_cycles` (1-5, default 3) | Review cycle cap | Improved | Enforced in code |
| `review.evaluator_depth` (`single\|multi-pass`) | Evaluator depth | Ported | Same |
| `review.polish` (schema only, default true) | Post-review polish step | Ported | Same |
| `review.polish_scope` (schema only) | Scope of review-integrated polish | Ported | Same |
| `review.coverage_thresholds.overall/business_logic/api_routes` | Coverage gates (70/90/80) | Improved | Checked in code from coverage output, Haiku summarizes |
| `board.default_size`, `min_size`, `discussion_rounds` | Board composition and rounds | Ported | Same |
| `board.assessment_timeout_ms` | Per-assessment timeout | Ported | Timeout on spawned members |
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
| `profiles.advisory` | `read_only: true`, suggestions only | Improved | `tool.call` denies writes; auto-commit suppressed |
| `profiles.surgical` | `file_scope_restriction: true` plus approval | Improved | `tool.call` blocks out-of-scope writes and reverts |
| Flags `authority_enforcement`, `domain_filtering`, `human_approval_required`, `file_scope_restriction`, `read_only` | 5-flag contract consumed downstream | Improved | Read by hook code; partial profiles merged with guarded defaults as Legion specifies |
| `version`, `description`, `flag_descriptions`, `when_to_use` | Metadata and docs | Ported | Kept verbatim |

### 5c. `.planning/config/escalation-protocol.yaml`

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `escalation_format` (`block_tag: escalation`, required/optional fields) | Structured `<escalation>` block format | Improved | Parsed and validated in code from agent returns |
| `severity_levels` (info, warning, blocker) | Severity semantics | Ported | Same |
| `escalation_types` (architecture, dependency, scope, schema, api, deletion, infrastructure, quality) | Escalation categories | Ported | Same |
| `control_mode_behaviors` (per mode) | How each mode handles escalations | Improved | Applied by code |
| `resolution` (`statuses`, `tracking`, `summary_format`) | Escalation lifecycle and SUMMARY.md format | Improved | Tracked in code, written to SUMMARY.md |
| `usage`, `maintenance`, `version`, `description` | Docs and metadata | Ported | Kept |

### 5d. `.planning/config/agent-communication.yaml`

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `message_types.handoff_context`, `dependency_request`, `status_update` | Inter-wave message shapes | Improved | Executor code extracts and injects handoffs (forward only) |
| `summary_export_standard` (required/conditional sections, template) | SUMMARY.md required sections | Improved | Validated in code against the summary schema |
| `agent_discovery.at_spawn`, `via_context` | Context given to each agent at spawn | Improved | Added to the per-task tail of the brief (cache-safe) |
| `cross_wave_rules.forward_only`, `no_runtime_messaging`, `orchestrator_mediation`, `escalation_inheritance` | Wave communication rules | Improved | Enforced by executor code |
| `usage`, `maintenance`, `version`, `description` | Docs and metadata | Ported | Kept |

### 5e. Other `.planning/config/` files (not named in spec)

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `.planning/config/authority-matrix.yaml` `agents.<id>` (49 entries: name, division, exclusive_domains, ...) | Exclusive domain ownership per persona | Improved | Read by the live `tool.call` authority check |
| `authority-matrix.yaml` `conflict_resolution`, `specificity_hierarchy`, `usage`, `maintenance` | Domain conflict rules | Improved | Applied in code |
| `.planning/config/directory-mappings.yaml` `mappings`, `packages`, `enforcement.strictness/exceptions/suggestions` | Environment mapping: where file kinds belong; path enforcement | Improved | Path validation in `tool.call` (warn by default, as Legion) |
| `.planning/config/intent-teams.yaml` `intents`, `task_types`, `validation`, `nl_patterns` | Intent flag teams and validation rules | Improved | Code |
| `intent-teams.yaml` `command_routes`, `context_rules` | Routes commands and next-action by project state | Improved | Code, used by `status` |
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
| `~/.claude/projects/{project}/memory/MEMORY.md` bridge (memory-manager) | Optional sync with Claude Code auto-memory | Ported | Same behavior |

---

## 6. Schemas

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `docs/schemas/plan-frontmatter.schema.json` (2020-12; required phase/plan/wave; agents, files_modified, files_forbidden, sequential_files, verification_commands, ...) | PLAN.md frontmatter contract | Improved | Same schema, validated in code at plan-write and build time |
| `docs/schemas/summary.schema.json` (plan_id, agent, outcome, completed_tasks, files_modified, decisions, handoffs, escalations, verification) | SUMMARY.md contract | Improved | Validated in code; adds exact token accounting (improvement 1) |
| `docs/schemas/review-finding.schema.json` (severity blocker/critical/major/minor/advisory, status, cycle) | Review finding contract | Improved | Validated in code; see discrepancy D9 on severity names |
| `docs/schemas/outcomes-record.schema.json` (id, date, phase, plan, agent, task_type, outcome, importance) | Memory outcome record | Improved | Validated in memory-manager code |
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
| `{NN}-COMPACTED.md` | Compacted phase context for long phases | Ported | Same |
| `CRITIQUE.md`, `FIXES.md`, `SHIP-REPORT.md`, `SECURITY-REVIEW.md`, `SPEC.md`, `{NN}-{PP}-RESULT.md` in phase dirs | Per-phase workflow artifacts | Ported | Same names |
| `WAVE-A-MANIFEST.yaml`, `WAVE-B-MANIFEST.yaml` | Two-wave manifests | Ported | Same |
| `.planning/memory/OUTCOMES.md`, `PATTERNS.md`, `ERRORS.md`, `PREFERENCES.md`, `RETRO.md`, `ARCHIVE.md` | Memory store | Ported | Same |
| `.planning/milestones/MILESTONE-{N}.md`, `v{X}-REQUIREMENTS.md`, `v{X}-ROADMAP.md`, `v{X}-AUDIT.md` | Milestone records | Ported | Same |
| `.planning/archive/milestone-{N}/{NN-name}/` | Archived phases | Ported | Same |
| `.planning/explorations/YYYY-MM-DD-{slug}-design.md`, `.planning/exploration-*.md` | Exploration design docs | Ported | Same |
| `.planning/board/{YYYY-MM-DD}-{slug}/MEETING.md`, `assessments/{agent}.md`, `discussion.md`, `votes.md`, `resolution.md` | Board artifacts | Ported | Same |
| `.planning/dispatch/{task-id}-PROMPT.md`, `-RESULT.md`, `dispatch/archive/` | Cross-CLI handoff files | Not applicable | Cross-CLI dispatch dropped (user decision, Phase 0 review): all work runs on the three Claude tiers; existing files are left untouched |
| `.planning/specs/{NN}-{slug}-spec.md` | Spec pipeline output | Ported | Same |
| `.planning/designs/` (`{slug}-system.md`, `{slug}-research.md`) | Design workflow output | Ported | Same |
| `.planning/campaigns/{slug}.md`, `{phase-slug}/REPORT.md` | Marketing workflow output | Ported | Same |
| `.planning/logs/authority-decisions-{date}.log` | Authority decision log | Improved | Written by the hook |
| `.planning/security-review-{ts}.md`, `security-audit-{ts}.md` | Security outputs | Ported | Same |
| `.planning/templates/agent-prompt.md` | Agent prompt template with authority injection | Improved | Becomes the brief builder (stable prefix plus per-task tail) |
| `.planning/templates/two-wave-manifest.md` | Two-wave phase plan template | Ported | Same |
| `.planning/templates/exploration-summary.md` | Exploration summary template | Ported | Same |
| `.planning/templates/auto-update-manifest.md` | Manifest for auto-updating generated artifacts | Ported | Same |
| `.triad/` (new) | Triad-only output (`.triad/out/<id>.txt`) | Improved | New, does not touch the `.planning/` contract |

---

## 8. Tests (`tests/`, 41 test files plus fixtures and mocks)

Spec: port schema conformance, cross-reference validation and `lint-commands` as `claude plugin test` suites. For the other suites I chose statuses myself confirmed default. Most Legion tests grep prompt text; Triad re-targets them to behavior tests of mod code.

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `tests/plan-schema-conformance.test.js` | Plans conform to plan schema v6 | Ported | Per spec |
| `tests/cross-reference-validation.test.js` | Command `execution_context` skill refs resolve | Ported | Per spec |
| `tests/lint-commands.test.js` | Commands have required frontmatter | Ported | Per spec; lints `/triad:*` commands |
| `tests/validate-plan-frontmatter.test.js` | Plan frontmatter validator | Ported | Against code validator |
| `tests/validate-settings.test.js` | settings.json validator | Ported | |
| `tests/agent-contract.test.js` | 49 agents, min size, required sections | Improved | Plus `tier:` field and distilled-core checks |
| `tests/authority-matrix.test.js` | Authority matrix loading and rules | Improved | Tests the live hook |
| `tests/path-enforcement.test.js` | Path validation against directory mappings | Improved | Tests the `tool.call` hook |
| `tests/control-modes.test.js` | Control-mode schema and flags | Improved | Tests hook behavior per mode |
| `tests/escalation-protocol.test.js` | Escalation protocol file structure | Improved | Plus parser tests |
| `tests/config-agent-references.test.js` | Config files reference real agents | Ported | |
| `tests/dispatch-conformance.test.js` | Board and dispatch settings schema | Ported | Board settings only; dispatch settings dropped with cross-CLI dispatch |
| `tests/deduplication.test.js` | Review finding deduplication | Improved | Against dedup code |
| `tests/plan-critique-overlap.test.js` | Wave file-overlap detection | Improved | Against critique code |
| `tests/sequential-files.test.js` | `sequential_files` convention | Improved | Against executor |
| `tests/two-wave-detection.test.js` | Two-wave detection algorithm | Improved | Against executor |
| `tests/intent-filtering.test.js` | Agent filtering by intent | Improved | |
| `tests/intent-flag-parsing.test.js` | Intent flag parsing | Improved | |
| `tests/intent-review.test.js` | Review panel intent filtering | Improved | |
| `tests/intent-teams.test.js` | Intent team template loading | Improved | |
| `tests/intent-validation.test.js` | Mutual-exclusion rules | Improved | |
| `tests/recommendation-engine.test.js` | Agent recommendation fixtures | Improved | Against scoring code |
| `tests/roster-gap-analysis.test.js` | Gap analysis parsing and scoring | Improved | |
| `tests/memory-manager.test.js` | OUTCOMES schema and store rules | Improved | Against memory code |
| `tests/migrate-plans.test.js` | v2 plan migration | Improved | Against read-time normalization |
| `tests/directory-mappings.test.js` | Standard location detection | Improved | |
| `tests/environment-mapping.test.js` | Full environment-mapping workflow | Improved | |
| `tests/codebase-map-command.test.js` | Map modes and artifacts declared | Improved | Against index builder |
| `tests/codebase-mapper-enrichment.test.js` | Dependency-risk spec text in SKILL.md | Improved | Against index builder |
| `tests/observability-summary.test.js` | Agent selection rationale in SUMMARY | Improved | Plus ledger fields |
| `tests/observability-cycle-delta.test.js` | Review cycle delta section | Improved | |
| `tests/decision-complete-contract.test.js` | Decision-complete planning harness | Improved | Against plan validation |
| `tests/no-agent-deferrals.test.js` | No agent self-deferral language | Improved | Return schema forbids it |
| `tests/planning-count-caps.test.js` | Task-cap is per plan, not per phase | Ported | |
| `tests/validate-command-spawn-truthfulness.test.js` | Commands that claim spawning actually spawn | Ported | |
| `tests/dry-run-fixtures.test.js` | Dry-run prerequisite checks | Improved | Against code dry-run |
| `tests/context-budget.test.js` | Always-load KB ceilings | Replaced | Ledger and token benchmark; optional byte check kept |
| `tests/checksum-manifest.test.js` | checksums.sha256 matches package | Replaced | Marketplace integrity |
| `tests/adapter-conformance.test.js` | Adapter frontmatter conformance | Not applicable | No runtime adapters |
| `tests/installer-smoke.test.js` | Installer per-runtime install | Not applicable | No installer |
| `tests/runtime-metadata.test.js` | Runtime metadata contracts | Not applicable | No multi-runtime metadata |
| `tests/fixtures/dry-run/{ok,missing-*}/.planning/**` | Fixture projects for dry-run | Ported | Reused as parity fixtures (improvement 6) |
| `tests/fixtures/plan-validation/*.md`, `plan-valid-v6.md`, `plan-missing-verification.md`, `plan-overlap-forbidden.md` | Plan validation fixtures | Ported | Reused |
| `tests/fixtures/plans-wave-overlap/*.md` | Wave overlap fixtures | Ported | Reused |
| `tests/fixtures/settings-validation/*.json` | Settings fixtures | Ported | Reused |
| `tests/fixtures/command-spawn/*.md` | Spawn-truthfulness fixtures | Ported | Reused |
| `tests/fixtures/migration/{before,after}/sample-plan.md` | Migration fixtures | Ported | Reused |
| `tests/fixtures/recommendation/cases.json` | Recommendation cases | Ported | Reused |
| `tests/fixtures/codebase-mapper/sample-npm-outdated.json` | Dependency-risk fixture | Ported | Reused |
| `tests/fixtures/*.yaml` (agent-coverage-matrix, intent-teams, production-roles, sample-codebase-mappings) | Config fixtures | Ported | Reused |
| `tests/mocks/*` (authority-matrix json/yaml, control-modes.json, sample-findings.json) | Test mocks | Ported | Reused |

---

## 9. Scripts and `bin/`

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `scripts/validate.sh` | Repo health checks (`npm run validate`) | Improved | Becomes `claude plugin validate` plus plugin test suite |
| `scripts/release-check.js` | Version sync, README metrics, command-skill map, context budgets, settings, plan, spawn checks | Improved | Ported as CI test suite; version sync targets `plugin.json` |
| `scripts/validate-settings.js` | Ajv validation of settings.json | Improved | Mod code (shared by `validate`) |
| `scripts/validate-plan-frontmatter.js` | Ajv 2020-12 validation of plans | Improved | Mod code |
| `scripts/validate-command-spawn-truthfulness.js` | Lints commands for spawn claims | Ported | CI lint |
| `scripts/dry-run-report.js` | Builds deterministic dry-run reports | Improved | Mod code behind `--dry-run` |
| `scripts/recommendation-engine.js` | Agent scoring (metadata, semantic, division, archetype, memory) | Improved | Mod code (registry scoring) |
| `scripts/migrate-plans-to-v2.js` | Migrates `agent` to `agents` in plans | Improved | Read-time normalization in code; no rewrite needed |
| `scripts/generate-knowledge-index.js` | Generates Dynamic Knowledge Index block for CLAUDE.md/AGENTS.md | Improved | Generated at build time into the stable prefix |
| `scripts/generate-checksums.js` | Writes checksums.sha256 | Replaced | Marketplace integrity |
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
| `CLAUDE.md` (Legion's) | Command list, structure, divisions, knowledge index, workflow, authority matrix, escalation, modes, conventions | Improved | Distilled into Triad's byte-stable `CLAUDE.md` prefix |
| `AGENTS.md` | Same content for non-Claude runtimes (says 48 agents) | Not applicable | Codex/other-runtime instructions file |
| Execution Harness Contract (read-before-write, evidence-before-action, minimal diff, verify-before-report; stop gates, `BLOCKED`) | Brief and plan contract | Improved | Briefs carry the fields; return schema `status: blocked`; scope enforced by hooks |
| "MANDATORY: User Interaction Rule" (always use AskUserQuestion) | Closed-set questions | Ported | Same rule in prefix |
| Full personality injection ("Personality-first", "Full injection") | Whole persona file per spawn | Improved | Distilled core, full file on request |
| Hybrid agent selection (recommend, user confirms) | User confirms agents | Ported | Same gate (skipped only in `autonomous`/`--auto`) |
| Confidence-gated findings (HIGH 80%+, MEDIUM, LOW discarded) and skeptical-by-default review | Review quality rules | Improved | 80% filter applied in code |
| Anti-sycophancy and anti-rationalization rules | Prompt rules | Ported | In reviewer and coder prompts |
| BLOCKER/ENVIRONMENT error classification with one auto-retry (`workflow-common`) | Error handling | Improved | Classification by pattern in code; retry cap 1 enforced |
| Manual-edit detection (diffs stored as corrective preferences) | Learns from user edits | Ported | Code diffs agent-modified files; writes PREFERENCES.md |
| Wave handoff conventions (forward-only, no runtime messaging, escalation inheritance, discovery) | Inter-wave communication | Improved | Executor code |
| Per-plan task cap, wave safety, `files_forbidden`, `expected_artifacts`, mandatory `verification_commands` | Plan hardening | Improved | Validated in code |
| Cost profile question (Balanced/Economy/Premium) in `/start` | User picks model mix | Replaced | Fixed tiering (Opus, Sonnet, Haiku) plus persona `tier:` |
| Dynamic Knowledge Index | File map of agents and skills | Improved | Generated into the prefix, stable ordering |
| Human-readable markdown state | No binary state | Ported | `.planning/` stays markdown; Triad ledger lives in `$.store` |
| Commit signature and `legion` prefix | Commit conventions | Ported | Prefix from settings |
| Agent frontmatter metadata (`languages`, `frameworks`, `artifact_types`, `review_strengths`, `color`, `division`) | Metadata-aware selection | Ported | Kept, plus `tier:` |

---

## 12. CI, packaging and other artifacts

| Legion item (path) | What it does (one line) | Triad status | Triad approach / reason |
|---|---|---|---|
| `.github/workflows/ci.yml` | npm ci, validate, release:check, checksum diff, `node --test` | Improved | Triad CI: `claude plugin validate`, `claude plugin test`, parity suite |
| `.github/workflows/publish.yml` | npm and GitHub Packages publish with provenance | Replaced | Plugin marketplace release |
| `checksums.sha256` (134 entries) | Integrity manifest for published files | Replaced | Marketplace integrity checks |
| `package.json` (bin `legion`, scripts, deps `yaml`, dev `ajv`, `gray-matter`) | npm packaging | Replaced | `.claude-plugin/plugin.json`; YAML and Ajv equivalents bundled in mod code |
| `package-lock.json` | Lockfile | Not applicable | No npm package |
| `.codex-plugin/plugin.json` | Codex plugin manifest | Not applicable | Codex runtime |
| `.kilo/plans/1778433176734-proud-planet.md` | Kilo dev plan for installer fix | Not applicable | Other-runtime dev note |
| `.gitignore` | Ignore rules | Ported | Triad adds `.triad/` |
| `README.md` | User docs (says 19 commands, 33 skills, 49 agents) | Replaced | Triad docs (phase 7) |
| `CHANGELOG.md` | Legion release history | Not applicable | Legion history |
| `CONTRIBUTING.md` | Contribution guide | Replaced | Triad's own guide |
| `REVIEW.md` | PR review guide for the Legion repo | Replaced | Triad's own review guide |
| `docs/index.html` | Project website | Not applicable | Legion marketing site |
| `docs/control-modes.md` | Control modes user doc | Ported | Adapted to Triad, notes hook enforcement |
| `docs/runtime-audit.md` | Vendor-doc verification per runtime | Not applicable | Multi-runtime |
| `docs/runtime-certification-checklists.md` | Manual runtime certification | Not applicable | Multi-runtime |
| `docs/security/install-integrity.md` | Installer integrity and provenance | Replaced | Marketplace integrity |
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
