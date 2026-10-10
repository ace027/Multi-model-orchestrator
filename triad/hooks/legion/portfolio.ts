// Portfolio (/triad:portfolio): the cross-project registry at
// ~/.claude/legion/portfolio.md (PARITY decision 6), health, dashboard,
// dependencies and agent allocation in code. The Studio Producer analysis is
// the model's (persona_run).
import { PERSONAS } from './personas.ts'
import { parseRoadmap, parseState, phaseDone } from './planning.ts'
import { today, type Io } from './io.ts'

export const REGISTRY = 'portfolio.md' // relative to the registry Io (~/.claude/legion)
export type Project = { name: string; path: string; status: string; registered: string; description: string }
export type Dep = { id: string; from: string; to: string; type: string; status: string; notes: string }
export type Registry = { projects: Project[]; deps: Dep[] }

const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

export function parseRegistry(text: string): Registry {
  const projects: Project[] = []
  const deps: Dep[] = []
  let section = ''
  let cur: Project | undefined
  for (const line of text.split('\n')) {
    if (/^## /.test(line)) { section = line.slice(3).trim(); cur = undefined; continue }
    if (section === 'Projects') {
      const h = line.match(/^### (.+)$/)
      if (h) { cur = { name: h[1]!.trim(), path: '', status: 'Active', registered: '', description: '' }; projects.push(cur); continue }
      const f = line.match(/^- \*\*(Path|Status|Registered|Description)\*\*:\s*(.*)$/)
      if (f && cur) (cur as any)[f[1]!.toLowerCase()] = f[2]!.trim()
    } else if (section === 'Cross-Project Dependencies' && /^\|\s*DEP-\d+/.test(line)) {
      const [id, from, to, type, status, notes] = cells(line)
      deps.push({ id: id!, from: from!, to: to!, type: type!, status: status!, notes: notes ?? '' })
    }
  }
  return { projects, deps }
}

export function renderRegistry(r: Registry, date: string): string {
  return ['# Legion Portfolio', '', '## Projects', '',
    ...r.projects.flatMap(p => [`### ${p.name}`, `- **Path**: ${p.path}`, `- **Status**: ${p.status}`, `- **Registered**: ${p.registered}`, `- **Description**: ${p.description}`, '']),
    '## Cross-Project Dependencies', '', '| ID | From | To | Type | Status | Notes |', '|----|------|----|------|--------|-------|',
    ...r.deps.map(d => `| ${d.id} | ${d.from} | ${d.to} | ${d.type} | ${d.status} | ${d.notes} |`), '',
    '## Metadata', `- **Last Updated**: ${date}`, `- **Total Projects**: ${r.projects.length}`, `- **Active Projects**: ${r.projects.filter(p => p.status === 'Active').length}`, ''].join('\n')
}

async function load(reg: Io): Promise<Registry | undefined> {
  const t = await reg.read(REGISTRY)
  return t === undefined ? undefined : parseRegistry(t)
}
const save = (reg: Io, r: Registry) => reg.write(REGISTRY, renderRegistry(r, today(reg)))

export async function portfolioRegister(reg: Io, proj: Io): Promise<string> {
  const pm = await proj.read('.planning/PROJECT.md')
  if (pm === undefined) return 'No .planning/PROJECT.md here: run `/triad:start` first, then register.'
  const name = pm.match(/^# (.+)$/m)?.[1]?.trim() ?? proj.root.split('/').pop()!
  const what = pm.match(/^## What This Is\s*\n+([^\n#][^\n]*)/m)?.[1] ?? pm.split('\n').find(l => l.trim() && !l.startsWith('#')) ?? ''
  const r = (await load(reg)) ?? { projects: [], deps: [] }
  const existing = r.projects.find(p => p.path === proj.root)
  const entry: Project = { name, path: proj.root, status: 'Active', registered: today(reg), description: what.trim().slice(0, 200) }
  if (existing) Object.assign(existing, { ...entry, name: existing.name })
  else {
    if (r.projects.some(p => p.name === name)) entry.name = `${name} (${proj.root.split('/').pop()})`
    r.projects.push(entry)
  }
  try { await save(reg, r) } catch { return `Cannot create portfolio registry at ${reg.root}. Check directory permissions.` }
  return `${existing ? 'Updated' : 'Registered'} ${existing?.name ?? entry.name} (${proj.root}) in ${reg.root}/${REGISTRY}.`
}

export async function portfolioUnregister(reg: Io, nameOrPath: string): Promise<string> {
  const r = await load(reg)
  const p = r?.projects.find(x => x.name === nameOrPath || x.path === nameOrPath)
  if (!r || !p) return `No registered project "${nameOrPath}".`
  r.projects = r.projects.filter(x => x !== p)
  const before = r.deps.length
  r.deps = r.deps.filter(d => !d.from.startsWith(`${p.name}:`) && !d.to.startsWith(`${p.name}:`))
  await save(reg, r)
  return `Unregistered ${p.name}; removed ${before - r.deps.length} dependency row(s).`
}

type Snapshot = { p: Project; missing?: boolean; unreadable?: boolean; phase?: number; total?: number; phaseName?: string; status?: string; last?: string; next?: string; pct?: number; done: Set<number>; health: '[XX]' | '[!!]' | '[OK]'; agents: Set<string> }
const AGENT_RE = /\b(?:engineering|design|marketing|product|project-management|testing|support|spatial-computing|specialized)-[a-z0-9-]+\b/g

async function snapshot(p: Project, at: (path: string) => Io, now: Date): Promise<Snapshot> {
  const io = at(p.path)
  const s: Snapshot = { p, done: new Set(), health: '[OK]', agents: new Set() }
  const stateText = await io.read('.planning/STATE.md')
  if (stateText === undefined && !(await io.list('.planning')).length) { s.missing = true; s.health = '[XX]'; return s }
  const roadmapText = await io.read('.planning/ROADMAP.md')
  try {
    const st = parseState(stateText ?? '')
    const rm = parseRoadmap(roadmapText ?? '')
    Object.assign(s, { phase: st.phase, total: st.total ?? rm.rows.length, status: st.status, last: st.lastActivity, next: st.nextAction })
    s.phaseName = rm.rows.find(r => r.phase === st.phase)?.name || rm.phases.find(x => x.phase === st.phase)?.name || ''
    const plans = rm.rows.reduce((a, r) => a + (r.plans ?? 0), 0)
    const done = rm.rows.reduce((a, r) => a + (r.completed ?? 0), 0)
    s.pct = plans ? Math.floor(done / plans * 100) : 0
    for (const r of rm.rows) if (phaseDone(r.status)) s.done.add(r.phase)
    for (const ph of rm.phases) if (ph.checked) s.done.add(ph.phase)
  } catch { s.unreadable = true; return s }
  const known = new Set(PERSONAS.map(x => x.id))
  for (const d of await io.list('.planning/phases')) {
    if (!d.dir) continue
    for (const f of await io.list(`.planning/phases/${d.name}`)) {
      if (f.dir || !/(CONTEXT|PLAN|SUMMARY)\.md$|-PLAN\.md$|^\d+-\d+.*\.md$/.test(f.name)) continue
      const t = ((await io.read(`.planning/phases/${d.name}/${f.name}`)) ?? '').replace(/^---\n[\s\S]*?\n---\n/, '') // not plan frontmatter
      for (const m of t.matchAll(AGENT_RE)) if (known.has(m[0])) s.agents.add(m[0])
    }
  }
  const lastDate = (s.last ?? '').match(/\d{4}-\d{2}-\d{2}/)?.[0]
  const age = lastDate ? Math.floor((now.getTime() - Date.parse(lastDate)) / 86_400_000) : undefined
  if (/escalat|fail|block/i.test(s.status ?? '') || (age !== undefined && age >= 7)) s.health = '[!!]'
  if (/blocker/i.test(stateText ?? '') && ((stateText ?? '').match(/^\s*[-*].*\bblock(er|ed)\b.*phase\s*\d+/gim) ?? []).length >= 3) s.health = '[XX]'
  return s
}

const bar = (pct: number) => { const n = Math.floor(pct / 10); return `[${'#'.repeat(n)}${'.'.repeat(10 - n)}]` }
const RANK = { '[XX]': 0, '[!!]': 1, '[OK]': 2 }

export async function portfolioDashboard(reg: Io, at: (path: string) => Io): Promise<string> {
  const r = await load(reg)
  if (!r) return `No portfolio registry found at \`${reg.root}/${REGISTRY}\`. Run \`/triad:start\` in a project, or \`/triad:portfolio register\` there.`
  if (!r.projects.length) return 'Portfolio is empty — no projects registered. Run `/triad:portfolio register` in a project directory.'
  const now = reg.now()
  const snaps: Snapshot[] = []
  const notes: string[] = []
  let changed = false
  for (const p of r.projects) {
    const s = await snapshot(p, at, now)
    if (s.missing) { if (p.status !== 'Stale') { p.status = 'Stale'; changed = true } notes.push(`${p.name}: Project directory not found at ${p.path}`) }
    else if (s.unreadable) { notes.push(`Unable to read state for ${p.name} — skipping in dashboard.`); continue }
    if (p.status === 'Stale') s.health = '[XX]'
    snaps.push(s)
  }
  if (changed) await save(reg, r)
  snaps.sort((a, b) => RANK[a.health] - RANK[b.health] || (b.last ?? '').localeCompare(a.last ?? ''))
  const active = r.projects.filter(p => p.status === 'Active').length
  const atRisk = snaps.filter(s => s.health !== '[OK]').length
  const out = ['# Legion Portfolio', '', `**${active} active projects** | ${r.projects.length} registered | ${atRisk} at risk`, '',
    '| Project | Phase | Progress | Health | Last Activity |', '|---------|-------|----------|--------|---------------|',
    ...snaps.map(s => s.missing ? `| ${s.p.name} | — | — | ${s.health} | directory missing |` : `| ${s.p.name} | ${s.phase ?? 0}/${s.total ?? '?'}: ${s.phaseName ?? ''} | ${bar(s.pct ?? 0)} ${s.pct ?? 0}% | ${s.health} | ${s.last ?? ''} |`),
    ...(notes.length ? ['', ...notes.map(n => `- ${n}`)] : []), '', '## Dependencies', '']
  if (!r.deps.length) out.push('No cross-project dependencies registered.')
  else {
    let blocking = 0
    out.push('| # | From | To | Status | Impact |', '|---|------|----|--------|--------|')
    for (const d of r.deps) {
      const [fp, fn] = d.from.split(/:Phase\s*/)
      const [tp, tn] = d.to.split(/:Phase\s*/)
      const resolved = snaps.find(s => s.p.name === fp)?.done.has(Number(fn)) ?? false
      if (!resolved) blocking++
      out.push(`| ${d.id} | ${d.from} | ${d.to} | ${resolved ? 'Resolved' : 'Blocking'} | ${tp} Phase ${tn} is waiting on ${fp} Phase ${fn} |`)
    }
    out.push('', `${blocking} of ${r.deps.length} dependencies blocking`)
  }
  out.push('', '## Agent Allocation', '')
  if (snaps.filter(s => !s.missing).length < 2) out.push('Agent allocation tracking requires 2+ projects.')
  else {
    const use = new Map<string, string[]>()
    for (const s of snaps) for (const a of s.agents) use.set(a, [...(use.get(a) ?? []), s.p.name])
    const shared = [...use].filter(([, ps]) => ps.length >= 2)
    const div = (id: string) => PERSONAS.find(p => p.id === id)?.division ?? '?'
    out.push(...(shared.length ? ['| Agent | Division | Projects |', '|-------|----------|----------|', ...shared.map(([a, ps]) => `| ${a} | ${div(a)} | ${ps.join(', ')} |`)] : ['No agents are shared across projects.']), '')
    const divisions = [...new Set(PERSONAS.map(p => p.division))].sort()
    const under: string[] = []
    out.push('| Division | Projects Using | Agents Available |', '|----------|----------------|------------------|')
    for (const d of divisions) {
      const n = snaps.filter(s => [...s.agents].some(a => div(a) === d)).length
      if (!n) under.push(d)
      out.push(`| ${d} | ${n} | ${PERSONAS.filter(p => p.division === d).length} |`)
    }
    if (under.length) out.push('', `Underutilized divisions: ${under.join(', ')}`)
  }
  const act = snaps.filter(s => s.p.status === 'Active' && !s.missing)
  out.push('', `Overall progress: ${act.length ? Math.round(act.reduce((a, s) => a + (s.pct ?? 0), 0) / act.length) : 0}% (mean of active projects)`)
  return out.join('\n')
}

export async function portfolioAddDep(reg: Io, at: (path: string) => Io, d: { from: string; from_phase: number; to: string; to_phase: number; type: string; notes?: string }): Promise<string> {
  const r = await load(reg)
  if (!r) return 'No portfolio registry yet.'
  if (!['blocks', 'informs'].includes(d.type)) return 'Type must be blocks or informs.'
  for (const [name, n] of [[d.from, d.from_phase], [d.to, d.to_phase]] as [string, number][]) {
    const p = r.projects.find(x => x.name === name)
    if (!p) return `No registered project "${name}".`
    const rm = parseRoadmap((await at(p.path).read('.planning/ROADMAP.md')) ?? '')
    if (!rm.rows.some(x => x.phase === n) && !rm.phases.some(x => x.phase === n)) return `${name} has no Phase ${n} in its ROADMAP.md.`
  }
  const id = `DEP-${String(Math.max(0, ...r.deps.map(x => Number(x.id.slice(4)) || 0)) + 1).padStart(2, '0')}`
  r.deps.push({ id, from: `${d.from}:Phase ${d.from_phase}`, to: `${d.to}:Phase ${d.to_phase}`, type: d.type, status: 'Active', notes: (d.notes ?? '').replace(/\|/g, '/') })
  await save(reg, r)
  return `Dependency ${id} added: ${d.from}:Phase ${d.from_phase} ${d.type} ${d.to}:Phase ${d.to_phase}`
}

export async function portfolioDetails(reg: Io, at: (path: string) => Io, name: string): Promise<string> {
  const p = (await load(reg))?.projects.find(x => x.name === name)
  if (!p) return `No registered project "${name}".`
  const io = at(p.path)
  const st = await io.read('.planning/STATE.md')
  const rm = await io.read('.planning/ROADMAP.md')
  if (st === undefined) return `Project directory not found at ${p.path}`
  return [`# ${p.name}`, `Path: ${p.path}`, '', '## STATE.md', st.trim(), '', '## ROADMAP progress', ...(rm ?? '').split('\n').filter(l => /^\s*\|/.test(l) || /^- \[[ x]\]/.test(l))].join('\n')
}
