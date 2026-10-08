// `/triad status`: the progress dashboard and next action, in code (no model).
import { getSection, progressBar, type Roadmap, type State } from './planning.ts'
import type { Project } from './io.ts'

export type Next = { command: string; why: string; phase?: number }

export function nextAction(p: Project, phaseHasPlans: (n: number) => boolean, phaseHasSummaries: (n: number) => boolean): Next {
  if (p.project === undefined) return { command: '/triad:start', why: 'no .planning/PROJECT.md' }
  if (!p.roadmap) return { command: '/triad:start', why: 'no .planning/ROADMAP.md' }
  const phases = phaseNumbers(p.roadmap)
  const n = p.state?.phase ?? 0
  const s = `${p.state?.phaseNote ?? ''} ${p.state?.status ?? ''}`.toLowerCase()
  const row = p.roadmap.rows.find(r => r.phase === n)
  const after = phases.find(x => x > n)
  if (n === 0 || /not started/.test(s)) return { command: `/triad:plan ${phases[0] ?? 1}`, phase: phases[0] ?? 1, why: 'the project has not started a phase' }
  if (/escalated|stale|failed/.test(s)) return { command: `/triad:review --phase ${n}`, phase: n, why: `phase ${n} needs attention (${p.state?.status}); fix the open findings, use /triad:quick, or re-plan` }
  if (/pending review|under review|partial|\bexecuted\b/.test(s)) return { command: '/triad:review', phase: n, why: `phase ${n} is built and not yet reviewed` }
  if (/executing/.test(s)) return { command: '/triad:build', phase: n, why: `phase ${n} build was interrupted; build resumes at the first plan without a summary` }
  if (/planned/.test(s) || (phaseHasPlans(n) && !phaseHasSummaries(n) && !/complete/.test(s))) return { command: '/triad:build', phase: n, why: `phase ${n} is planned` }
  if (/complete/.test(s) || /complete|shipped/i.test(row?.status ?? '')) {
    return after !== undefined ? { command: `/triad:plan ${after}`, phase: after, why: `phase ${n} is complete` } : { command: '', why: 'all phases complete — project finished' }
  }
  if (/pending|not started/i.test(row?.status ?? '') || !phaseHasPlans(n)) return { command: `/triad:plan ${n}`, phase: n, why: `phase ${n} has no plans yet` }
  return { command: '/triad:build', phase: n, why: `phase ${n} has plans` }
}

export const phaseNumbers = (r: Roadmap) => [...new Set([...r.rows.map(x => x.phase), ...r.phases.map(x => x.phase)])].sort((a, b) => a - b)

export function totals(r: Roadmap): { done: number; total: number } {
  return r.rows.reduce((t, x) => ({ done: t.done + (x.completed ?? 0), total: t.total + (x.plans ?? 0) }), { done: 0, total: 0 })
}

const marker = (status: string, checked?: boolean) => {
  const s = status.toLowerCase()
  if (checked || /complete|shipped/.test(s)) return '[x]'
  if (/executed|in progress|partial/.test(s)) return '[~]'
  if (/planned/.test(s)) return '[-]'
  return '[ ]'
}

export function renderStatus(p: Project, next: Next): string {
  if (p.project === undefined) return 'No Legion project found (.planning/PROJECT.md is missing). Run /triad:start to begin.'
  const name = p.project.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Project'
  const out = [`${name}`, '']
  const st: State | undefined = p.state
  if (st) {
    out.push(`Position: Phase ${st.phase ?? '?'}${st.total ? ` of ${st.total}` : ''}${st.phaseNote ? ` (${st.phaseNote})` : ''}`)
    if (st.status) out.push(`Status: ${st.status}`)
    if (st.lastActivity) out.push(`Last activity: ${st.lastActivity}`)
  }
  if (p.roadmap) {
    const t = totals(p.roadmap)
    out.push('', progressBar(t.done, t.total), '', 'Phases:')
    const names = new Map(p.roadmap.phases.map(x => [x.phase, x]))
    for (const n of phaseNumbers(p.roadmap)) {
      const row = p.roadmap.rows.find(r => r.phase === n)
      const info = names.get(n)
      out.push(`  ${marker(row?.status ?? '', info?.checked)} Phase ${n}: ${info?.name ?? row?.name ?? ''}${row ? ` — ${row.completed ?? 0}/${row.plans ?? '?'} plans, ${row.status}` : ''}`)
    }
  }
  const decisions = p.stateText ? (getSection(p.stateText, /^##\s+Recent Decisions/i) ?? '').split('\n').filter(l => /^\s*[-*]\s/.test(l)).slice(-3) : []
  if (decisions.length) out.push('', 'Recent decisions:', ...decisions.map(d => '  ' + d.trim()))
  if (p.settingsWarnings.length) out.push('', ...p.settingsWarnings.map(w => `warning: ${w}`))
  out.push('', `Control mode: ${p.settings.control_mode}; commit prefix: ${p.settings.execution.commit_prefix}`)
  out.push('', next.command ? `Next: ${next.command} — ${next.why}` : `Next: ${next.why}`)
  return out.join('\n')
}
