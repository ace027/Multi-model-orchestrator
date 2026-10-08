// Legion's `.planning/` layer: reading and line-level editing of PROJECT, ROADMAP,
// STATE, plans and summaries. Pure: texts in, texts out; io.ts does the I/O.
//
// Existing Legion projects load as they are (no migration): fields are read in
// both the template's bold form (`- **Phase**: 3 of 5`) and the plain form
// (`Phase: 3 of 5`), tables may carry extra columns, phase cells may read
// `3 — Name`, and legacy plan frontmatter is normalized on read, never rewritten.
import { splitFrontmatter } from './yaml.ts'
import { validate } from './schema.ts'
import { SCHEMAS } from './data.ts'

export const pad2 = (n: number | string) => String(n).padStart(2, '0')

// ---- fields ----------------------------------------------------------------

// `- **Name**: value`, `**Name:** value`, `Name: value`, under any list marker.
const fieldRe = (name: string) =>
  new RegExp(`^(\\s*(?:[-*]\\s+)?)(\\*\\*)?(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(:?)(\\*\\*)?(:?)[ \\t]*(.*)$`, 'i')

export function getField(text: string, name: string): string | undefined {
  const re = fieldRe(name)
  for (const line of text.split('\n')) {
    const m = line.match(re)
    if (m && (m[4] || m[6])) return m[7].trim()
  }
  return undefined
}

