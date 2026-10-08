// Spec pipeline (spec-pipeline skill): the deterministic stages in code. Gather
// (stage 1), the activation trigger, the completeness and open-question check
// that gives the critique verdict (stage 4), path validation against
// directory-mappings.yaml, and the complexity assessment (stage 5). Research,
// writing and the critique's judgment are persona work driven by /triad:spec.
import { loadPhase, loadProject, type Io } from './io.ts'
import { getSection, pad2, setSection, slugify } from './planning.ts'
import { parseYaml } from './yaml.ts'

export const specPath = (n: number, name: string) => `.planning/specs/${pad2(n)}-${slugify(name)}-spec.md`

const reqIds = (s: string) => [...new Set(s.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? [])]

async function phaseOf(io: Io, n?: number) {
  const p = await loadProject(io)
  const num = n ?? p.state?.phase
  const info = p.roadmap?.phases.find(x => x.phase === num)
  return { p, n: num, info }
}

// Activation trigger: run, offer (ask first) or skip.
export async function specTrigger(io: Io, n?: number, flag = false): Promise<{ action: 'run' | 'offer' | 'skip'; reason: string }> {
  if (flag) return { action: 'run', reason: '--spec given' }
  const { p, n: num, info } = await phaseOf(io, n)
  if (!info || !num) return { action: 'skip', reason: 'phase not in ROADMAP.md' }
  const ph = await loadPhase(io, p, num)
  const ctx = ph.rel ? (await io.read(`${ph.rel}/CONTEXT.md`)) ?? '' : ''
  if (/^spec_required:\s*true\s*$/m.test(ctx)) return { action: 'run', reason: 'CONTEXT.md spec_required: true' }
  const reqs = reqIds(info.requirements).length
  const complexity = (p.roadmapText ?? '').match(new RegExp(`### Phase ${num}:[\\s\\S]*?complexity\\**:?\\**\\s*(\\w+)`, 'i'))?.[1]?.toLowerCase()
  if (reqs >= 4 && complexity === 'high') return { action: 'offer', reason: `${reqs} requirements and complexity high` }
  const files = ph.plans.flatMap(x => x.fm.files_modified)
  if (files.length) {
    const prior: string[] = []
    for (const d of p.phaseDirs) {
      if (d.startsWith(`${pad2(num)}-`)) continue
      for (const f of (await io.list(`.planning/phases/${d}`)).filter(e => e.name.endsWith('-SUMMARY.md'))) prior.push((await io.read(`.planning/phases/${d}/${f.name}`)) ?? '')
    }
    const surface = !files.some(f => prior.some(t => t.includes(f)))
    if (surface && (reqs >= 3 || (info.plans ?? ph.plans.length) >= 3)) return { action: 'offer', reason: 'new architectural surface' }
  }
  return { action: 'skip', reason: 'no activation condition holds' }
}

// Stage 1: the requirements summary, from ROADMAP, REQUIREMENTS and PROJECT.
export async function specGather(io: Io, n?: number): Promise<string> {
  const { p, n: num, info } = await phaseOf(io, n)
  if (!info || !num) return `Phase ${n ?? '?'} is not in ROADMAP.md.`
  const path = specPath(num, info.name)
  const existing = (await io.read(path)) !== undefined
  const reqText = await io.read('.planning/REQUIREMENTS.md')
  const ids = reqIds(info.requirements)
  const pool = `${reqText ?? ''}\n${p.project ?? ''}`
  const expand = (id: string) => pool.split('\n').find(l => l.includes(id) && l.replace(id, '').replace(/[|*\-\s:]/g, '').length > 3)?.replace(/^[\s|*-]+/, '').replace(/\|/g, '—').trim() ?? '(no description found)'
  const constraints = getSection(p.project ?? '', /^##\s+(Constraints|Tech Stack|Architecture)/im) ?? ''
  const prev = p.roadmap!.phases.filter(x => x.phase < num).map(x => `Phase ${x.phase} (${x.name})`)
  const maps = await io.read('.planning/config/directory-mappings.yaml')
  return [
    `## Requirements Summary — Phase ${num}: ${info.name}`, '',
    `**Goal:** ${info.goal}`, `**Dependencies:** ${prev.slice(-2).join(', ') || 'none'}`, `**Spec path:** ${path}${existing ? ' (EXISTS — ask the user: overwrite or keep)' : ''}`, '',
    '### Functional Requirements', '| ID | Description |', '|----|-------------|', ...(ids.length ? ids.map(id => `| ${id} | ${expand(id)} |`) : ['| — | (no requirement ids on this phase; use the goal and success criteria) |']), '',
    '### Success Criteria (sharpen each into a machine-checkable statement)', ...(info.criteria.length ? info.criteria.map(c => `- ${c}`) : ['- (none in ROADMAP.md)']), '',
    '### Project Constraints', constraints.trim() || '(none recorded in PROJECT.md)', '',
    reqText === undefined ? 'Note: no REQUIREMENTS.md; descriptions come from PROJECT.md and ROADMAP.md.' : '',
    maps ? 'Directory mappings exist (.planning/config/directory-mappings.yaml): deliverable paths will be validated.' : '',
    (await io.read('.planning/CODEBASE.md')) !== undefined ? 'A codebase map exists: research with map action query first.' : '',
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n').trim()
}

// --- the spec document ---

const REQUIRED = ['Overview', 'Requirements', 'Architecture', 'API and Type Contracts', 'File Placement', 'Data and Control Flow', 'Compatibility Constraints', 'Failure Modes', 'Acceptance Checks', 'Deliverables', 'Open Questions', 'Complexity Assessment']

const sectionOf = (doc: string, name: string) => getSection(doc, new RegExp(`^##\\s+${name.replace(/ /g, '\\s+')}\\s*$`, 'im'))
const tableRows = (body: string) => body.split('\n').filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l)).slice(1).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))

