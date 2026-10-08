// Tool specs for the Legion workflow (registered deferred: they cost no prompt
// tokens until a /triad:* command loads them with ToolSearch).
const str = (description: string) => ({ type: 'string', description })
const strs = (description: string) => ({ type: 'array', items: { type: 'string' }, description })

const TASK = {
  type: 'object',
  properties: {
    name: str('Short task name.'),
    files: strs('Files the task creates or changes.'),
    action: str('Decision-complete instructions: exact edits, interfaces, edge cases. No "decide later".'),
    verification: strs('Shell commands that exit 0 when the task is done (become "> verification:" lines).'),
    done: str('One sentence: the completed state.'),
  },
  required: ['name', 'files', 'action', 'verification', 'done'],
}

const PLAN = {
  type: 'object',
  properties: {
    plan: { type: 'integer', description: 'Plan number within the phase (1, 2, ...).' },
    title: str('Plan name.'),
    wave: { type: 'integer', description: 'Wave (1 first). A plan may depend only on plans of earlier waves.' },
    agents: strs('Persona ids from the roster (e.g. engineering-backend-architect). The first one runs the plan.'),
    depends_on: strs('Plan ids "NN-PP" this plan needs.'),
    files_modified: strs('Every file the plan may create or change. Writes outside it are checked by the control mode.'),
    files_forbidden: strs('Files or directories (trailing /) the plan must not touch.'),
    sequential_files: strs('Shared files that must not be edited by two plans at once.'),
    requirements: strs('Requirement ids covered.'),
    verification_commands: strs('Plan-level shell commands that exit 0 on success; Triad runs them after the agent.'),
    expected_artifacts: { type: 'array', items: { type: 'object', properties: { path: str(''), provides: str(''), required: { type: 'boolean' } }, required: ['path', 'provides'] } },
    truths: strs('Invariants that must hold after the plan (must_haves.truths).'),
    objective: str('One or two sentences: what the plan accomplishes.'),
    purpose: str('Why it exists in the phase.'),
    context_files: strs('Files the executor must read first.'),
    interfaces: strs('Required signatures, types, output shapes.'),
    edge_cases: strs('Named boundary, failure and empty cases.'),
    tasks: { type: 'array', items: TASK, description: 'At most planning.max_tasks_per_plan tasks (default 3).' },
    success_criteria: strs('Testable outcomes.'),
    model: { type: 'string', enum: ['opus'], description: 'Set opus for open-ended work (a game AI, architecture, tuning, visual polish): the plan then runs on triad:triad-opus-coder instead of its persona\'s Sonnet tier. Leave it out for well-specified work.' },
    wave_role: { type: 'string', enum: ['build', 'analysis', 'execution', 'remediation'], description: 'Two-wave role: build and analysis run in Wave A (analysis read-only), execution and remediation in Wave B (remediation read-only).' },
  },
  required: ['plan', 'title', 'wave', 'agents', 'files_modified', 'verification_commands', 'objective', 'tasks'],
}

