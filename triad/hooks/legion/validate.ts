// `/triad validate [--ci] [--fix]`: Legion's validate command in code (no model).
// Where Legion's own command contradicts its writers (PARITY, contract notes),
// it checks what Legion actually writes: `NN-PP-PLAN.md` files, the template's
// progress table, the statuses build and start produce.
import { loadPhase, loadProject, type Io } from './io.ts'
import { getField, setRoadmapRow } from './planning.ts'
import { ROSTER } from './registry.ts'
import { parseYaml } from './yaml.ts'
import { phaseNumbers } from './status.ts'

export type Level = 'PASS' | 'WARN' | 'FAIL'
export type Check = { area: string; level: Level; message: string }

const STATUSES = ['pending', 'in progress', 'planned', 'executed', 'complete', 'shipped', 'partial', 'not started']
const FIXES: Record<string, string> = { done: 'Complete', finished: 'Complete', wip: 'In Progress', 'in-progress': 'In Progress', todo: 'Pending', 'not-started': 'Pending' }

export async function runValidate(io: Io, opts: { fix?: boolean } = {}): Promise<{ checks: Check[]; fixed: string[] }> {
  const checks: Check[] = []
  const fixed: string[] = []
  const add = (area: string, level: Level, message: string) => checks.push({ area, level, message })
  const p = await loadProject(io)
  if (!p.hasPlanning) {
    add('planning', 'FAIL', 'no .planning/ directory; run /triad:start')
    return { checks, fixed }
  }

  // PROJECT.md
  if (p.project === undefined) add('PROJECT.md', 'FAIL', 'missing')
  else {
    const body = p.project.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\s*<!--[\s\S]*?-->\s*/, '')
    if (!/^#\s/.test(body.trimStart())) add('PROJECT.md', 'WARN', 'does not start with a "# " title')
    else if (!/^##\s+(Requirements|Goals)\b/m.test(body)) add('PROJECT.md', 'WARN', 'has no "## Requirements" or "## Goals" section')
    else add('PROJECT.md', 'PASS', 'title and requirements present')
    if (p.project.startsWith('---\n')) {
      try { parseYaml(p.project.split('\n---')[0].slice(4)) } catch (e) { add('PROJECT.md', 'FAIL', `frontmatter is not valid YAML: ${(e as Error).message}`) }
    }
  }

  // ROADMAP.md
  let roadmapText = p.roadmapText
  if (!p.roadmap || roadmapText === undefined) add('ROADMAP.md', 'FAIL', 'missing')
  else if (!p.roadmap.header.length) add('ROADMAP.md', 'FAIL', 'no progress table with Phase and Status columns')
  else {
    let bad = 0
    for (const r of p.roadmap.rows) {
      const s = r.status.toLowerCase().replace(/[*_`]/g, '').trim()
      if (STATUSES.some(x => s.startsWith(x))) continue
      if (opts.fix && FIXES[s]) {
        roadmapText = setRoadmapRow(roadmapText!, r.phase, { status: FIXES[s] })
        fixed.push(`ROADMAP.md phase ${r.phase}: status "${r.status}" -> "${FIXES[s]}"`)
        continue
      }
      bad++
      add('ROADMAP.md', 'WARN', `phase ${r.phase} has status "${r.status}"`)
    }
    const nums = p.roadmap.rows.map(r => r.phase)
    const gaps = nums.filter((n, i) => i > 0 && n !== nums[i - 1] + 1)
    if (gaps.length) add('ROADMAP.md', 'WARN', `phase numbers are not consecutive (jumps before ${gaps.join(', ')})`)
    if (!bad && !gaps.length) add('ROADMAP.md', 'PASS', `${p.roadmap.rows.length} phases in the progress table`)
    if (roadmapText !== p.roadmapText) await io.write('.planning/ROADMAP.md', roadmapText!)
  }

  // STATE.md
  if (!p.stateText || !p.state) add('STATE.md', 'FAIL', 'missing')
  else {
    const head = p.stateText.split('\n').slice(0, 15).join('\n')
    if (!/Current/i.test(head)) add('STATE.md', 'WARN', 'no "Current Position" near the top')
    if (p.state.phase === undefined) add('STATE.md', 'FAIL', 'no phase reference ("Phase: N of M")')
    else if (p.state.phase > 0 && p.roadmap && !phaseNumbers(p.roadmap).includes(p.state.phase)) add('STATE.md', 'FAIL', `phase ${p.state.phase} is not in ROADMAP.md`)
    else add('STATE.md', 'PASS', `phase ${p.state.phase}${p.state.total ? ` of ${p.state.total}` : ''}`)
    for (const m of p.stateText.matchAll(/(\d+)%/g)) if (Number(m[1]) > 100) add('STATE.md', 'WARN', `percentage ${m[1]}% is over 100`)
    const roster = p.stateText.match(/(\d+)\s+agents?\s+across/)
    if (roster && Number(roster[1]) !== ROSTER.size) add('roster', 'FAIL', `STATE.md says ${roster[1]} agents; the roster has ${ROSTER.size}`)
  }

  // Phase files
  let plansSeen = 0, legacy = 0
  for (const dir of p.phaseDirs) {
    const n = Number(dir.match(/^(\d+)/)?.[1])
    if (!Number.isFinite(n)) continue
    const ph = await loadPhase(io, p, n)
    if (ph.dir !== dir) continue
    const area = `phases/${dir}`
    if (ph.plans.length && ph.context === undefined && !ph.files.some(f => /CONTEXT\.md$/.test(f))) add(area, 'WARN', 'no CONTEXT.md')
    const complete = /complete|shipped/i.test(p.roadmap?.rows.find(r => r.phase === n)?.status ?? '')
    for (const plan of ph.plans) {
      plansSeen++
      const where = `${area}/${plan.file}`
      if (plan.schemaErrors.length) {
        const fixedByReading = plan.normalizedErrors
        if (!fixedByReading.length) { legacy++; add(where, 'WARN', `legacy frontmatter, read as: ${plan.normalized.join('; ')}`) }
        else add(where, 'FAIL', `frontmatter: ${fixedByReading.slice(0, 4).join('; ')}${fixedByReading.length > 4 ? ` (+${fixedByReading.length - 4} more)` : ''}`)
      }
      const missing = [
        !plan.fm.expected_artifacts.length && 'expected_artifacts',
        !plan.fm.verification_commands.length && 'verification_commands',
        !(plan.fm.must_haves as any)?.truths?.length && 'must_haves.truths',
      ].filter(Boolean)
      if (missing.length) add(where, 'WARN', `no ${missing.join(', ')}`)
      for (const a of plan.fm.agents) if (!ROSTER.has(a)) add(where, 'FAIL', `agent "${a}" is not in the roster`)
      if (complete && ph.summaries[plan.id] === undefined) add(where, 'WARN', 'phase is complete but this plan has no SUMMARY')
    }
  }
  if (plansSeen && !checks.some(c => c.area.startsWith('phases/') && c.level === 'FAIL')) add('plans', 'PASS', `${plansSeen} plan files read${legacy ? `, ${legacy} in a legacy form Triad reads without migration` : ''}`)

  // Memory and config
  const outcomes = await io.read('.planning/memory/OUTCOMES.md')
  if (outcomes !== undefined) {
    if (!outcomes.trim()) add('memory', 'WARN', 'OUTCOMES.md is empty')
    const unknown = [...new Set([...outcomes.matchAll(/agent(?:_id)?:\s*`?([a-z][a-z0-9-]+)`?/gi)].map(m => m[1]))].filter(a => !ROSTER.has(a))
    if (unknown.length) add('memory', 'WARN', `OUTCOMES.md names agents not in the roster: ${unknown.slice(0, 5).join(', ')}`)
  }
  for (const f of (await io.list('.planning/config')).filter(e => !e.dir && /\.ya?ml$/.test(e.name))) {
    const rel = `.planning/config/${f.name}`
    let doc: any
    try { doc = parseYaml(((await io.read(rel)) ?? '').replace(/^---\s*$/m, '')) } catch (e) { add(rel, 'FAIL', `not valid YAML: ${(e as Error).message}`); continue }
    const refs = agentRefs(f.name, doc)
    const unknown = [...new Set(refs.map(String))].filter(a => !ROSTER.has(a))
    if (unknown.length) add(rel, 'FAIL', `names agents not in the roster: ${unknown.join(', ')}`)
    else add(rel, 'PASS', refs.length ? `parses; ${new Set(refs).size} agent references resolve` : 'parses')
  }

  // Settings
  const s = p.settings
  for (const w of p.settingsWarnings) add('settings.json', /control_mode/.test(w) ? 'FAIL' : 'WARN', w)
  const pos = (v: unknown) => Number.isInteger(v) && (v as number) > 0
  if (!pos(s.planning?.max_tasks_per_plan)) add('settings.json', 'FAIL', 'planning.max_tasks_per_plan must be a positive integer')
  if (!pos(s.review?.max_cycles)) add('settings.json', 'FAIL', 'review.max_cycles must be a positive integer')
  if (!p.settingsWarnings.length) add('settings', 'PASS', `control mode ${s.control_mode}`)
  return { checks, fixed }
}

// Agent ids a Legion config file names (config-agent-references).
export function agentRefs(file: string, doc: any): string[] {
  const refs: string[] = []
  if (file === 'authority-matrix.yaml') refs.push(...Object.keys(doc?.agents ?? {}))
  if (file === 'intent-teams.yaml') for (const i of Object.values<any>(doc?.intents ?? {})) refs.push(...(i?.agents?.primary ?? []), ...(i?.agents?.secondary ?? []), ...(i?.filter?.exclude_agents ?? []))
  if (file === 'roster-gap-config.yaml') {
    const walk = (v: any): void => {
      if (Array.isArray(v)) v.forEach(walk)
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) (k === 'coverage_indicators' || k === 'required_agents') && Array.isArray(x) ? refs.push(...x.map(String)) : walk(x)
    }
    walk(doc)
  }
  return refs.map(String)
}

export function renderValidate(r: { checks: Check[]; fixed: string[] }, ci: boolean): { text: string; exitCode: number } {
  const n = (l: Level) => r.checks.filter(c => c.level === l).length
  const exitCode = n('FAIL') ? 2 : n('WARN') ? 1 : 0
  const line = `validate: ${n('PASS')} passed, ${n('WARN')} warnings, ${n('FAIL')} failures`
  if (ci) return { text: line, exitCode }
  const order: Level[] = ['FAIL', 'WARN', 'PASS']
  // The same message on many files reads as one line.
  const body = order.flatMap(l => {
    const groups = new Map<string, string[]>()
    for (const c of r.checks.filter(c => c.level === l)) groups.set(c.message, [...(groups.get(c.message) ?? []), c.area])
    return [...groups.entries()].flatMap(([msg, areas]) => areas.length > 3
      ? [`${l.padEnd(4)} ${msg}: ${areas.length} files (${areas[0]} … ${areas[areas.length - 1]})`]
      : areas.map(a => `${l.padEnd(4)} ${a}: ${msg}`))
  })
  return { text: [...body, ...(r.fixed.length ? ['', 'Fixed:', ...r.fixed.map(f => '  ' + f)] : []), '', line].join('\n'), exitCode }
}

export { getField }