// Replaces a field's value in place, keeping its formatting. A missing field is
// added under `## Current Position` (or at the top) in the file's own style.
export function setField(text: string, name: string, value: string): string {
  const re = fieldRe(name)
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (m && (m[4] || m[6])) {
      lines[i] = `${m[1]}${m[2] ?? ''}${m[3]}${m[4]}${m[5] ?? ''}${m[6]} ${value}`
      return lines.join('\n')
    }
  }
  const bold = /^\s*-\s+\*\*\w[\w ]*\*\*:/m.test(text)
  const line = bold ? `- **${name}**: ${value}` : `${name}: ${value}`
  const at = lines.findIndex(l => /^##\s+Current Position/i.test(l))
  if (at >= 0) {
    let j = at + 1
    while (j < lines.length && !/^##\s/.test(lines[j]) && (lines[j].trim() === '' ? j === at + 1 : true)) j++
    // after the section's last field line
    let last = at
    for (let k = at + 1; k < j; k++) if (lines[k].trim()) last = k
    lines.splice(last + 1, 0, line)
  } else {
    const h = lines.findIndex(l => /^#\s/.test(l))
    lines.splice(h + 1, 0, ...(h >= 0 ? ['', line] : [line]))
  }
  return lines.join('\n')
}

// ---- sections --------------------------------------------------------------

function sectionRange(lines: string[], heading: RegExp): [number, number] | undefined {
  const s = lines.findIndex(l => heading.test(l))
  if (s < 0) return undefined
  const level = (lines[s].match(/^#+/) ?? ['##'])[0].length
  let e = s + 1
  while (e < lines.length && !(new RegExp(`^#{1,${level}}\\s`).test(lines[e]))) e++
  return [s, e]
}

export function getSection(text: string, heading: RegExp): string | undefined {
  const lines = text.split('\n')
  const r = sectionRange(lines, heading)
  return r ? lines.slice(r[0] + 1, r[1]).join('\n').trim() : undefined
}

// Replaces a section's body (heading kept), or appends the section.
export function setSection(text: string, heading: string, body: string): string {
  const lines = text.split('\n')
  const re = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
  const r = sectionRange(lines, re)
  if (!r) return text.replace(/\n*$/, '\n\n') + `${heading}\n${body.trim()}\n`
  lines.splice(r[0] + 1, r[1] - r[0] - 1, body.trim(), '')
  return lines.join('\n')
}

export function appendToSection(text: string, heading: string, line: string): string {
  const lines = text.split('\n')
  const re = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`)
  const r = sectionRange(lines, re)
  if (!r) return text.replace(/\n*$/, '\n\n') + `${heading}\n${line}\n`
  let last = r[0]
  for (let k = r[0] + 1; k < r[1]; k++) if (lines[k].trim()) last = k
  lines.splice(last + 1, 0, line)
  return lines.join('\n')
}

// ---- STATE -----------------------------------------------------------------

export type State = { phase?: number; total?: number; phaseNote: string; status: string; lastActivity: string; nextAction: string }

export function parseState(text: string): State {
  const p = getField(text, 'Phase') ?? text.match(/Phase:\s*(\d+.*)$/im)?.[1] ?? ''
  const m = p.match(/^(\d+)(?:\s+of\s+(\d+))?\s*(.*)$/i)
  return {
    phase: m ? Number(m[1]) : undefined,
    total: m?.[2] ? Number(m[2]) : undefined,
    phaseNote: (m?.[3] ?? '').replace(/^\(|\)$/g, '').trim(),
    status: getField(text, 'Status') ?? '',
    lastActivity: getField(text, 'Last Activity') ?? '',
    nextAction: getField(text, 'Next Action') ?? getSection(text, /^##\s+Next Action/i) ?? '',
  }
}

// Sets the STATE fields given, in place. `Next Action` may be a field or a section.
export function updateState(text: string, f: { phase?: string; status?: string; lastActivity?: string; nextAction?: string; progress?: string }): string {
  let t = text
  if (f.phase !== undefined) t = setField(t, 'Phase', f.phase)
  if (f.status !== undefined) t = setField(t, 'Status', f.status)
  if (f.lastActivity !== undefined) t = setField(t, 'Last Activity', f.lastActivity)
  if (f.nextAction !== undefined) {
    if (getField(t, 'Next Action') !== undefined) t = setField(t, 'Next Action', f.nextAction)
    else t = setSection(t, '## Next Action', f.nextAction)
  }
  if (f.progress !== undefined) {
    const lines = t.split('\n')
    const i = lines.findIndex(l => /^\s*\[[#.=\- ]*\]\s*\d+%/.test(l))
    if (i >= 0) lines[i] = f.progress
    t = i >= 0 ? lines.join('\n') : setSection(t, '## Progress', '```\n' + f.progress + '\n```')
  }
  return t
}

export function progressBar(done: number, total: number, width = 20): string {
  const pct = total > 0 ? Math.floor((done / total) * 100) : 0
  const filled = Math.floor((pct * width) / 100)
  return `[${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${pct}% — ${done}/${total} plans complete`
}

// ---- ROADMAP ---------------------------------------------------------------

export type RoadmapRow = { phase: number; name: string; plans?: number; completed?: number; status: string; line: number }
export type PhaseInfo = { phase: number; name: string; goal: string; requirements: string; agents: string[]; criteria: string[]; plans?: number; checked?: boolean }
export type Roadmap = { rows: RoadmapRow[]; header: string[]; phases: PhaseInfo[] }

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
const num = (s: string | undefined) => (s && /^\d+/.test(s.trim()) ? Number(s.trim().match(/^\d+/)![0]) : undefined)

function progressTable(lines: string[]): { header: string[]; at: number } | undefined {
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue
    const h = cells(lines[i]).map(c => c.toLowerCase())
    if (h[0] === 'phase' && h.includes('status')) return { header: h, at: i }
  }
  return undefined
}

export function parseRoadmap(text: string): Roadmap {
  const lines = text.split('\n')
  const rows: RoadmapRow[] = []
  const t = progressTable(lines)
  if (t) {
    const col = (n: string) => t.header.indexOf(n)
    for (let i = t.at + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
      const c = cells(lines[i])
      const phase = num(c[0].replace(/^phase\s*/i, ''))
      if (phase === undefined) continue
      const name = c[0].replace(/^(phase\s*)?\d+\s*(—|-|:|–)?\s*/i, '').trim()
      rows.push({ phase, name, plans: num(c[col('plans')]), completed: num(c[col('completed')]), status: c[col('status')] ?? '', line: i })
    }
  }
  const phases: PhaseInfo[] = []
  const checked: Record<number, boolean> = {}
  for (const l of lines) {
    const m = l.match(/^\s*-\s+\[([ xX~-])\]\s+Phase\s+(\d+):/)
    if (m) checked[Number(m[2])] = m[1].toLowerCase() === 'x'
  }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^###\s+Phase\s+(\d+):\s*(.*)$/)
    if (!m) continue
    let e = i + 1
    while (e < lines.length && !/^#{1,3}\s/.test(lines[e])) e++
    const block = lines.slice(i + 1, e).join('\n')
    const f = (k: string) => getField(block, k) ?? ''
    const crit = (block.split(/\*\*Success Criteria\*\*:?/i)[1] ?? '').split('\n').filter(l => /^\s*-\s/.test(l)).map(l => l.replace(/^\s*-\s+(\[[ xX]\]\s*)?/, '').trim())
    phases.push({
      phase: Number(m[1]), name: m[2].trim(), goal: f('Goal'), requirements: f('Requirements'),
      agents: f('Recommended Agents').split(/[,\s]+/).map(s => s.replace(/[`*]/g, '')).filter(s => /^[a-z][a-z0-9-]+$/.test(s)),
      criteria: crit, plans: num(f('Plans')), checked: checked[Number(m[1])],
    })
  }
  return { rows, header: t?.header ?? [], phases }
}