export type Deliverable = { name: string; path: string; deps: string; override?: string; description: string }
export function parseDeliverables(doc: string): Deliverable[] {
  const body = sectionOf(doc, 'Deliverables') ?? ''
  return body.split(/^###\s+/m).slice(1).map(chunk => {
    const name = chunk.split('\n')[0]!.trim()
    const field = (k: string) => chunk.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(.+)`))?.[1]?.trim() ?? ''
    return { name, path: field('Path').replace(/`/g, ''), deps: field('Dependencies'), override: /\*\*Path Override:\*\*\s*true/i.test(chunk) ? field('Override Reason') || 'no reason given' : undefined, description: `${field('Purpose')} ${field('Key Content')}` }
  })
}

export type OpenQuestion = { q: string; blocking: boolean; default: string }
export function parseOpenQuestions(doc: string): OpenQuestion[] {
  const body = sectionOf(doc, 'Open Questions') ?? ''
  return tableRows(body).filter(r => r.length >= 3 && r[1] && !/^\{/.test(r[1])).map(r => ({ q: r[1]!, blocking: /^blocking/i.test(r[2] ?? ''), default: r[3] ?? '' }))
}

// 8.1 category inference and 8.2 path validation.
export function inferCategory(path: string, description = ''): string {
  const d = description.toLowerCase()
  const has = (...w: string[]) => w.some(x => d.includes(x.toLowerCase()))
  if (/\.(test|spec)\.\w+$/.test(path) || has('test', 'fixture')) return 'tests'
  if (/(^|\/)routes\//.test(path) || /pages\/api\//.test(path) || has('route', 'endpoint', 'api', 'handler')) return 'routes'
  if (/(^|\/)components\//.test(path) || path.endsWith('.tsx') || has('component', 'widget', ' view')) return 'components'
  if (/(^|\/)services\//.test(path) || has('service', 'business logic', 'domain')) return 'services'
  if (/(^|\/)(utils|helpers)\//.test(path) || has('util', 'helper', 'common', 'shared')) return 'utils'
  if (/(^|\/)(types|interfaces)\//.test(path) || path.endsWith('.d.ts') || has('type', 'interface', 'model', 'schema')) return 'types'
  if (/(^|\/)config\//.test(path) || has('config', 'settings', 'environment')) return 'config'
  if (/(^|\/)middleware\//.test(path) || has('middleware', 'plugin', 'interceptor')) return 'middleware'
  if (/(^|\/)(public|assets)\//.test(path) || has('asset', 'static', 'image', 'font')) return 'assets'
  if (/(^|\/)styles\//.test(path) || /\.s?css$/.test(path) || has('style', 'css', 'theme')) return 'styles'
  if (/(^|\/)(hooks|composables)\//.test(path) || has('hook', 'composable')) return 'hooks'
  if (/(^|\/)(stores|state)\//.test(path) || has('store', 'redux', 'pinia', 'mobx')) return 'stores'
  return 'general'
}

export type PathResult = { deliverable: string; path: string; category: string; valid: boolean; note: string }
export function validatePaths(ds: Deliverable[], mappingsYaml?: string): { strictness: string; results: PathResult[] } {
  if (!mappingsYaml) return { strictness: 'off', results: [] }
  const y = (parseYaml(mappingsYaml) ?? {}) as any
  const strictness = String(y.enforcement?.strictness ?? y.strictness ?? 'warn')
  const results = ds.map(d => {
    const category = inferCategory(d.path, d.description)
    if (d.override) return { deliverable: d.name, path: d.path, category, valid: true, note: `Path override accepted: ${d.override}` }
    const allowed: string[] = (y.mappings?.[category]?.paths ?? []).map(String)
    if (strictness === 'off' || !allowed.length) return { deliverable: d.name, path: d.path, category, valid: true, note: allowed.length ? 'validation off' : `no mappings for '${category}'` }
    const dir = d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : '.'
    if (allowed.some(a => dir.startsWith(a) || a.startsWith(dir))) return { deliverable: d.name, path: d.path, category, valid: true, note: 'ok' }
    const suggestion = `${allowed[0]}/${d.path.split('/').pop()}`
    return { deliverable: d.name, path: d.path, category, valid: strictness !== 'strict', note: `not in ${allowed.join(', ')}; suggested ${suggestion}` }
  })
  return { strictness, results }
}

export type SpecCheck = { path: string; verdict: 'PASS' | 'CAUTION' | 'REWORK'; findings: string[]; checklist: { item: string; ok: boolean }[]; blocking: string[] }

// Stage 4's machine-checkable part, and the stop gate /triad:plan reads.
export async function specCheck(io: Io, n?: number): Promise<SpecCheck | string> {
  const { n: num, info } = await phaseOf(io, n)
  if (!info || !num) return `Phase ${n ?? '?'} is not in ROADMAP.md.`
  const path = specPath(num, info.name)
  const doc = await io.read(path)
  if (doc === undefined) return `No spec for phase ${num} (${path}).`
  const findings: string[] = []
  const missing = REQUIRED.filter(s => sectionOf(doc, s) === undefined)
  if (missing.length) findings.push(`Missing sections: ${missing.join(', ')}`)
  const reqTable = sectionOf(doc, 'Requirements') ?? ''
  const uncovered = reqIds(info.requirements).filter(id => !reqTable.includes(id))
  if (uncovered.length) findings.push(`Requirements not in the spec's Requirements table: ${uncovered.join(', ')}`)
  const api = (sectionOf(doc, 'API and Type Contracts') ?? '').trim()
  if (!api) findings.push('API and Type Contracts is empty (write the contracts, or "None -- no API or type contract changes")')
  const ds = parseDeliverables(doc)
  const noPath = ds.filter(d => !d.path)
  if (!ds.length) findings.push('No deliverables (### entries under ## Deliverables)')
  if (noPath.length) findings.push(`Deliverables without a path: ${noPath.map(d => d.name).join(', ')}`)
  const checks = tableRows(sectionOf(doc, 'Acceptance Checks') ?? '').filter(r => r[0] && !/^\{/.test(r[0]))
  if (!checks.length) findings.push('No acceptance checks')
  const oq = parseOpenQuestions(doc)
  const blocking = oq.filter(q => q.blocking).map(q => q.q)
  const noDefault = oq.filter(q => !q.blocking && (!q.default || /^(none|—|-|tbd)$/i.test(q.default)))
  if (blocking.length) findings.push(`Blocking open questions (planning halts until resolved): ${blocking.join('; ')}`)
  if (noDefault.length) findings.push(`Non-blocking questions without a default chosen by the spec: ${noDefault.map(q => q.q).join('; ')}`)
  const pv = validatePaths(ds, await io.read('.planning/config/directory-mappings.yaml'))
  const bad = pv.results.filter(r => r.note.startsWith('not in'))
  if (bad.length) findings.push(`Path ${pv.strictness === 'strict' ? 'violations (blocked)' : 'warnings'}: ${bad.map(r => `${r.path} (${r.category}: ${r.note})`).join('; ')}`)
  const decisions = tableRows(getSection(doc, /^###\s+Key Decisions/im) ?? '').filter(r => r[0] && !/^\{/.test(r[0]))
  const weak = decisions.filter(r => !r[2] || r[2].length < 15)
  if (weak.length) findings.push(`Key decisions with thin rationale: ${weak.map(r => r[0]).join(', ')}`)
  const checklist = [
    { item: 'Every phase requirement is in the Requirements table', ok: !uncovered.length },
    { item: 'Every deliverable has a path', ok: ds.length > 0 && !noPath.length },
    { item: 'API/type contracts explicit or explicitly none', ok: !!api },
    { item: 'Acceptance checks present', ok: checks.length > 0 },
    { item: 'No Blocking open questions; every Non-blocking one has a default', ok: !blocking.length && !noDefault.length },
  ]
  const rework = missing.length > 0 || checklist.some(c => !c.ok) || (bad.length > 0 && pv.strictness === 'strict')
  const verdict = rework ? 'REWORK' : weak.length || bad.length ? 'CAUTION' : 'PASS'
  return { path, verdict, findings, checklist, blocking }
}

export const renderSpecCheck = (c: SpecCheck | string) => typeof c === 'string' ? c : [
  `Spec check ${c.path}: ${c.verdict}`, '', ...c.checklist.map(x => `- [${x.ok ? 'x' : ' '}] ${x.item} — ${x.ok ? 'PASS' : 'FAIL'}`),
  ...(c.findings.length ? ['', 'Findings:', ...c.findings.map(f => `- ${f}`)] : []),
].join('\n')

// Stage 5: rating, written into the spec's Complexity Assessment section.
export async function specAssess(io: Io, n?: number): Promise<string> {
  const c = await specCheck(io, n)
  if (typeof c === 'string') return c
  const doc = (await io.read(c.path))!
  const reqs = tableRows(sectionOf(doc, 'Requirements') ?? '').filter(r => r[0] && !/^\{/.test(r[0])).length
  const ds = parseDeliverables(doc)
  let created = 0, modified = 0, config = 0
  for (const d of ds) {
    if (/(^|\/)(config|\.github)\/|\.(json|ya?ml|toml|ini|env)$/.test(d.path)) config++
    else if (d.path && (await io.read(d.path)) !== undefined) modified++
    else created++
  }
  // dependency depth over deliverables that name each other
  const depth = new Map<string, number>()
  const depthOf = (d: Deliverable, seen = new Set<string>()): number => {
    if (depth.has(d.name)) return depth.get(d.name)!
    if (seen.has(d.name)) return 1
    seen.add(d.name)
    const on = ds.filter(o => o !== d && (d.deps.includes(o.name) || (o.path && d.deps.includes(o.path))))
    const v = on.length ? 1 + Math.max(...on.map(o => depthOf(o, seen))) : 1
    depth.set(d.name, v)
    return v
  }
  const waves = Math.min(3, Math.max(1, ...ds.map(d => depthOf(d))))
  const decisions = tableRows(getSection(doc, /^###\s+Key Decisions/im) ?? '').filter(r => r[0] && !/^\{/.test(r[0])).length
  const rating = reqs >= 4 || ds.length >= 5 || (waves >= 2 && decisions >= 2) ? 'Complex' : reqs >= 2 || ds.length >= 3 || waves >= 2 ? 'Medium' : 'Simple'
  const plans = rating === 'Complex' ? Math.max(3, Math.ceil(ds.length / 2)) : rating === 'Medium' ? 2 : 1
  const proposals = rating === 'Complex' ? 'Recommended' : rating === 'Medium' ? 'Optional' : 'Skip'
  const section = [
    '## Complexity Assessment', '', `**Rating:** ${rating}`, '', '| Metric | Value |', '|--------|-------|',
    `| Requirements | ${reqs} |`, `| Deliverables | ${ds.length} (new: ${created}, modify: ${modified}, config: ${config}) |`,
    `| Estimated waves | ${waves} |`, `| Estimated plans | ${plans} |`, `| Competing proposals | ${proposals} |`, '',
    `**Rationale:** ${reqs} requirements, ${ds.length} deliverables over ${waves} dependency layer${waves > 1 ? 's' : ''}${decisions ? `, ${decisions} key decisions` : ''}.`, '',
    '**Acceptance checklist:**', ...c.checklist.map(x => `- ${x.item}: ${x.ok ? 'PASS' : 'FAIL'}`), '',
    `**Critique verdict:** ${c.verdict}`, '',
    `**Recommended next step:** ${c.blocking.length ? 'Resolve the Blocking open questions, then ' : ''}/triad:plan ${n ?? ''}${proposals === 'Recommended' ? ' (with competing architecture proposals)' : ''}`.replace(/ +\)/, ')'),
  ].join('\n')
  await io.write(c.path, setSection(doc, '## Complexity Assessment', section.replace(/^## Complexity Assessment\n/, '')))
  return [`## Spec Pipeline Complete — ${c.path}`, '', `**Rating:** ${rating}`, `**Deliverables identified:** ${ds.length}`, `**Open questions:** ${parseOpenQuestions(doc).length} (${c.blocking.length} blocking)`, `**Competing proposals recommended:** ${proposals === 'Recommended' ? 'Yes' : 'No'}`, `**Critique verdict:** ${c.verdict}`].join('\n')
}
