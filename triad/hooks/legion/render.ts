// Legion files written by code from structured input: PROJECT/ROADMAP/STATE
// (start), PLAN.md and CONTEXT.md (plan), SUMMARY.md (build), commit messages.
// Same templates and headings as Legion, so Legion's readers keep working.
import { TEMPLATES } from './data.ts'
import { pad2, progressBar, slugify } from './planning.ts'
import { renderEscalations, type Escalation } from './escalation.ts'

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{([a-z_]+)\}/g, (m: string, k: string) => v[k] ?? m)
const bullets = (a: readonly string[] | undefined, none = '(none)') => (a?.length ? a.map(s => `- ${s}`).join('\n') : none)

// ---- YAML emit (frontmatter only: strings, numbers, booleans, lists, maps) ----

function scalar(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const s = String(v ?? '')
  // Plain only when it cannot read as anything but this string.
  if (/^[A-Za-z_./][\w ./()-]*$/.test(s) && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && !/[:#]\s|\s$/.test(s)) return s
  return JSON.stringify(s)
}

export function emitYaml(obj: Record<string, unknown>, indent = ''): string {
  const out: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (Array.isArray(v)) {
      if (!v.length) out.push(`${indent}${k}: []`)
      else if (v.every(x => typeof x !== 'object' || x === null)) out.push(`${indent}${k}:`, ...v.map(x => `${indent}  - ${scalar(x)}`))
      else {
        out.push(`${indent}${k}:`)
        for (const item of v) {
          const lines = emitYaml(item as Record<string, unknown>, indent + '    ').split('\n')
          out.push(`${indent}  - ${lines[0].trimStart()}`, ...lines.slice(1))
        }
      }
    } else if (v && typeof v === 'object') out.push(`${indent}${k}:`, emitYaml(v as Record<string, unknown>, indent + '  '))
    else out.push(`${indent}${k}: ${scalar(v)}`)
  }
  return out.join('\n')
}

// ---- start -----------------------------------------------------------------

export type ProjectInput = {
  name: string
  description: string
  value?: string
  users?: string
  requirements?: string[] // "REQ-01: text"
  out_of_scope?: string[]
  constraints?: string[]
  decisions?: { decision: string; rationale: string }[]
  architecture?: string
  phases: { name: string; goal: string; requirements?: string[]; agents?: string[]; success_criteria?: string[]; plans?: number }[]
}

export function renderProject(p: ProjectInput, date: string): { project: string; roadmap: string; state: string } {
  const project = fill(TEMPLATES.project, {
    project_name: p.name,
    project_description: p.description,
    value_proposition: p.value ?? '',
    target_users: p.users ?? '',
    requirements_list: bullets(p.requirements),
    out_of_scope: bullets(p.out_of_scope),
    constraints: bullets(p.constraints),
    decisions_table: (p.decisions ?? []).map(d => `| ${d.decision} | ${d.rationale} | Pending |`).join('\n'),
    architecture_notes: p.architecture ?? '(none yet)',
    date,
  })
  const plans = (ph: ProjectInput['phases'][number]) => ph.plans ?? 1
  const roadmap = fill(TEMPLATES.roadmap, {
    project_name: p.name,
    phase_checklist: p.phases.map((ph, i) => `- [ ] Phase ${i + 1}: ${ph.name} (${plans(ph)} plans)`).join('\n'),
    phase_details_sections: p.phases.map((ph, i) => [
      `### Phase ${i + 1}: ${ph.name}`,
      `**Goal**: ${ph.goal}`,
      `**Requirements**: ${(ph.requirements ?? []).join(', ')}`,
      `**Recommended Agents**: ${(ph.agents ?? []).join(', ')}`,
      `**Success Criteria**:`,
      ...(ph.success_criteria ?? []).map(c => `- [ ] ${c}`),
      `**Plans**: ${plans(ph)}`,
    ].join('\n')).join('\n\n'),
    progress_table: p.phases.map((ph, i) => `| ${i + 1} | ${plans(ph)} | 0 | Pending |`).join('\n'),
  }).replace(/<!-- Each phase detail block[\s\S]*?-->\n*/, '')
  const total = p.phases.reduce((n, ph) => n + plans(ph), 0)
  const state = fill(TEMPLATES.state, {
    total_phases: String(p.phases.length),
    date,
    progress_bar: progressBar(0, total).match(/^\[(.*?)\]/)![1],
    progress_percent: '0',
    total_plans: String(total),
    recent_decisions: bullets((p.decisions ?? []).map(d => d.decision), '(none yet)'),
    first_phase_name: p.phases[0]?.name ?? '',
  }).replace(/`\/legion:plan 1`/g, '`/triad:plan 1`')
  return { project, roadmap, state }
}

// ---- plan ------------------------------------------------------------------

export type TaskInput = { name: string; files: string[]; action: string; verification: string[]; done: string }
export type PlanInput = {
  plan: number
  title: string
  wave: number
  agents: string[]
  depends_on?: string[]
  files_modified: string[]
  files_forbidden?: string[]
  sequential_files?: string[]
  requirements?: string[]
  verification_commands: string[]
  expected_artifacts?: { path: string; provides: string; required?: boolean }[]
  truths?: string[]
  objective: string
  purpose?: string
  context_files?: string[]
  interfaces?: string[]
  edge_cases?: string[]
  tasks: TaskInput[]
  success_criteria?: string[]
  wave_role?: 'build' | 'analysis' | 'execution' | 'remediation'
}

export function planFrontmatter(n: number, slug: string, p: PlanInput): Record<string, unknown> {
  return {
    phase: `${pad2(n)}-${slug}`,
    plan: `${pad2(n)}-${pad2(p.plan)}`,
    type: 'execute',
    title: p.title,
    wave: p.wave,
    depends_on: p.depends_on ?? [],
    files_modified: p.files_modified,
    files_forbidden: p.files_forbidden ?? [],
    sequential_files: p.sequential_files ?? [],
    expected_artifacts: (p.expected_artifacts ?? p.files_modified.map(f => ({ path: f, provides: p.title, required: true as boolean | undefined }))).map(a => ({ path: a.path, provides: a.provides, required: a.required ?? true })),
    autonomous: false,
    agents: p.agents,
    requirements: p.requirements ?? [],
    user_setup: [],
    verification_commands: p.verification_commands,
    must_haves: { truths: p.truths?.length ? p.truths : (p.success_criteria ?? [p.objective]) },
    ...(p.wave_role ? { wave_role: p.wave_role } : {}),
  }
}

export function renderPlan(n: number, slug: string, p: PlanInput): string {
  const fm = planFrontmatter(n, slug, p)
  const dir = `.planning/phases/${pad2(n)}-${slug}`
  const deps = (p.depends_on ?? []).map(d => `@${dir}/${d}-SUMMARY.md`)
  const tasks = p.tasks.map((t, i) => `<task type="auto">
  <name>Task ${i + 1}: ${t.name.replace(/^Task \d+:\s*/, '')}</name>
  <files>${t.files.join(', ')}</files>
  <action>
${t.action.trim()}

${t.verification.map(v => `> verification: ${v}`).join('\n')}
  </action>
  <verify>
${t.verification.join('\n')}
  </verify>
  <done>${t.done}</done>
</task>`).join('\n\n')
  return `---
${emitYaml(fm)}
---

<objective>
${p.objective.trim()}

Purpose: ${p.purpose ?? p.title}
Output: ${p.files_modified.join(', ')}
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@${dir}/${pad2(n)}-CONTEXT.md
${[...deps, ...(p.context_files ?? []).map(f => `@${f}`)].join('\n')}
</context>

<execution_contract>
Harness: read-before-write -> evidence-before-action -> minimal diff -> verify-before-report

Role: ${p.agents.join(', ')} (executor)
Task: ${p.title}${p.requirements?.length ? ` (${p.requirements.join(', ')})` : ''}
Scope:
- Read targets: ${[...(p.context_files ?? []), ...p.files_modified].join(', ')}
- Write targets: ${p.files_modified.join(', ')}
- Forbidden targets: ${(p.files_forbidden ?? []).join(', ') || '(none listed)'}
Allowed tools/actions:
- Read, search, edit the write targets, run the verification commands.
Forbidden actions:
- Do not modify files outside files_modified.
- Do not add unplanned dependencies.
- Do not change public APIs, schemas, migrations, auth, CI, or deployment unless explicitly listed in this plan.
- Do not self-defer planned work.
Implementation sequence:
${p.tasks.map((t, i) => `${i + 1}. ${t.name.replace(/^Task \d+:\s*/, '')}`).join('\n')}
Required interfaces/content structure:
${bullets(p.interfaces, '- (as stated in the task actions)')}
Edge/error cases:
${bullets(p.edge_cases, '- (as stated in the task actions)')}
Verification criteria:
${bullets(p.verification_commands)}
Final result format:
- Status: Complete | Partial | Failed | BLOCKED
- Files changed
- Verification commands and outputs
- Decisions made
- Issues/errors
</execution_contract>

<stop_gates>
Emit \`BLOCKED\` and stop instead of guessing when:
- A read target listed in \`<context>\` or \`<execution_contract>\` is missing or unreadable.
- Required source evidence contradicts the plan.
- Completing the task requires a file not listed in \`files_modified\`.
- Any instruction conflicts with \`files_forbidden\`, authority boundaries, control mode, or user_setup.
- An API/type/schema/validation/architecture decision is not specified.
- Verification commands are missing, non-deterministic, fail after one focused fix attempt, or cannot run in the environment.
</stop_gates>

<recovery>
After compaction, interruption, or context loss:
1. Re-read this PLAN.md, the phase CONTEXT.md, and any SUMMARY artifact for this plan.
2. Run \`git diff --stat\` and inspect \`git diff\` for every file already changed.
3. Compare changed files against \`files_modified\` and \`files_forbidden\`; if any unapproved change exists, emit \`BLOCKED\`.
4. Re-run completed task verification commands before continuing.
5. Continue only from the next unverified task; do not rely on memory-only claims.
</recovery>

<tasks>

${tasks}

</tasks>

<verification>
Before declaring plan complete:
${p.verification_commands.map(c => `- [ ] \`${c}\` exits 0`).join('\n')}
- [ ] Every planned task is completed, blocked with evidence, or escalated; no planned work is self-deferred.
</verification>