// Edits one progress-table row in place, by column name; other columns are kept.
export function setRoadmapRow(text: string, phase: number, values: { plans?: number; completed?: number; status?: string }): string {
  const lines = text.split('\n')
  const t = progressTable(lines)
  if (!t) return text
  for (let i = t.at + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
    const c = cells(lines[i])
    if (num(c[0].replace(/^phase\s*/i, '')) !== phase) continue
    const set = (n: string, v: string | number | undefined) => {
      const k = t.header.indexOf(n)
      if (k >= 0 && v !== undefined) c[k] = String(v)
    }
    set('plans', values.plans)
    set('completed', values.completed)
    set('status', values.status)
    lines[i] = `| ${c.join(' | ')} |`
  }
  return lines.join('\n')
}

export function checkPhase(text: string, phase: number, on = true): string {
  return text.replace(new RegExp(`^(\\s*-\\s+\\[)[ xX~-](\\]\\s+Phase\\s+${phase}:)`, 'm'), `$1${on ? 'x' : ' '}$2`)
}

// ---- plans -----------------------------------------------------------------

export type PlanFm = {
  phase: number | string; plan: string; wave: number; agents: string[]; autonomous?: boolean
  depends_on: string[]; files_modified: string[]; files_forbidden?: string[]; sequential_files: string[]
  requirements: string[]; verification_commands: string[]; expected_artifacts: { path: string; provides?: string; required?: boolean }[]
  must_haves?: { truths?: string[] }; title?: string; name?: string; [k: string]: unknown
}

export type Plan = {
  id: string // "NN-PP"
  file: string // file name
  fm: PlanFm // normalized
  body: string
  schemaErrors: string[] // against the frontmatter as written
  normalized: string[] // what was read in a legacy form
  normalizedErrors: string[] // left once the legacy forms are read as Triad reads them
  title: string
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [])

