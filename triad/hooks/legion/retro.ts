// /retro in code: scope resolution, evidence gathering and metrics; the model
// writes the five sections from this evidence, and retro_save appends RETRO.md.
import { loadPhase, loadProject, today, type Io } from './io.ts'
import { getSection, phaseDone } from './planning.ts'
import { parseMilestones } from './milestone.ts'
import { parseOutcomes, OUTCOMES, RETRO } from './memory.ts'
import { escalationsIn } from './build.ts'


export async function retroGather(io: Io, opts: { phase?: number; milestone?: number }): Promise<string> {
  const p = await loadProject(io)
  if (p.project === undefined || !p.roadmap) return 'No Triad project found in this directory. Run `/triad:start` to begin.'
  let phases: number[]
  let scope: string
  if (opts.milestone !== undefined) {
    const m = parseMilestones(p.roadmapText ?? '').find(x => x.n === opts.milestone)
    if (!m) return `No Milestone ${opts.milestone} in ROADMAP.md.`
    phases = Array.from({ length: m.end - m.start + 1 }, (_, i) => m.start + i)
    scope = `Milestone ${m.n} (${m.name}) — Phases ${m.start}-${m.end}`
  } else {
    const n = opts.phase ?? [...p.roadmap.rows].reverse().find(r => phaseDone(r.status))?.phase
    if (n === undefined) return 'No completed phase yet. Retrospectives run on completed work; run `/triad:review` first.'
    const row = p.roadmap.rows.find(r => r.phase === n)
    if (row && !phaseDone(row.status)) return `Phase ${n} is not yet complete (status: ${row.status}). Retrospectives run on completed work. Run \`/triad:review\` first.`
    phases = [n]
    scope = `Phase ${n}${row ? `: ${row.name}` : ''}`
  }
  const outcomes = parseOutcomes((await io.read(OUTCOMES)) ?? '').filter(o => phases.includes(o.phase))
  let plansDone = 0, reviews = 0, firstPass = 0, escalations = 0, blockers = 0
  const agents = new Set<string>()
  const files = new Set<string>()
  const evidence: string[] = []
  const warnings: string[] = []
  for (const n of phases) {
    const ph = await loadPhase(io, p, n)
    if (!ph.rel) { warnings.push(`Phase ${n} has no directory (archived phases are read from .planning/archive/)`); continue }
    evidence.push(`\n## Phase ${n} (${ph.dir})`)
    for (const plan of ph.plans) {
      for (const a of plan.fm.agents) agents.add(a)
      const s = ph.summaries[plan.id]
      if (!s) { warnings.push(`${plan.id} has no SUMMARY.md`); evidence.push(`- ${plan.id}: no summary`); continue }
      const status = s.match(/\*\*Status:?\*\*:?\s*(.+)$/im)?.[1]?.trim() ?? s.match(/^status:\s*(.+)$/im)?.[1]?.trim() ?? 'unknown'
      if (/complete/i.test(status)) plansDone++
      for (const f of s.matchAll(/^\s*-\s+`([^`]+)`/gm)) files.add(f[1]!)
      // Escalation table rows (| n | severity | ...) plus raw <escalation> blocks.
      const escRows = (getSection(s, /^##\s+Escalations/i) ?? '').split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l))
      const esc = escalationsIn(s)
      escalations += escRows.length + esc.length
      blockers += escRows.filter(l => /\|\s*blocker\s*\|/i.test(l)).length + esc.filter(e => e.severity === 'blocker').length
      const failedChecks = (s.match(/\bFAIL(ED)?\b/g) ?? []).length
      evidence.push(`- ${plan.id} (${plan.fm.agents[0] ?? '?'}, wave ${plan.fm.wave}): ${status}${failedChecks ? `, ${failedChecks} FAIL marks` : ''}`)
    }
    if (ph.review) {
      reviews++
      const cycles = Number(ph.review.match(/\*\*Cycles?(?: used)?:?\*\*:?\s*(\d+)/i)?.[1] ?? ph.review.match(/cycles?(?: used)?:\s*(\d+)/i)?.[1] ?? 1)
      if (cycles <= 1) firstPass++
      const verdict = ph.review.match(/^##\s+Result:\s*(.+)$/m)?.[1]?.trim() ?? ph.review.match(/\*\*(?:Verdict|Result|Status):?\*\*:?\s*(.+)$/im)?.[1]?.trim() ?? ''
      evidence.push(`- Review: ${cycles} cycle(s)${verdict ? `, ${verdict}` : ''}`)
      const findings = getSection(ph.review, /^##\s+(Findings|Deferred|Open)/i)
      if (findings) evidence.push(findings.split('\n').slice(0, 12).map(l => `  ${l}`).join('\n'))
    } else warnings.push(`Phase ${n} has no REVIEW.md`)
  }
  if (outcomes.length) evidence.push('\n## Outcome records', ...outcomes.map(o => `- ${o.id} ${o.plan} ${o.agent} ${o.task_type}: ${o.outcome} (importance ${o.importance}) — ${o.summary}`))
  const metrics = [
    `- Plans completed: ${plansDone}`,
    `- Review pass rate: ${firstPass}/${reviews} (${reviews ? Math.round(firstPass / reviews * 100) : 0}%)`,
    `- Escalations: ${escalations} (${blockers} blockers)`,
    `- Agents used: ${agents.size} (${[...agents].join(', ')})`,
    `- Files modified: ${files.size}`,
  ]
  const name = p.project.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Project'
  return [
    `Scope: ${scope}`, `Project: ${name}`, `Date: ${today(io)}`, '', '## Metrics (computed; copy into the report as is)', ...metrics,
    ...(warnings.length ? ['', 'Warnings:', ...warnings.map(w => `- ${w}`)] : []),
    '', '## Evidence', ...evidence,
    '', 'Write the report: # Retrospective: {scope}, **Project**, **Scope**, **Date**, then ## What Went Well, ## What Didn\'t Work, ## Patterns to Keep, ## Patterns to Drop, ## Action Items (| # | Action | Priority | Evidence |, priority High/Medium/Low), ## Metrics. Every finding cites a phase, plan or file from the evidence; patterns must recur. Then ask the user: save to memory, view only, or edit before saving.',
  ].join('\n')
}

export async function retroSave(io: Io, input: { scope: string; findings: string; action_items: string; metrics: string }): Promise<string> {
  const head = (await io.read(RETRO)) ?? '# Retrospective Log\n\nRetrospective findings from completed phases and milestones.\nReferenced by `/triad:plan` for continuous improvement.\n'
  const entry = `\n## ${input.scope} — ${today(io)}\n\n### Key Findings\n${input.findings.trim()}\n\n### Action Items\n${input.action_items.trim()}\n\n### Metrics\n${input.metrics.trim()}\n\n---\n`
  await io.write(RETRO, head.replace(/\n*$/, '\n') + entry)
  return `Saved to ${RETRO}. High-priority action items will appear as constraints in future /triad:plan runs.`
}

// The latest retro's action items, for planning (HIGH ones become constraints).
export async function latestRetro(io: Io): Promise<string | undefined> {
  const text = await io.read(RETRO)
  if (!text) return undefined
  const parts = text.split(/^## /m).slice(1)
  const last = parts[parts.length - 1]
  if (!last) return undefined
  const items = getSection(`## ${last}`, /^###\s+Action Items/) ?? ''
  return `Latest retrospective (${last.split('\n')[0]!.trim()}):\n${items}`
}
