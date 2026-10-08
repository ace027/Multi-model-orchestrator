// Plan critique, mechanical part (plan-critique R1-R3, same-wave overlap,
// harness sections, task cap, schema). The judgment part (pre-mortem,
// assumption hunt) is a Sonnet pass the plan command runs on top.
import { planWaves, sharedFiles, overlaps, type Plan } from './planning.ts'

export type Issue = { plan: string; severity: 'BLOCKER' | 'WARNING'; rule: string; message: string }
export type Verdict = 'PASS' | 'CAUTION' | 'REWORK'

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|cs|php|scala|sh|sql)$/

export function critique(plans: Plan[], maxTasks = 3, knownAgents?: Set<string>): { issues: Issue[]; verdict: Verdict } {
  const issues: Issue[] = []
  const add = (plan: string, severity: Issue['severity'], rule: string, message: string) => issues.push({ plan, severity, rule, message })
  for (const p of plans) {
    const fm = p.fm
    for (const e of p.normalizedErrors) add(p.id, 'BLOCKER', 'schema', `frontmatter ${e}`)
    if (p.normalized.length) add(p.id, 'WARNING', 'schema', `legacy frontmatter (${p.normalized.join('; ')})`)
    if (!fm.verification_commands.length) add(p.id, 'BLOCKER', 'R1', 'verification_commands is missing or empty')
    const touchesCode = fm.files_modified.some(f => CODE.test(f))
    if (fm.files_forbidden === undefined && touchesCode) add(p.id, 'WARNING', 'R2', 'files_forbidden is missing on a plan that touches code')
    for (const f of fm.files_modified) if ((fm.files_forbidden ?? []).some(x => overlaps(f, x))) add(p.id, 'BLOCKER', 'R2', `${f} is in both files_modified and files_forbidden`)
    if (!fm.expected_artifacts.length) add(p.id, 'WARNING', 'R3', 'expected_artifacts is missing')
    for (const a of fm.expected_artifacts) if (a.required && !fm.files_modified.some(f => overlaps(a.path, f))) add(p.id, 'WARNING', 'R3', `required artifact ${a.path} is not in files_modified`)
    for (const tag of ['execution_contract', 'stop_gates', 'recovery']) if (!p.body.includes(`<${tag}>`)) add(p.id, 'BLOCKER', 'harness', `<${tag}> section is missing`)
    if (p.body.includes('<execution_contract>') && !p.body.includes('read-before-write -> evidence-before-action -> minimal diff -> verify-before-report')) add(p.id, 'WARNING', 'harness', 'the execution contract lacks the harness line')
    if (p.body.includes('<stop_gates>') && !/BLOCKED/.test(p.body.split('<stop_gates>')[1] ?? '')) add(p.id, 'WARNING', 'harness', '<stop_gates> does not say BLOCKED')
    const tasks = (p.body.match(/<task\b/g) ?? []).length
    if (tasks > maxTasks) add(p.id, 'BLOCKER', 'size', `${tasks} tasks; the limit is ${maxTasks} per plan`)
    if (!tasks) add(p.id, 'WARNING', 'size', 'no <task> blocks')
    if (/\b(leave (this )?for later|future phase|TBD|to be decided|executor (should|can) decide)\b/i.test(p.body)) add(p.id, 'WARNING', 'decisions', 'the plan leaves a decision to the executor or defers work')
    if (!fm.agents.length && fm.autonomous !== true) add(p.id, 'BLOCKER', 'agents', 'no agents named')
  }
  const w = planWaves(plans, knownAgents)
  for (const e of w.errors) add('phase', 'BLOCKER', 'waves', e)
  for (const wave of w.waves) {
    const ps = wave.plans
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const s = sharedFiles(ps[i].fm.files_modified, ps[j].fm.files_modified)
      if (s.length) add(`${ps[i].id}+${ps[j].id}`, 'BLOCKER', 'overlap', `wave ${wave.wave}: both modify ${s.join(', ')}`)
    }
  }
  const blockers = issues.filter(i => i.severity === 'BLOCKER').length
  const warnings = issues.length - blockers
  const verdict: Verdict = blockers ? 'REWORK' : warnings ? 'CAUTION' : 'PASS'
  return { issues, verdict }
}

export function renderCritique(r: { issues: Issue[]; verdict: Verdict }): string {
  if (!r.issues.length) return 'Mechanical critique: PASS (no issues).'
  return [`Mechanical critique: ${r.verdict}`, ...r.issues.map(i => `- [${i.severity}] ${i.plan} ${i.rule}: ${i.message}`)].join('\n')
}