// Reads a plan file. Legacy frontmatter (integer `plan`, `agent:` instead of
// `agents:`, a scalar list) is normalized for use; schemaErrors keep the truth.
export function parsePlan(file: string, text: string, phaseNum: number): Plan {
  const { data, body } = splitFrontmatter(text)
  const raw: Record<string, unknown> = data ?? {}
  const schemaErrors = data ? validate(SCHEMAS.plan, raw) : ['no YAML frontmatter']
  const normalized: string[] = []
  const pp = file.match(/^(\d+)-(\d+)-PLAN\.md$/)
  let plan = raw.plan
  if (typeof plan === 'number' || (typeof plan === 'string' && /^\d+$/.test(plan))) {
    plan = `${pad2(phaseNum)}-${pad2(plan as number)}`
    normalized.push(`plan ${raw.plan} read as "${plan}"`)
  }
  if (typeof plan !== 'string' || !/^\d{2}-\d{2}$/.test(plan)) plan = pp ? `${pad2(pp[1])}-${pad2(pp[2])}` : `${pad2(phaseNum)}-00`
  let agents = strList(raw.agents)
  if (!agents.length && raw.agent) {
    agents = strList(raw.agent)
    normalized.push('agent: read as agents:')
  }
  if (!agents.length) {
    // build.md: "Agent: {id}" inside <objective> or <context>
    const head = [...body.matchAll(/<(objective|context)>([\s\S]*?)<\/\1>/g)].map(x => x[2]).join('\n')
    const m = head.match(/^\s*[-*]?\s*\*{0,2}Agent\*{0,2}:\*{0,2}\s*`?([a-z]+-[a-z0-9-]+)`?\s*$/m)
    if (m) agents = [m[1]]
  }
  const wave = typeof raw.wave === 'number' ? raw.wave : Number(raw.wave) || 1
  const fm: PlanFm = {
    ...raw,
    phase: (raw.phase as number | string) ?? phaseNum,
    plan: plan as string,
    wave,
    agents,
    depends_on: strList(raw.depends_on).map(d => (/^\d+$/.test(d) ? `${pad2(phaseNum)}-${pad2(d)}` : d)),
    files_modified: strList(raw.files_modified),
    files_forbidden: raw.files_forbidden === undefined ? undefined : strList(raw.files_forbidden),
    sequential_files: strList(raw.sequential_files),
    requirements: strList(raw.requirements ?? raw.requirement),
    verification_commands: strList(raw.verification_commands),
    expected_artifacts: Array.isArray(raw.expected_artifacts) ? (raw.expected_artifacts as any[]).filter(a => a && typeof a === 'object') : [],
  }
  const fixed: Record<string, unknown> = { ...raw, plan }
  if (normalized.some(n => n.startsWith('agent:'))) {
    fixed.agents = agents
    delete fixed.agent
  }
  const normalizedErrors = data ? (normalized.length ? validate(SCHEMAS.plan, fixed) : schemaErrors) : schemaErrors
  const title = String(raw.title ?? raw.name ?? body.match(/^#\s+(.+)$/m)?.[1] ?? body.match(/<objective>\s*\n?\s*([^\n]+)/)?.[1] ?? `Plan ${plan}`).trim()
  return { id: fm.plan, file, fm, body, schemaErrors, normalized, normalizedErrors, title }
}

// `> verification: cmd` lines in task actions, plus frontmatter verification_commands.
export function verificationCommands(p: Plan): string[] {
  const out = [...p.fm.verification_commands]
  for (const m of p.body.matchAll(/^\s*>\s*verification:\s*(.+)$/gim)) {
    const c = m[1].trim().replace(/^`|`$/g, '')
    if (!out.includes(c)) out.push(c)
  }
  return out
}

export type Waves = { waves: { wave: number; plans: Plan[] }[]; errors: string[]; warnings: string[] }

// Groups plans into waves and checks the build's hard stops.
export function planWaves(plans: Plan[], knownAgents?: Set<string>): Waves {
  const errors: string[] = []
  const warnings: string[] = []
  const byWave = new Map<number, Plan[]>()
  for (const p of [...plans].sort((a, b) => a.id.localeCompare(b.id))) byWave.set(p.fm.wave, [...(byWave.get(p.fm.wave) ?? []), p])
  const waves = [...byWave.entries()].sort((a, b) => a[0] - b[0]).map(([wave, ps]) => ({ wave, plans: ps }))
  if (!plans.length) errors.push('no plans')
  const nums = waves.map(w => w.wave)
  for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) errors.push(`wave numbers skip from ${nums[i - 1]} to ${nums[i]}`)
  const waveOf = new Map(plans.map(p => [p.id, p.fm.wave]))
  for (const p of plans) {
    for (const d of p.fm.depends_on) {
      const w = waveOf.get(d)
      if (w === undefined) warnings.push(`${p.id} depends on ${d}, which is not a plan of this phase (checked as a prior summary)`)
      else if (w >= p.fm.wave) errors.push(`${p.id} (wave ${p.fm.wave}) depends on ${d} (wave ${w}); a dependency must be in an earlier wave`)
    }
    if (knownAgents) for (const a of p.fm.agents) if (!knownAgents.has(a)) errors.push(`${p.id} names agent "${a}", which is not in the roster`)
    const forbidden = p.fm.files_forbidden ?? []
    for (const f of p.fm.files_modified) if (forbidden.some(x => overlaps(f, x))) errors.push(`${p.id}: ${f} is in both files_modified and files_forbidden`)
  }
  for (const w of waves) {
    for (let i = 0; i < w.plans.length; i++) for (let j = i + 1; j < w.plans.length; j++) {
      const shared = sharedFiles(w.plans[i].fm.files_modified, w.plans[j].fm.files_modified)
      if (shared.length) warnings.push(`wave ${w.wave}: ${w.plans[i].id} and ${w.plans[j].id} both modify ${shared.join(', ')}; they run one after the other`)
    }
  }
  return { waves, errors, warnings }
}

// A trailing `/` is a directory prefix.
export function overlaps(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/^\.\//, '')
  const x = n(a), y = n(b)
  if (x === y) return true
  if (y.endsWith('/') && x.startsWith(y)) return true
  if (x.endsWith('/') && y.startsWith(x)) return true
  return false
}

export const sharedFiles = (a: string[], b: string[]) => a.filter(x => b.some(y => overlaps(x, y)))

// Plans of one wave in run groups: plans in a group run in parallel, groups in
// order. Plans sharing a files_modified entry, or a sequential file another plan
// of the wave touches or declares, never run at the same time.
export function runGroups(plans: Plan[]): Plan[][] {
  const conflict = (a: Plan, b: Plan) =>
    sharedFiles(a.fm.files_modified, b.fm.files_modified).length > 0 ||
    sharedFiles(a.fm.sequential_files, [...b.fm.files_modified, ...b.fm.sequential_files]).length > 0 ||
    sharedFiles(b.fm.sequential_files, a.fm.files_modified).length > 0
  const groups: Plan[][] = []
  for (const p of plans) {
    // first group after the last group holding a conflicting plan
    let after = -1
    groups.forEach((g, i) => { if (g.some(q => conflict(p, q))) after = i })
    if (after + 1 < groups.length) groups[after + 1].push(p)
    else groups.push([p])
  }
  return groups
}

// ---- summaries -------------------------------------------------------------

export type SummaryStatus = 'Complete' | 'Complete with Warnings' | 'Partial' | 'Failed' | 'BLOCKED' | undefined

// Accepts `**Status**: X`, `## Status: X`, `Status: X`.
export function summaryStatus(text: string): SummaryStatus {
  const v = getField(text, 'Status') ?? text.match(/^#+\s*Status:\s*(.+)$/im)?.[1]
  if (!v) return undefined
  const s = v.replace(/[*`]/g, '').trim().toLowerCase()
  if (s.startsWith('complete with')) return 'Complete with Warnings'
  if (s.startsWith('complete') || s.startsWith('success') || s.startsWith('done')) return 'Complete'
  if (s.startsWith('partial')) return 'Partial'
  if (s.startsWith('fail')) return 'Failed'
  if (s.startsWith('blocked')) return 'BLOCKED'
  return undefined
}

export const succeeded = (s: SummaryStatus) => s === 'Complete' || s === 'Complete with Warnings'

// The dependency's Handoff Context, or its Files Modified and Completed Tasks.
export function handoffOf(summary: string): string {
  const h = getSection(summary, /^##\s+Handoff Context/i)
  if (h) return h
  return [getSection(summary, /^##\s+Files Modified/i), getSection(summary, /^##\s+Completed Tasks/i)].filter(Boolean).join('\n')
}

// ---- phase directory -------------------------------------------------------

export const phasePrefix = (n: number) => `${pad2(n)}-`
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-')

export function findPhaseDir(dirs: string[], n: number): string | undefined {
  return dirs.filter(d => d.startsWith(phasePrefix(n)) || d === pad2(n)).sort()[0]
}

export const isPlanFile = (f: string) => /^\d+-\d+-PLAN\.md$/.test(f)
export const summaryFileOf = (planId: string) => `${planId}-SUMMARY.md`
