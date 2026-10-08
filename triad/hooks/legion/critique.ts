// Plan critique, mechanical part (plan-critique R1-R3, same-wave overlap,
// harness sections, task cap, schema). The judgment part (pre-mortem,
// assumption hunt) is a Sonnet pass the plan command runs on top.
import { planWaves, sharedFiles, overlaps, verificationCommands, type Plan } from './planning.ts'

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
    if (!fm.verification_commands.length) {
      // Older Legion plans carry their checks in the tasks (<automated> or "> verification:"); those still run.
      if (verificationCommands(p).length) add(p.id, 'WARNING', 'R1', 'no plan-level verification_commands; the task-level checks are run instead')
      else add(p.id, 'BLOCKER', 'R1', 'verification_commands is missing or empty')
    }
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
    // plan-critique: an undecided action is REWORK; deferring work to a later phase is a warning.
    const undecided = p.body.match(/\b(TBD|decide later|to be decided|as needed|executor (should|can|will) decide)\b/i)
    if (undecided) add(p.id, 'BLOCKER', 'decisions', `the plan leaves a decision open ("${undecided[0]}"); make it now`)
    else if (/\b(leave (this )?for later|future phase)\b/i.test(p.body)) add(p.id, 'WARNING', 'decisions', 'the plan defers work to a later phase')
    // plan-critique: a vague action ("implement as appropriate") is not decision-complete.
    const vague = [...p.body.matchAll(/<action>([\s\S]*?)<\/action>/g)].map(m => m[1]!.match(/\b(as appropriate|appropriately|where (appropriate|relevant)|update (the )?relevant|and so on|etc\.|verify manually|use existing helpers)/i)).find(Boolean)
    if (vague) add(p.id, 'BLOCKER', 'decisions', `a task action is vague ("${vague[0]}"); name the files, functions and behaviour`)
    if (!fm.agents.length && fm.autonomous !== true) add(p.id, 'BLOCKER', 'agents', 'no agents named')
  }
  const w = planWaves(plans, knownAgents)
  for (const e of w.errors) add('phase', 'BLOCKER', 'waves', e)
  for (const wave of w.waves) {
    const ps = wave.plans
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const s = sharedFiles(ps[i]!.fm.files_modified, ps[j]!.fm.files_modified)
      if (s.length) add(`${ps[i]!.id}+${ps[j]!.id}`, 'BLOCKER', 'overlap', `wave ${wave.wave}: both modify ${s.join(', ')}`)
    }
  }
  const blockers = issues.filter(i => i.severity === 'BLOCKER').length
  const warnings = issues.length - blockers
  const verdict: Verdict = blockers ? 'REWORK' : warnings ? 'CAUTION' : 'PASS'
  return { issues, verdict }
}

// CRITIQUE.md in the phase directory (plan-critique Section 3 and the
// completion gate): the summary, schema conformance, a per-plan verdict with
// the rule that fired, and recommended actions. The pre-mortem and assumption
// counts belong to the judgment pass and are left for it to fill.
export function critiqueDoc(r: { issues: Issue[]; verdict: Verdict }, plans: Plan[], phase: number, name: string, date: string): string {
  const of = (id: string) => r.issues.filter(i => i.plan === id || i.plan.split('+').includes(id))
  const cell = (id: string, rule: string, none = 'PASS') => { const is = of(id).filter(i => i.rule === rule); return is.some(i => i.severity === 'BLOCKER') ? 'BLOCKER' : is.length ? 'WARNING' : none }
  const planVerdict = (id: string): [string, string] => {
    const is = of(id)
    const b = is.find(i => i.severity === 'BLOCKER')
    if (b) return ['REWORK', `${b.rule}: ${b.message}`]
    if (is.length) return ['CAUTION', `${is[0]!.rule}: ${is[0]!.message}`]
    return ['OK', 'no rule fired']
  }
  const blockers = r.issues.filter(i => i.severity === 'BLOCKER')
  return [
    `## Plan Critique Summary — Phase ${phase}: ${name}`, '',
    `**Verdict**: ${r.verdict}`, `**Date**: ${date}`, '',
    '| Metric | Count |', '|--------|-------|',
    '| Pre-mortem failure scenarios | (judgment pass) |', '| Critical risks | (judgment pass) |', '| Assumptions extracted | (judgment pass) |',
    `| Schema and wave blockers | ${blockers.length} |`, `| Warnings | ${r.issues.length - blockers.length} |`, `| Merged findings | ${r.issues.length} |`, '',
    '### Schema Conformance',
    '| Plan | verification_commands | files_forbidden | expected_artifacts | Status |', '|------|----------------------|----------------|--------------------|--------|',
    ...plans.map(p => `| ${p.id} | ${cell(p.id, 'R1')} | ${cell(p.id, 'R2')} | ${cell(p.id, 'R3')} | ${planVerdict(p.id)[0]} |`), '',
    ...(r.issues.some(i => i.rule === 'overlap' || i.rule === 'waves') ? ['### Wave Overlap', ...r.issues.filter(i => i.rule === 'overlap' || i.rule === 'waves').map(i => `- [${i.severity}] ${i.plan}: ${i.message}`), ''] : []),
    '### Plan Verdicts', '| Plan | Verdict | Rule fired |', '|------|---------|------------|',
    ...plans.map(p => { const [v, why] = planVerdict(p.id); return `| ${p.id} | ${v} | ${why.replace(/\|/g, '/')} |` }), '',
    '### Findings', ...(r.issues.length ? r.issues.map(i => `- [${i.severity}] ${i.plan} ${i.rule}: ${i.message}`) : ['(none)']), '',
    '### Recommended Actions',
    ...(r.issues.length ? [...blockers, ...r.issues.filter(i => i.severity === 'WARNING')].map((i, k) => `${k + 1}. ${i.plan}: fix ${i.rule} — ${i.message}`) : ['1. Proceed to execution.']),
    '',
  ].join('\n')
}

export function renderCritique(r: { issues: Issue[]; verdict: Verdict }): string {
  if (!r.issues.length) return 'Mechanical critique: PASS (no issues).'
  return [`Mechanical critique: ${r.verdict}`, ...r.issues.map(i => `- [${i.severity}] ${i.plan} ${i.rule}: ${i.message}`)].join('\n')
}
