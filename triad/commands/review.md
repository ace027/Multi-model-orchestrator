---
description: Review a built phase: reviewer panel or classic, findings triaged in code, fixes routed to agents, up to 3 cycles
argument-hint: "[phase number] [--panel | --classic] [--security | --just-security] [--dry-run] [--auto]"
---
Review a built phase of the Triad project in `.planning/`. Arguments: $ARGUMENTS

1. Load the tools: ToolSearch with query `select:mcp__triad__review_phase,mcp__triad__planning_status,mcp__triad__intent,mcp__triad__dry_run`. If any flags were given, call intent action `check` with command `review` and the flags; if it fails validation, show the result and stop.
   With `--dry-run`, call `dry_run` with command `review` (and the phase) and show the report; nothing else runs.
   Gates: every "ask the user" below is a confirmation gate, asked with AskUserQuestion. It is skipped, taking the default it names, when `planning_status` reports confirmation gates off (control mode autonomous) or with `--auto` (handled here: leave it out of the flags you pass to the tools).
2. Call `planning_status`; with no phase number, use the phase it names. If the phase has not been built, tell the user to run `/triad:build` and stop.
3. With `--just-security`, call `review_phase` with the phase and `intent: security-only` (only the security team reviews, and findings outside the security domains are dropped), then go to step 4. Otherwise call `review_phase` with the phase and `mode` (`panel` unless the user asked for `--classic` or settings.json says otherwise). It runs the whole loop: reviewers, triage, fix agents, re-review, NN-REVIEW.md, STATE/ROADMAP and commits. It blocks until done; progress is in `.triad/legion.log`.
4. Security review, after the code review (it adds its section to the phase review file), with `--security` or `--just-security` (also offer it when the phase touched auth, input handling, secrets, payments or dependencies): load `mcp__triad__security,mcp__triad__persona_run`.
   a. Call security action `scan` with the phase. It returns the trigger reasons, the redacted secret matches, dependency and supply-chain findings, and the files to review.
   b. Call persona_run (read_only) with agent `engineering-security-engineer`, label `security-review-NN`, and a brief: the scan output, the files, and `## Instructions`: OWASP Top 10 checklist (PASS/FAIL/N/A per item with evidence), a STRIDE table, an attack surface map, and findings with severity CRITICAL/HIGH/MEDIUM/LOW/INFO, OWASP category, file:line and remediation; mark secret matches that are fixtures or docs as false positives.
   c. Call security action `save` with its owasp, stride, attack_surface, findings and false_positives. Show the verdict and the SEC findings. Unresolved CRITICAL/HIGH findings block `/triad:ship`.
   With `--just-security`, report the verdict and findings and stop here.
4b. Domain review: if `.planning/designs/` or `.planning/campaigns/` has documents for this phase (domain action `detect`), run `/triad:design review` (and `audit` when `review.evaluator_depth` is multi-pass) or `/triad:marketing review`; BLOCKER and HIGH findings join the open findings.
5. Report to the user: the result (PASSED, ESCALATED or STALE LOOP ABORTED), cycles, findings fixed, findings still open with their severity, and deferred suggestions.
   - PASSED: if settings.json `review.polish` is true (the default), ask the user whether to run `/triad:polish --phase N` now (scope from `review.polish_scope`; gates off: run it). Next is `/triad:plan N+1` (or the milestone is done if it was the last phase).
   - Otherwise: list the open blocker/critical/major findings and ask the user how to proceed (fix them, accept them, or re-plan; gates off: stop with the result and the findings, accepting nothing). Do not override the result.