<success_criteria>
${bullets(p.success_criteria ?? (fm.must_haves as { truths: string[] }).truths)}
</success_criteria>

<output>
After completion, create \`${dir}/${pad2(n)}-${pad2(p.plan)}-SUMMARY.md\`
</output>
`
}

export type ContextInput = { goal: string; requirements?: string[]; existing?: string[]; decisions?: string[] }

export function renderContext(n: number, name: string, c: ContextInput, plans: PlanInput[]): string {
  return `# Phase ${n}: ${name} -- Context

## Phase Goal
${c.goal}

## Requirements Covered
${bullets(c.requirements)}

## What Already Exists (from prior phases)
${bullets(c.existing)}

## Key Design Decisions
${bullets(c.decisions, '- Architecture proposals: skipped')}

## Plan Structure
${plans.map(p => `- **Plan ${pad2(n)}-${pad2(p.plan)} (Wave ${p.wave})**: ${p.title} -- ${p.objective.split('\n')[0]}`).join('\n')}
`
}

// ---- build -----------------------------------------------------------------

export type VerifyRun = { command: string; exitCode: number; passed: boolean; output: string }
export type SummaryInput = {
  planId: string
  title: string
  wave: number
  agent: string
  status: 'Complete' | 'Complete with Warnings' | 'Partial' | 'Failed' | 'BLOCKED'
  date: string
  tasks: { name: string; status: 'done' | 'partial' | 'failed' | 'skipped' }[]
  files: string[]
  verification: VerifyRun[]
  decisions: string[]
  issues: string[]
  escalations: Escalation[]
  handoff: { keyOutputs: string[]; decisions: string[]; openQuestions: string[]; conventions: string[] }
  requirements: string[]
  error?: string
  tokens?: string
  failure?: { kind: string; reason: string; retried?: boolean; remediated?: boolean }
}

