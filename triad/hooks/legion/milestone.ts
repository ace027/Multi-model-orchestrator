// Milestones (milestone-tracker, /milestone) in code: the ROADMAP `## Milestones`
// section, validation, derived status and metrics, the dashboard, and the
// complete and archive steps. Grouping phases into milestones, the one-line
// deliverables and the decisions are the model's; it passes them in.
import { loadPhase, loadProject, today, type Io, type Project } from './io.ts'
import { appendToSection, getSection, pad2, setRoadmapRow, type Roadmap } from './planning.ts'
import { commit } from './build.ts'

export type Milestone = { n: number; name: string; start: number; end: number; goal: string; status: string; completed?: string }

export function parseMilestones(roadmap: string): Milestone[] {
  const body = getSection(roadmap, /^##\s+Milestones\s*$/)
  if (!body) return []
  const out: Milestone[] = []
  for (const m of body.matchAll(/^###\s+Milestone\s+(\d+):\s*(.+)$([\s\S]*?)(?=^###\s|(?![\s\S]))/gm)) {
    const f = (k: string) => m[3]!.match(new RegExp(`^-\\s+\\*\\*${k}\\*\\*:\\s*(.+)$`, 'm'))?.[1]?.trim()
    const r = (f('Phases') ?? '').match(/(\d+)\s*(?:-|–|to)\s*(\d+)|^(\d+)$/)
    out.push({ n: Number(m[1]), name: m[2]!.trim(), start: Number(r?.[1] ?? r?.[3] ?? 0), end: Number(r?.[2] ?? r?.[3] ?? 0), goal: f('Goal') ?? '', status: f('Status') ?? 'Pending', completed: f('Completed') })
  }
  return out
}

export function validateMilestones(ms: Milestone[], maxPhase: number): string[] {
  const errs: string[] = []
  ms.forEach((m, i) => { if (m.n !== i + 1) errs.push(`Milestone numbers must be sequential from 1 (found Milestone ${m.n} at position ${i + 1}).`) })
  for (const m of ms) if (m.start < 1 || m.end > maxPhase || m.start > m.end) errs.push(`Milestone ${m.n} references Phases ${m.start}-${m.end}, but only Phases 1-${maxPhase} exist in ROADMAP.md. Adjust the milestone range.`)
  const owner = new Map<number, number>()
  for (const m of ms) for (let p = m.start; p <= Math.min(m.end, maxPhase); p++) {
    if (owner.has(p)) errs.push(`Phase ${p} is covered by both Milestone ${owner.get(p)} and Milestone ${m.n}. Phase ranges must not overlap.`)
    else owner.set(p, m.n)
  }
  let gapStart: number | undefined
  for (let p = 1; p <= maxPhase + 1; p++) {
    const covered = p <= maxPhase && owner.has(p)
    if (!covered && p <= maxPhase && gapStart === undefined) gapStart = p
    if ((covered || p > maxPhase) && gapStart !== undefined) {
      errs.push(`Phases ${gapStart}-${p - 1} are not covered by any milestone. All phases must belong to exactly one milestone.`)
      gapStart = undefined
    }
  }
  return errs
}

const isComplete = (s: string) => /^complete/i.test(s.trim())
const nameOf = (r: Roadmap, n: number) => r.rows.find(x => x.phase === n)?.name || r.phases.find(x => x.phase === n)?.name || ''

export function deriveStatus(m: Milestone, r: Roadmap): string {
  if (/archived/i.test(m.status)) return 'Archived'
  const rows = r.rows.filter(x => x.phase >= m.start && x.phase <= m.end)
  if (rows.length && rows.length === m.end - m.start + 1 && rows.every(x => isComplete(x.status))) return 'Complete'
  if (rows.some(x => x.status.trim() && !/^(pending|not started|-)$/i.test(x.status.trim()))) return 'In Progress'
  return 'Pending'
}

export function metrics(m: Milestone, r: Roadmap, requirements?: string): { phasePct: number; planPct: number; bar: string; plans: [number, number]; reqs?: [number, number] } {
  const rows = r.rows.filter(x => x.phase >= m.start && x.phase <= m.end)
  const complete = rows.filter(x => isComplete(x.status)).length
  const done = rows.reduce((s, x) => s + (x.completed ?? 0), 0)
  const all = rows.reduce((s, x) => s + (x.plans ?? 0), 0)
  const planPct = all ? Math.floor(done / all * 100) : 0
  const filled = Math.floor(planPct / 10)
  let reqs: [number, number] | undefined
  if (requirements) {
    const ids = new Set(r.phases.filter(p => p.phase >= m.start && p.phase <= m.end).flatMap(p => p.requirements.match(/[A-Z][A-Z0-9]*-\d+/g) ?? []))
    const lines = requirements.split('\n').filter(l => [...ids].some(id => l.includes(id)) && /\[[ xX]\]|\|/.test(l))
    if (ids.size) reqs = [lines.filter(l => /\[[xX]\]/.test(l)).length, ids.size]
  }
  return { phasePct: Math.floor(complete / (m.end - m.start + 1) * 100), planPct, bar: `[${'#'.repeat(filled)}${'.'.repeat(10 - filled)}] ${planPct}%`, plans: [done, all], reqs }
}

function renderSection(ms: Milestone[]): string {
  return ms.map(m => [
    `### Milestone ${m.n}: ${m.name}`, `- **Phases**: ${m.start}-${m.end}`, `- **Goal**: ${m.goal}`, `- **Status**: ${m.status}`,
    ...(m.completed && /complete|archived/i.test(m.status) ? [`- **Completed**: ${m.completed}`] : []),
  ].join('\n')).join('\n\n')
}

// Writes the section after Phase Details (before Progress), or replaces it.
export function writeMilestones(roadmap: string, ms: Milestone[]): string {
  const body = renderSection(ms)
  if (/^##\s+Milestones\s*$/m.test(roadmap)) {
    const lines = roadmap.split('\n')
    const s = lines.findIndex(l => /^##\s+Milestones\s*$/.test(l))
    let e = s + 1
    while (e < lines.length && !/^#{1,2}\s/.test(lines[e]!)) e++
    lines.splice(s + 1, e - s - 1, '', body, '')
    return lines.join('\n')
  }
  const at = roadmap.search(/^##\s+Progress\b/m)
  return at < 0 ? roadmap.replace(/\n*$/, '\n\n') + `## Milestones\n\n${body}\n` : `${roadmap.slice(0, at)}## Milestones\n\n${body}\n\n${roadmap.slice(at)}`
}

// Recomputes every status (Complete gets today's date) and writes the section.
function refresh(p: Project, ms: Milestone[], date: string): Milestone[] {
  return ms.map(m => {
    const status = deriveStatus(m, p.roadmap!)
    return { ...m, status, completed: status === 'Complete' ? m.completed ?? date : m.completed }
  })
}

export async function milestoneStatus(io: Io): Promise<string> {
  const p = await loadProject(io)
  if (p.project === undefined || !p.roadmapText || !p.roadmap) return 'No Triad project found in this directory. Run `/triad:start` to begin.'
  const name = p.project.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? 'Project'
  const ms = parseMilestones(p.roadmapText)
  if (!ms.length) return `# ${name} — Milestones\n\nNo milestones defined yet. Ask the user whether to define milestones (group the phases with milestone action define).`
  if (!p.roadmap.rows.length) return 'Cannot calculate milestone status — ROADMAP.md Progress table is empty or malformed. Run `/triad:plan` to populate phases first.'
  const reqText = await io.read('.planning/REQUIREMENTS.md')
  const cur = refresh(p, ms, today(io))
  const lines = [`# ${name} — Milestones`, '', '| # | Milestone | Phases | Progress | Status |', '|---|-----------|--------|----------|--------|']
  for (const m of cur) lines.push(`| ${m.n} | ${m.name} | ${m.start}-${m.end} | ${metrics(m, p.roadmap, reqText).bar} | ${m.status}${m.completed && /complete|archived/i.test(m.status) ? ` (${m.completed})` : ''} |`)
  const errs = validateMilestones(cur, Math.max(...p.roadmap.rows.map(r => r.phase)))
  if (errs.length) lines.push('', 'Problems:', ...errs.map(e => `- ${e}`))
  const now = cur.find(m => m.status === 'In Progress') ?? cur.find(m => m.status === 'Pending')
  if (now) {
    const mm = metrics(now, p.roadmap, reqText)
    lines.push('', `## Current: Milestone ${now.n} — ${now.name}`, `**Goal**: ${now.goal}`, '', '| Phase | Name | Plans | Status |', '|-------|------|-------|--------|',
      ...p.roadmap.rows.filter(r => r.phase >= now.start && r.phase <= now.end).map(r => `| ${r.phase} | ${nameOf(p.roadmap!, r.phase)} | ${r.completed ?? 0}/${r.plans ?? 0} | ${r.status} |`))
    if (mm.reqs) lines.push('', `${mm.reqs[0]}/${mm.reqs[1]} requirements satisfied`)
  }
  const actions = ['view', 'redefine']
  for (const m of cur) {
    if (m.status === 'Complete' && !(await io.read(`.planning/milestones/MILESTONE-${m.n}.md`))) actions.push(`complete ${m.n}`)
    else if (m.status === 'Complete') actions.push(`archive ${m.n}`)
  }
  lines.push('', `Available actions: ${actions.join(', ')}`)
  return lines.join('\n')
}

export async function milestoneDefine(io: Io, groups: { name: string; start: number; end: number; goal: string }[]): Promise<string> {
  const p = await loadProject(io)
  if (!p.roadmapText || !p.roadmap) return 'No ROADMAP.md. Run `/triad:start` first.'
  const maxPhase = Math.max(0, ...p.roadmap.rows.map(r => r.phase), ...p.roadmap.phases.map(x => x.phase))
  const old = parseMilestones(p.roadmapText)
  const ms = refresh(p, groups.map((g, i) => ({ n: i + 1, name: g.name, start: g.start, end: g.end, goal: g.goal, status: 'Pending', completed: old.find(o => o.start === g.start && o.end === g.end)?.completed })), today(io))
  const errs = validateMilestones(ms, maxPhase)
  if (errs.length) return `Milestones not written:\n- ${errs.join('\n- ')}`
  await io.write('.planning/ROADMAP.md', writeMilestones(p.roadmapText, ms))
  return `Milestones defined in ROADMAP.md. ${ms.length} milestones covering ${maxPhase} phases.\n${ms.map(m => `- Milestone ${m.n}: ${m.name} (Phases ${m.start}-${m.end}) — ${m.status}`).join('\n')}`
}

// Facts for the summary: plans, requirements, key files from the phases' summaries.
export async function milestoneFacts(io: Io, n: number): Promise<string> {
  const p = await loadProject(io)
  const m = parseMilestones(p.roadmapText ?? '').find(x => x.n === n)
  if (!m || !p.roadmap) return `No Milestone ${n} in ROADMAP.md.`
  const out = [`Milestone ${n}: ${m.name} (Phases ${m.start}-${m.end}) — ${deriveStatus(m, p.roadmap)}`, `Goal: ${m.goal}`]
  for (let ph = m.start; ph <= m.end; ph++) {
    const f = await loadPhase(io, p, ph)
    const row = p.roadmap.rows.find(r => r.phase === ph)
    out.push(`\n## Phase ${ph}: ${nameOf(p.roadmap, ph)} (${row?.status ?? 'unknown'}, ${row?.completed ?? 0}/${row?.plans ?? 0} plans)`)
    for (const [id, s] of Object.entries(f.summaries)) out.push(`- ${id}: ${(s.match(/^#\s+(.+)$/m)?.[1] ?? '').trim()}`)
  }
  const decisions = getSection(p.stateText ?? '', /^##\s+(Recent )?Decisions/i)
  if (decisions) out.push('\n## STATE.md decisions', decisions)
  return out.join('\n')
}

export async function milestoneComplete(io: Io, n: number, input: { deliverables?: Record<string, string>; decisions?: string[]; overwrite?: boolean }): Promise<string> {
  const p = await loadProject(io)
  if (!p.roadmapText || !p.roadmap || !p.stateText) return 'No ROADMAP.md/STATE.md.'
  const ms = parseMilestones(p.roadmapText)
  const m = ms.find(x => x.n === n)
  if (!m) return `No Milestone ${n} in ROADMAP.md.`
  const rows = p.roadmap.rows.filter(r => r.phase >= m.start && r.phase <= m.end)
  const open = rows.filter(r => !isComplete(r.status))
  if (open.length || rows.length < m.end - m.start + 1) return `Cannot complete Milestone ${n} — the following phases are not yet complete: ${open.map(r => `Phase ${r.phase} (${r.status})`).join(', ') || 'phases missing from the progress table'}`
  const path = `.planning/milestones/MILESTONE-${n}.md`
  if ((await io.read(path)) !== undefined && !input.overwrite) return `Milestone summary already exists at ${path}. Ask the user: overwrite with fresh metrics (call again with overwrite: true), or skip summary generation.`
  const date = today(io)
  const mt = metrics(m, p.roadmap, await io.read('.planning/REQUIREMENTS.md'))
  const files = new Set<string>()
  const warnings: string[] = []
  for (let ph = m.start; ph <= m.end; ph++) {
    const f = await loadPhase(io, p, ph)
    for (const s of Object.values(f.summaries)) for (const x of s.matchAll(/^\s*-\s+`([^`]+\.[\w]+)`/gm)) files.add(x[1]!)
    if (!f.review) warnings.push(`Phase ${ph} has no REVIEW.md`)
  }
  const doc = [
    `# Milestone ${n}: ${m.name} — Summary`, '', '## Completed', date, '', '## Goal', m.goal, '', '## Metrics', '| Metric | Value |', '|--------|-------|',
    `| Phases | ${m.end - m.start + 1} |`, `| Plans completed | ${mt.plans[0]}/${mt.plans[1]} |`, `| Requirements satisfied | ${mt.reqs ? `${mt.reqs[0]}/${mt.reqs[1]}` : 'n/a'} |`, `| Key files | ${files.size} created/modified |`,
    '', '## Phase Outcomes', '| Phase | Name | Plans | Key Deliverable |', '|-------|------|-------|-----------------|',
    ...rows.map(r => `| ${r.phase} | ${nameOf(p.roadmap!, r.phase)} | ${r.completed ?? 0}/${r.plans ?? 0} | ${input.deliverables?.[String(r.phase)] ?? ''} |`),
    '', '## Key Decisions', ...(input.decisions?.length ? input.decisions.map(d => `- ${d}`) : ['- (none recorded)']),
    '', '## Files Created', ...([...files].sort().map(f => `- ${f}`)), '', '## Archive Location', `.planning/archive/milestone-${n}/`, '',
  ].join('\n')
  await io.write(path, doc)
  const next = ms.map(x => (x.n === n ? { ...x, status: 'Complete', completed: x.completed ?? date } : x))
  await io.write('.planning/ROADMAP.md', writeMilestones(p.roadmapText, next))
  await io.write('.planning/STATE.md', appendToSection(p.stateText, '## Milestones', `- Milestone ${n}: ${m.name} — Complete (${date})`))
  const err = p.settings.execution.auto_commit === false ? undefined : await commit(io, ['.planning/milestones', '.planning/ROADMAP.md', '.planning/STATE.md'],
    `chore(${p.settings.execution.commit_prefix}): complete milestone ${n} — ${m.name}\n\nPhases ${m.start}-${m.end}: ${m.end - m.start + 1} phases, ${mt.plans[1]} plans\nRequirements: ${mt.reqs ? mt.reqs[0] : 0} satisfied\nSummary: ${path}`)
  return [`Milestone ${n}: ${m.name} — Complete!`, `Summary: ${path}`, ...warnings.map(w => `Warning: ${w}`), ...(err ? [`Warning: ${err}`] : []), `Next: archive it (milestone action archive ${n}) to move its phases to .planning/archive/milestone-${n}/.`].join('\n')
}

export async function milestoneArchive(io: Io, n: number): Promise<string> {
  const p = await loadProject(io)
  if (!p.roadmapText || !p.roadmap || !p.stateText) return 'No ROADMAP.md/STATE.md.'
  const ms = parseMilestones(p.roadmapText)
  const m = ms.find(x => x.n === n)
  if (!m) return `No Milestone ${n} in ROADMAP.md.`
  if (/archived/i.test(m.status)) return `Milestone ${n} is already archived at .planning/archive/milestone-${n}/. No action needed.`
  if (deriveStatus(m, p.roadmap) !== 'Complete') return `Milestone ${n} is not complete. Complete it first.`
  const summary = `.planning/milestones/MILESTONE-${n}.md`
  const sumText = await io.read(summary)
  if (sumText === undefined) return `Milestone ${n} has no summary yet. Run milestone action complete ${n} first.`
  const date = today(io)
  const dest = `.planning/archive/milestone-${n}`
  const moved: string[] = []
  const failed: string[] = []
  await io.run(['mkdir', '-p', dest])
  let roadmap = p.roadmapText
  let state = p.stateText
  for (let ph = m.start; ph <= m.end; ph++) {
    const dir = p.phaseDirs.find(d => d.startsWith(`${pad2(ph)}-`) || d.startsWith(`${ph}-`))
    if (!dir) { failed.push(`Phase ${ph} has no directory (nothing to move)`); continue }
    let r = await io.run(['git', 'mv', `.planning/phases/${dir}`, `${dest}/${dir}`])
    if (r.exitCode !== 0) r = await io.run(['mv', `.planning/phases/${dir}`, `${dest}/${dir}`])
    if (r.exitCode !== 0 || (await io.list(`${dest}/${dir}`)).length === 0) { failed.push(`Failed to move .planning/phases/${dir}/ to ${dest}/${dir}/. Check filesystem permissions.`); continue }
    moved.push(dir)
    roadmap = setRoadmapRow(roadmap, ph, { status: 'Complete (Archived)' })
    state = state.replace(new RegExp(`^## Phase ${ph} Results\\s*$[\\s\\S]*?(?=^## |(?![\\s\\S]))`, 'm'), `## Phase ${ph} Results — Archived\nSee ${summary} and ${dest}/${dir}/\n\n`)
  }
  roadmap = writeMilestones(roadmap, parseMilestones(roadmap).map(x => (x.n === n ? { ...x, status: 'Archived', completed: x.completed ?? date } : x)))
  state = state.replace(new RegExp(`^(- Milestone ${n}: .*?) — Complete \\(([^)]+)\\)`, 'm'), `$1 — Archived (${date})`)
  await io.write('.planning/ROADMAP.md', roadmap)
  await io.write('.planning/STATE.md', state)
  await io.write(summary, sumText.replace(/(## Archive Location\n[^\n]*\n)/, `$1Archived on ${date}\n`))
  const err = p.settings.execution.auto_commit === false ? undefined : await commit(io, ['.planning'],
    `chore(${p.settings.execution.commit_prefix}): archive milestone ${n} — ${m.name}\n\nPhases moved to ${dest}/\nSTATE.md and ROADMAP.md updated`)
  return [`Milestone ${n}: ${m.name} — Archived!`, `Phases: ${moved.join(', ') || 'none moved'} → ${dest}/`, `Summary: ${summary}`, ...failed.map(f => `Warning: ${f}`), ...(err ? [`Warning: ${err}`] : [])].join('\n')
}
