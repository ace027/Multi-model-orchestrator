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
    inputSchema: { type: 'object', properties: { phase: { type: 'integer', description: 'Default: the phase in STATE.md.' }, wave: { type: 'integer', description: 'Run only this wave.' }, rerun: { type: 'boolean', description: 'Run plans that already have a successful summary again.' } } },
  },
  {
    name: 'review_phase',
    description: 'Run the review loop on a built phase: reviewers (panel or classic) in parallel, findings triaged in code, fixes routed to agents, re-review of changed files, up to review.max_cycles; writes NN-REVIEW.md and updates STATE/ROADMAP. Blocks until done; returns the result.',
    inputSchema: { type: 'object', properties: { phase: { type: 'integer' }, mode: { type: 'string', enum: ['panel', 'classic'] } } },
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
]

export const LEGION_TOOL_NAMES = LEGION_TOOLS.map(t => `mcp__triad__${t.name}`)