export const LEGION_TOOLS = [
  {
    name: 'planning_status',
    description: 'Legion project (.planning/) dashboard computed in code: position, progress, phases, and the next command. Also returns the validation summary.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'project_init',
    description: 'Write .planning/PROJECT.md, ROADMAP.md and STATE.md from the questioning-flow results (Legion templates). Refuses when PROJECT.md exists unless overwrite is true.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Project name.'),
        description: str('What this is (2-3 sentences).'),
        value: str('Core value.'),
        users: str('Who it is for.'),
        requirements: strs('"REQ-01: text" lines.'),
        out_of_scope: strs(''),
        constraints: strs(''),
        decisions: { type: 'array', items: { type: 'object', properties: { decision: str(''), rationale: str('') }, required: ['decision', 'rationale'] } },
        architecture: str('Architecture influences.'),
        phases: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: str(''), goal: str(''), requirements: strs(''), agents: strs('Recommended persona ids.'), success_criteria: strs(''), plans: { type: 'integer', description: 'Estimated plan count.' } },
            required: ['name', 'goal'],
          },
        },
        overwrite: { type: 'boolean' },
      },
      required: ['name', 'description', 'phases'],
    },
  },
  {
    name: 'plan_write',
    description: 'Write a phase\'s CONTEXT.md and NN-PP-PLAN.md files from structured plans (Legion template, schema-valid frontmatter), then run the mechanical critique and return it. Set replace to overwrite existing plans of the phase.',
    inputSchema: {
      type: 'object',
      properties: {
        phase: { type: 'integer' },
        context: { type: 'object', properties: { goal: str(''), requirements: strs(''), existing: strs('What prior phases built that this one uses.'), decisions: strs('Key design decisions.') }, required: ['goal'] },
        plans: { type: 'array', items: PLAN },
        replace: { type: 'boolean' },
        only: { type: 'array', items: { type: 'integer' }, description: 'Rewrite only these plan numbers (auto-refine), keeping the others.' },
      },
      required: ['phase', 'context', 'plans'],
    },
  },
  {
    name: 'plan_check',
    description: 'Mechanical critique of a phase\'s plan files as they are on disk: schema, verification commands, files_forbidden, artifacts, harness sections, task count, wave order and same-wave file overlap. Returns PASS, CAUTION or REWORK with the issues.',
    inputSchema: { type: 'object', properties: { phase: { type: 'integer' } }, required: ['phase'] },
  },
  {
    name: 'build_phase',
    description: 'Run the wave executor on a planned phase: one agent per plan at its persona\'s tier, plans of a wave in parallel, verification commands run in code, SUMMARY.md per plan, STATE/ROADMAP updates, a commit per plan. Resumes where a previous build stopped. Blocks until the build ends; returns the per-plan outcome.',
    inputSchema: { type: 'object', properties: { phase: { type: 'integer', description: 'Default: the phase in STATE.md.' }, wave: { type: 'integer', description: 'Run only this wave.' }, rerun: { type: 'boolean', description: 'Run plans that already have a successful summary again.' }, flags: { type: 'string', description: 'The command\'s flags verbatim: --just-harden, --just-document, --skip-frontend, --skip-backend, --two-wave, --single-wave, --skip-gates, --skip-architecture, --skip-security, --dry-run. Validated in code; an invalid combination returns the error to show.' }, stage: { type: 'string', enum: ['A', 'B'], description: 'Two-wave: B continues after the architecture gate.' } } },
  },
  {
    name: 'review_phase',
    description: 'Run the review loop on a built phase: reviewers (panel or classic) in parallel, findings triaged in code, fixes routed to agents, re-review of changed files, up to review.max_cycles; writes NN-REVIEW.md and updates STATE/ROADMAP. Blocks until done; returns the result.',
    inputSchema: { type: 'object', properties: { phase: { type: 'integer' }, mode: { type: 'string', enum: ['panel', 'classic'] }, intent: { type: 'string', description: 'A filter_review intent (security-only for --just-security): only its team reviews and only findings in its domains count. Skips the multi-pass evaluators and coverage.' } } },
  },
  {
    name: 'persona_brief',
    description: 'Persona registry. With `task`: the best-matching personas, scored in code. With `agent`: that persona\'s distilled core, to put at the top of an agent brief, and its tier.',
    inputSchema: { type: 'object', properties: { task: str('Task description to match.'), agent: str('Persona id.') } },
  },
  {
    name: 'persona_run',
    description: 'Run persona agents (in parallel, each at its persona\'s tier, with the persona\'s distilled core on top of your brief) and return their answers. read_only (default true) refuses every file write; otherwise each run may write only its `writable` files. For advice, board assessments, research, spec stages, retros and domain work.',
    inputSchema: {
      type: 'object',
      properties: {
        runs: { type: 'array', items: { type: 'object', properties: { agent: str('Persona id.'), brief: str('The task: context, question, and the answer format you need.'), label: str('Short label (log and file names).'), writable: strs('Files this run may write (ignored when read_only).') }, required: ['agent', 'brief'] } },
        read_only: { type: 'boolean' },
      },
      required: ['runs'],
    },
  },
  {
    name: 'memory',
    description: 'Project memory (.planning/memory/) in code. record: save a /triad:learn lesson (type pattern|pitfall|preference, summary <=80 chars, 2-5 tags from the text). recall: search lessons, retros and outcomes for a topic. list: all lessons. prune: archive old low-importance outcomes (ask the user first when under the threshold). outcomes: decay-ranked outcome records (filters tags/agent/task_type/branch). scores: per-agent memory scores for task types. briefing: session summary.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['record', 'recall', 'list', 'prune', 'outcomes', 'scores', 'briefing'] },
        type: { type: 'string', enum: ['pattern', 'pitfall', 'preference'] },
        summary: str(''), text: str('The full lesson.'), tags: strs(''), topic: str('Recall topic.'),
        agent: str(''), task_type: str(''), branch: str('all | current | a branch name'), limit: { type: 'integer' }, task_types: strs(''),
      },
      required: ['action'],
    },
  },
  {
    name: 'milestone',
    description: 'Milestones in ROADMAP.md (## Milestones) in code. status: dashboard with progress and the actions available. define: write (or redefine) the groupings you and the user agreed. facts: what a milestone delivered, to write its key deliverables and decisions. complete: write MILESTONE-N.md, mark it Complete, commit (all its phases must be Complete). archive: move its phase directories to .planning/archive/milestone-N/ and commit (ask the user first).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'define', 'facts', 'complete', 'archive'] },
        n: { type: 'integer', description: 'Milestone number.' },
        milestones: { type: 'array', items: { type: 'object', properties: { name: str(''), start: { type: 'integer' }, end: { type: 'integer' }, goal: str('') }, required: ['name', 'start', 'end', 'goal'] } },
        deliverables: { type: 'object', description: 'Phase number -> one-line key deliverable.', additionalProperties: { type: 'string' } },
        decisions: strs('Key decisions for the summary.'),
        overwrite: { type: 'boolean' },
      },
      required: ['action'],
    },
  },
  {
    name: 'retro',
    description: 'Retrospective support. gather: resolve the scope (default the last completed phase; or phase / milestone) and return computed metrics plus the evidence (summaries, reviews, outcomes) to write the report from. save: append the agreed findings, action items and metrics to .planning/memory/RETRO.md.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['gather', 'save'] },
        phase: { type: 'integer' }, milestone: { type: 'integer' },
        scope: str('Scope line, e.g. "Phase 3: Restock Orders".'), findings: str('Condensed went well / did not work.'), action_items: str('The action items table.'), metrics: str('The metrics lines.'),
      },
      required: ['action'],
    },
  },
  {
    name: 'map',
    description: 'Codebase map in code. build: inventory, languages, stack, conventions, complexity, debt, hotspots, import graph, tests, routes, env names, symbols; writes .planning/CODEBASE.md, .planning/codebase/ (index.jsonl, symbols.json, search.md) and directory-mappings.yaml, keeps earlier narrative sections and returns the facts for the pending ones. check: freshness (absent/partial/stale/fresh) without writing. narrate: write narrative sections (Architecture Overview, Functionality Inventory, Module Ownership, Risk Areas, Agent Guidance, Setup / Runbook, Pattern Library, Confidence). query: ranked chunks from the index for a question.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['build', 'check', 'narrate', 'query'] },
        scope: str('Limit the map to this directory.'), query: str('Search terms.'),
        sections: { type: 'object', description: 'Section heading -> markdown body.', additionalProperties: { type: 'string' } },
      },
      required: ['action'],
    },
  },
  {
    name: 'portfolio',
    description: 'Cross-project portfolio, registry at ~/.claude/legion/portfolio.md, in code. dashboard: health ([XX]/[!!]/[OK]), progress, dependencies (Resolved/Blocking) and agent allocation across registered projects (marks missing directories Stale). register / unregister: this project (or `project`). add_dep: a blocks|informs dependency between two registered projects\' phases. details: one project\'s STATE and progress.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['dashboard', 'register', 'unregister', 'add_dep', 'details'] },
        project: str('Project name (or path for unregister).'),
        from: str('Source project name.'), from_phase: { type: 'integer' }, to: str('Target project name.'), to_phase: { type: 'integer' },
        type: { type: 'string', enum: ['blocks', 'informs'] }, notes: str(''),
      },
      required: ['action'],
    },
  },
  {
    name: 'agent',
    description: 'Custom personas for this project (.planning/agents/). validate: run the 8 checks plus the persona contract (sections, 80-350 lines, metadata lists) and list every failure. create: validate, refuse at the roster agent limit unless force, write the persona, add it to .planning/agents/CATALOG.md, register it in the roster for plan/build/review, record the decision in STATE.md and commit.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['validate', 'create'] },
        agent: {
          type: 'object',
          properties: {
            id: str('kebab-case {division}-{specialty}; the file stem.'), name: str('Display name, used in the body.'), description: str('One line, 10+ chars.'),
            division: str('Engineering, Design, Marketing, Product, Project Management, Testing, Support, Spatial Computing, Specialized or Custom.'),
            color: str('red, green, blue, purple, cyan, orange, yellow or pink.'), tier: { type: 'string', enum: ['sonnet', 'haiku', 'opus'] },
            languages: strs(''), frameworks: strs(''), artifact_types: strs(''), review_strengths: strs(''), tags: strs('3-5 task-type tags.'), specialty: str('Catalog one-liner.'),
            body: str('The persona body (80-120 lines, second person) with sections Identity, Core Mission, Critical Rules, Technical Deliverables, Workflow Process, Communication Style, Learning & Memory, Success Metrics, Anti-Patterns, Done Criteria.'),
          },
        },
        force: { type: 'boolean', description: 'Create even at the agent limit (only when the user said so).' },
      },
      required: ['action'],
    },
  },
  {
    name: 'roster',
    description: 'Roster gap analysis in code. gaps: coverage of production roles by the roster (bundled or .planning/config/roster-gap-config.yaml), gap severity, intent-team validation and the agent limit; writes .planning/gap-report.md (or `output`) with all numbers, leaving the recommendation prose to you. limit: agent count against the limit, with consolidation suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['gaps', 'limit'] },
        category: str('Only this role category.'), validate_intents: { type: 'boolean' }, output: str('Report path.'), overwrite: { type: 'boolean' },
      },
      required: ['action'],
    },
  },
  {
    name: 'ship',
    description: 'Ship a reviewed phase, in code. check: resolve the phase, run all 6 pre-ship gates (build complete, review passed incl. unresolved CRITICAL/HIGH security findings, no blocker escalations, verification commands, tests, clean tree), write SHIP-REPORT.md and preview the PR (dry_run writes nothing). publish (after the user chose): method pr (branch, push, labels, gh pr create, npm audit gate), push, or mark; then post-ship verification, STATE/ROADMAP Shipped, outcome, commit. Never force-pushes. canary: run adapter.deploy_command, then schedule checks at 1, 5 and 15 minutes; results come back as a message.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['check', 'publish', 'canary'] }, phase: { type: 'integer' }, dry_run: { type: 'boolean' }, method: { type: 'string', enum: ['pr', 'push', 'mark'] }, commands: strs('Extra canary commands.') }, required: ['action'] },
  },
  {
    name: 'polish',
    description: 'Code polish. scope: resolve the files (target path or glob, else the phase\'s files_modified; plus one level of importers unless scope changed; excludes; capped at 50). run: baseline tests and type check, one testing-code-polisher agent runs the 4 passes (comments, simplification, readability, consistency) on those files, then a regression reverts the culprit file (or all of the polish), commits `refactor: polish ...`, and returns the log, the flagged items and the safety table; dry_run reports only; save writes POLISH.md.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['scope', 'run'] }, phase: { type: 'integer' }, target: str('Path, directory or glob.'), scope: { type: 'string', enum: ['changed', 'dependents', 'directory'] }, files: strs('Exact files (skip scope resolution).'), dry_run: { type: 'boolean' }, save: { type: 'boolean' } }, required: ['action'] },
  },
  {
    name: 'github',
    description: 'GitHub sync via gh, never blocking. mode: integrations.github (enabled|disabled|prompt). set: write enabled or disabled. issue: create the phase issue (label triad, plan checklist, milestone) and record it in STATE.md ## GitHub. tick: check a plan off the phase issue. close: close the phase issue (and its milestone when complete). status: read-only issue/PR/milestone readback.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['mode', 'set', 'issue', 'tick', 'close', 'status'] }, value: { type: 'string', enum: ['enabled', 'disabled'] }, phase: { type: 'integer' }, plan: str('NN-PP'), plans: { type: 'integer' }, requirements: str(''), result: str('') }, required: ['action'] },
  },
  {
    name: 'security',
    description: 'Security review. scan: trigger reasons, secret scan (redacted), dependency audit (npm/pip/composer/go/bundle/cargo), supply-chain checks, and the files for the OWASP/STRIDE review (full_scan: all tracked files for secrets). save: the security engineer\'s OWASP checklist, STRIDE table, attack surface and findings plus the scan findings get SEC ids and a verdict (PASS/CAUTION/FAIL) in SECURITY-REVIEW.md and a section in the phase review; unresolved CRITICAL/HIGH block /triad:ship.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['scan', 'save'] }, phase: { type: 'integer' }, full_scan: { type: 'boolean' },
        mode: { type: 'string', enum: ['phase', 'project', 'audit'], description: 'project (or no phase anywhere): whole-project review saved to .planning/security-review-{timestamp}.md; audit: the --just-harden audit saved to .planning/security-audit-{timestamp}.md. save defaults to the last scan\'s mode.' },
        owasp: str('OWASP Top 10 results (markdown).'), stride: str('STRIDE table (markdown).'), attack_surface: str('Attack surface map (markdown).'),
        findings: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] }, category: str('OWASP category, e.g. A1:Injection.'), finding: str(''), files: str('file:line'), remediation: str('') }, required: ['severity', 'category', 'finding', 'files', 'remediation'] } },
        false_positives: strs('file:line of secret matches that are fixtures or docs.'),
      },
      required: ['action'],
    },
  },
  {
    name: 'intent',
    description: 'Intent router in code. check: validate a command\'s flags (--just-*/--skip-* and the command\'s own flags; unknown flags fail with a did-you-mean) and return the intent team or plan filter. route: score free text against intent-teams.yaml nl_patterns and command_routes; returns the command, flags and a HIGH/MEDIUM/LOW tier.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['check', 'route'] }, command: str('build, review, plan, quick, ...'), flags: str('The flags verbatim.'), text: str('Free text to route.'), phase: { type: 'integer' } }, required: ['action'] },
  },
  {
    name: 'dry_run',
    description: 'Deterministic prerequisite report for plan, build, review, status, retro, ship or polish: what exists, what would run, no writes, no agents, no tokens. Exit code 0 ready, 2 not ready, 1 unknown command.',
    inputSchema: { type: 'object', properties: { command: { type: 'string', enum: ['plan', 'build', 'review', 'status', 'retro', 'ship', 'polish'] }, phase: { type: 'integer' }, target: str('polish target') }, required: ['command'] },
  },
  {
    name: 'board',
    description: 'Board of directors. compose: the slate for a topic (registry score, max 2 per division). meet: full governance (independent assessments, discussion rounds, binding APPROVE/REJECT vote, resolution formula in code, artifacts under .planning/board/, memory record, commit). review: quick Phase-1-only assessment of a phase, nothing saved. decide: record the user decision on an ESCALATED (tied) board.',
    inputSchema: { type: 'object', properties: {
      action: { type: 'string', enum: ['compose', 'meet', 'review', 'decide'] }, topic: str('decision topic'), members: strs('explicit member ids'),
      context: str('proposal context for the members'), allow_two: { type: 'boolean', description: 'the user opted into a board of 2' }, phase: { type: 'integer' },
      dir: str('board meeting directory (decide)'), decision: { type: 'string', enum: ['approve', 'approve_conditions', 'reject', 'table'] }, conditions: strs('extra user conditions'),
    }, required: ['action'] },
  },
  {
    name: 'spec',
    description: 'Spec pipeline, deterministic stages. trigger: run / offer / skip for a phase (--spec flag, CONTEXT spec_required, 4+ requirements at high complexity, or a new surface with 3+ requirements or plans). gather: stage 1 requirements summary and the spec path. check: the machine-checkable critique (required sections, requirement coverage, contracts, acceptance checks, Blocking open questions, defaults, path validation against directory-mappings.yaml) with verdict PASS / CAUTION / REWORK. assess: stage 5 complexity rating written into the spec.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['trigger', 'gather', 'check', 'assess'] }, phase: { type: 'integer' }, flag: { type: 'boolean', description: 'the user passed --spec' } }, required: ['action'] },
  },
  {
    name: 'domain',
    description: 'Design and marketing workflows in code. detect: the phase domain (MKT-/DSN- ids, CONTEXT workflow_type, --domain flag; keywords are only a hint) and its wave pattern. team: the team from the questioning answers. write: scaffold a design system (kind system), UX research report (research) or campaign (campaign) document from the answers. status: move a document forward through its lifecycle. check: completion check of a document. grade: design audit grade from HIGH/MEDIUM counts and the AI-slop grade. passes: the 7-pass plan-stage design review summary (appended to the phase CONTEXT.md when phase is given). report: the campaign final report .planning/campaigns/{phase-dir}/REPORT.md (results vs targets, consistency checklist, learnings); completes the campaign once it is Measuring, the measuring window (marketing.measuring_duration_days, default 14) has elapsed and the checklist is satisfied or waived.',
    inputSchema: { type: 'object', properties: {
      action: { type: 'string', enum: ['detect', 'team', 'write', 'status', 'check', 'grade', 'passes', 'report'] }, phase: { type: 'integer' }, flag: str('--domain=design|marketing'),
      summary: str('report: campaign outcome summary'), metrics: { type: 'array', items: strs(''), description: 'report: [metric, target, actual] rows (default: the campaign Success Metrics with no actuals)' },
      checklist: { type: 'array', items: { type: ['boolean', 'string'] }, description: 'report: the 7 consistency checklist items in order; true satisfied, a string is a waiver rationale' }, learnings: strs('report: learnings'),
      options: { type: 'object', description: 'wave options: backend, frontend, execution, polish (booleans)' },
      domain: { type: 'string', enum: ['design', 'marketing'] }, answers: { type: 'object', description: 'design: focus, disciplines[], brand, platforms[], backend, visual, polish, feedback. marketing: objective, channels[], visual, tracking.' },
      kind: { type: 'string', enum: ['system', 'research', 'campaign'] }, name: str('project, research or campaign name'), fields: { type: 'object', description: 'document fields from the answers (scope, platforms, accessibility, principles, color/typography/spacing/atoms rows; goals, methods; objective, audience, channels, message, tone, hashtags, cta, timeline, metrics, calendar rows)' }, overwrite: { type: 'boolean' },
      path: str('document path'), status: str('new lifecycle status'), high: { type: 'integer' }, medium: { type: 'integer' }, slop: { type: 'integer' },
      scores: { type: 'array', items: { type: 'object', properties: { pre: { type: 'number' }, post: { type: 'number' }, deferred: { type: 'boolean' } } } },
    }, required: ['action'] },
  },
  {
    name: 'escalation',
    description: 'Escalations recorded in the phase SUMMARY.md files (escalation-protocol.yaml). list: the open (pending or deferred) escalations across a phase, or all with all=true. resolve: set one escalation\'s status (approved, rejected, deferred, or pending to reopen) and resolution note in its plan\'s SUMMARY.md, after the user decides; record deferred only when the user chose to defer.',
    inputSchema: { type: 'object', properties: {
      action: { type: 'string', enum: ['list', 'resolve'] }, phase: { type: 'integer' }, all: { type: 'boolean' },
      plan: str('plan id NN-PP (resolve)'), number: { type: 'integer', description: 'escalation # in the plan\'s table (resolve)' },
      status: str('a resolution.statuses value (Legion: pending, approved, rejected, deferred)'), resolution: str('what the user decided and why'),
    }, required: ['action'] },
  },
]

export const LEGION_TOOL_NAMES = LEGION_TOOLS.map(t => `mcp__triad__${t.name}`)