const failureLine = (f: NonNullable<SummaryInput['failure']>) =>
  `**Failure Class**: ${f.kind}${f.remediated ? ' (auto-remediated: one retry passed)' : f.retried ? ' (after one automatic ENVIRONMENT retry)' : ''} — ${f.reason}`

export function renderSummary(s: SummaryInput): string {
  const lines = [
    `# Plan ${s.planId} Summary: ${s.title}`,
    '',
    '## Result',
    `**Status**: ${s.status}`,
    `**Wave**: ${s.wave}`,
    `**Agent**: ${s.agent}`,
    `**Completed**: ${s.date}`,
    ...(s.failure ? [failureLine(s.failure)] : []),
    '',
    '## Completed Tasks',
    ...s.tasks.map((t, i) => `- [${t.status === 'done' ? 'x' : ' '}] Task ${i + 1}: ${t.name.replace(/^Task \d+:\s*/, '')} (${t.status})`),
    '',
    '## Files Modified',
    bullets(s.files.map(f => `\`${f}\``)),
    '',
    '## Verification Results',
    s.verification.length ? `${s.verification.filter(v => v.passed).length}/${s.verification.length} verification commands passed (run by Triad after the agent finished).` : 'No verification commands declared.',
    '',
    '## Verification Commands',
    '| Command | Exit Code | Result |',
    '|---------|-----------|--------|',
    ...s.verification.map(v => `| \`${v.command.replace(/\|/g, '\\|')}\` | ${v.exitCode} | ${v.passed ? 'PASS' : 'FAIL'} |`),
    '',
    '## Key Decisions',
    bullets(s.decisions),
    '',
    '## Issues Encountered',
    bullets(s.issues),
    '',
    '## Escalations',
    renderEscalations(s.escalations),
    '',
    '## Handoff Context',
    `- **Key outputs**: ${s.handoff.keyOutputs.join('; ') || '(none)'}`,
    `- **Decisions made**: ${s.handoff.decisions.join('; ') || '(none)'}`,
    `- **Open questions**: ${s.handoff.openQuestions.join('; ') || '(none)'}`,
    `- **Conventions established**: ${s.handoff.conventions.join('; ') || '(none)'}`,
    '',
    '## Requirements Covered',
    bullets(s.requirements),
  ]
  if (s.error) lines.push('', '## Error Details', s.error)
  const failed = s.verification.filter(v => !v.passed)
  if (failed.length) lines.push('', '### Failed verification output', ...failed.map(v => `\`${v.command}\`\n\`\`\`\n${v.output.slice(-1500)}\n\`\`\``))
  if (s.tokens) lines.push('', '## Token Usage', s.tokens)
  return lines.join('\n') + '\n'
}

export const commitPlan = (prefix: string, planId: string, title: string, n: number, phaseName: string, wave: number, reqs: string[]) =>
  `feat(${prefix}): execute plan ${planId} — ${title}\n\nPhase ${n}: ${phaseName}\nWave: ${wave}\nRequirements: ${reqs.join(', ') || 'none'}`

export const commitWave = (prefix: string, wave: number, n: number, ok: number, total: number, done: number, all: number) =>
  `chore(${prefix}): update state after wave ${wave} of phase ${n}\n\n${ok}/${total} plans completed\nProgress: ${done}/${all} (${all ? Math.floor((done / all) * 100) : 0}%)`

export const commitPhase = (prefix: string, n: number, name: string) => `chore(${prefix}): complete phase ${n} execution — ${name}`

export { slugify }
