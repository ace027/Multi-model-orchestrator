// The authority enforcer (authority-enforcer skill) in mod code: the matrix and
// its integrity check, domain detection, the Authority section of plan and
// reviewer briefs, out-of-domain finding filtering, the decision log, and
// directory-mapping checks on writes. Also the orchestrator's knowledge index.
import { DOMAINS } from './data.ts'
import { loadPhase, loadProject, today, type Io } from './io.ts'
import { globMatch } from './intents.ts'
import { BY_ID } from './registry.ts'
import { PERSONAS, type Persona } from './personas.ts'
import type { Finding, ReviewerReport } from './review.ts'
import { controlMode, profileOf, type Profile, type Scope } from './settings.ts'
import { inferCategory } from './spec.ts'
import { parseYaml } from './yaml.ts'

export const MATRIX_PATH = '.planning/config/authority-matrix.yaml'
export const MAPPINGS_PATH = '.planning/config/directory-mappings.yaml'

// User decision: agents-orchestrator is distilled into the orchestrator's guidance.
export const NOT_SPAWNED = 'agents-orchestrator'
export const NOT_SPAWNED_MSG = `${NOT_SPAWNED} is never spawned in Triad: its coordination role is the orchestrator's own guidance (the main loop plans, dispatches and reviews). Pick a specialist persona instead.`

// authority-enforcer's built-in registry, used when the matrix declares no domain keywords.
export const BUILT_IN_DOMAIN_KEYWORDS: Record<string, string[]> = {
  security: ['security', 'vulnerability', 'pentest', 'owasp', 'auth', 'authn', 'authz', 'encrypt', 'decrypt', 'sanitize', 'injection', 'xss', 'csrf', 'ssrf', 'token', 'session', 'cookie', 'jwt', 'credential', 'secret', 'password', 'hash', 'tls', 'ssl'],
  performance: ['performance', 'optimization', 'latency', 'throughput', 'slow', 'benchmark', 'profile', 'memory leak', 'cpu', 'hot path', 'n+1', 'cache', 'queue depth', 'p95', 'p99'],
  accessibility: ['accessibility', 'a11y', 'wcag', 'screen reader', 'aria', 'keyboard navigation', 'color contrast', 'focus ring', 'alt text'],
  'api-design': ['api', 'endpoint', 'rest', 'graphql', 'rpc', 'grpc', 'contract', 'schema', 'openapi', 'swagger', 'versioning', 'pagination'],
  database: ['database', 'schema', 'migration', 'index', 'query plan', 'sql', 'nosql', 'postgres', 'mysql', 'mongo', 'transaction', 'deadlock', 'foreign key', 'constraint'],
  frontend: ['frontend', 'ui', 'component', 'render', 'hydration', 'css', 'layout', 'responsive', 'react', 'vue', 'svelte', 'dom', 'bundle'],
  backend: ['backend', 'service', 'handler', 'controller', 'middleware', 'background job', 'worker', 'queue', 'rate limit', 'retry'],
  infrastructure: ['infrastructure', 'ci', 'cd', 'pipeline', 'deploy', 'docker', 'kubernetes', 'k8s', 'terraform', 'helm', 'env var', 'configuration', 'observability', 'logging', 'metrics', 'tracing'],
  testing: ['test', 'testing', 'unit test', 'integration test', 'e2e', 'fixture', 'mock', 'stub', 'coverage', 'flaky'],
  design: ['design', 'brand', 'typography', 'spacing', 'visual hierarchy', 'design system', 'token', 'palette', 'icon', 'layout grid'],
  marketing: ['marketing', 'campaign', 'content', 'copy', 'seo', 'growth', 'conversion', 'ctr', 'engagement', 'audience', 'channel'],
  mobile: ['ios', 'android', 'swift', 'swiftui', 'kotlin', 'jetpack', 'react native', 'flutter', 'mobile', 'app store', 'play store'],
}

const BUILT_IN_HIERARCHY = [
  { level: 1, examples: ['laravel', 'react', 'visionos', 'swiftui-volumetric'] },
  { level: 2, examples: ['api-design', 'database-design', 'accessibility'] },
  { level: 3, examples: ['security', 'performance', 'frontend-architecture'] },
  { level: 4, examples: ['full-stack', 'code-quality'] },
]

export type Matrix = {
  source: 'matrix' | 'builtin'
  agents: Record<string, { name: string; division: string; domains: string[] }>
  keywords: Record<string, string[]>
  conflict_resolution: Record<string, { rule?: string; exception?: string; note?: string }>
  hierarchy: { level: number; examples: string[] }[]
  errors: string[] // integrity
  warnings: string[]
}

const norm = (s: string) => String(s).toLowerCase().trim().replace(/[_\s]+/g, '-')

export function validateMatrix(agents: Matrix['agents']): string[] {
  const errors: string[] = []
  const owner: Record<string, string> = {}
  for (const [id, a] of Object.entries(agents)) {
    if (!BY_ID.has(id)) errors.push(`Unknown agent: ${id}`)
    for (const d of a.domains.map(norm)) {
      if (owner[d] && owner[d] !== id) errors.push(`Domain conflict: '${d}' assigned to both ${owner[d]} and ${id}`)
      else owner[d] = id
    }
  }
  return errors
}

export function parseMatrix(text: string | undefined): Matrix {
  const warnings: string[] = []
  let y: any
  if (text !== undefined) {
    try { y = parseYaml(text) } catch { y = undefined }
    if (!y?.agents || typeof y.agents !== 'object') warnings.push(`${MATRIX_PATH} does not parse or has no agents; using the built-in domains and keyword registry`)
  } else warnings.push(`${MATRIX_PATH} missing; using the built-in domains and keyword registry`)
  const ok = !!y?.agents && typeof y.agents === 'object'
  const agents: Matrix['agents'] = {}
  if (ok) {
    for (const [id, a] of Object.entries<any>(y.agents)) agents[id] = { name: String(a?.name ?? BY_ID.get(id)?.name ?? id), division: String(a?.division ?? BY_ID.get(id)?.division ?? ''), domains: (Array.isArray(a?.exclusive_domains) ? a.exclusive_domains : []).map(String) }
  } else {
    for (const [id, ds] of Object.entries<any>(DOMAINS)) agents[id] = { name: BY_ID.get(id)?.name ?? id, division: BY_ID.get(id)?.division ?? '', domains: (ds as string[]).map(String) }
  }
  const declared = ok && y.domains && typeof y.domains === 'object' ? Object.entries<any>(y.domains).filter(([, d]) => Array.isArray(d?.keywords) && d.keywords.length) : []
  const keywords = declared.length ? Object.fromEntries(declared.map(([k, d]) => [norm(k), d.keywords.map((x: unknown) => String(x).toLowerCase())])) : BUILT_IN_DOMAIN_KEYWORDS
  const hierarchy = ok && Array.isArray(y.specificity_hierarchy)
    ? y.specificity_hierarchy.map((h: any) => ({ level: Number(h?.level) || 3, examples: (Array.isArray(h?.examples) ? h.examples : []).map(norm) }))
    : BUILT_IN_HIERARCHY
  return {
    source: ok ? 'matrix' : 'builtin', agents, keywords, hierarchy,
    conflict_resolution: ok && y.conflict_resolution && typeof y.conflict_resolution === 'object' ? y.conflict_resolution : {},
    errors: validateMatrix(agents), warnings,
  }
}

let matrixCache: { text: string | undefined; m: Matrix } | undefined
export async function loadMatrix(io: Io): Promise<Matrix> {
  const text = await io.read(MATRIX_PATH)
  if (!matrixCache || matrixCache.text !== text) matrixCache = { text, m: parseMatrix(text) }
  return matrixCache.m
}

export const domainsOf = (m: Matrix, id: string) => m.agents[id]?.domains ?? []

const hit = (text: string, kw: string) => new RegExp(`(^|[^a-z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]/g, '[- _]')}($|[^a-z0-9])`).test(text)

// Highest keyword-hit score; ties go to the domain declared first; no hit is "general".
// Keywords match on word boundaries (Legion's plain substring makes "ci" match "decision").
export function detectDomain(text: string, m: Matrix): string {
  const t = text.toLowerCase()
  let best = 'general', top = 0
  for (const [d, kws] of Object.entries(m.keywords)) {
    const s = kws.filter(k => k && hit(t, k.toLowerCase())).length
    if (s > top) { best = d; top = s }
  }
  return best
}

// Specificity hierarchy: a listed example's level; else a framework-like single
// word is broad (3) and a compound "area-subarea" a subdomain (2).
export function specificity(d: string, m: Matrix): number {
  const n = norm(d)
  return m.hierarchy.find(h => h.examples.includes(n))?.level ?? (n.includes('-') ? 2 : 3)
}

// Topic matching: exact 10, one name's parts inside the other's 5 ("api-security"
// matches "api" and "security").
function matchScore(topic: string, domain: string): number {
  const a = norm(topic), b = norm(domain)
  if (a === b) return 10
  const pa = a.split('-'), pb = b.split('-')
  return pa.every(x => pb.includes(x)) || pb.every(x => pa.includes(x)) ? 5 : 0
}

// The owners of a topic among the active agents (conflict_resolution): the best
// match; on a tie, the more specific domain (specificity_hierarchy); a remaining
// tie is overlapping authority, so every tied agent owns it.
export function ownersOf(m: Matrix, topic: string, active: string[]): string[] {
  if (topic === 'general') return []
  const cands = [...new Set(active)].map(id => {
    let score = 0, level = 9
    for (const d of domainsOf(m, id)) {
      const s = matchScore(topic, d)
      if (s > score || (s === score && s > 0 && specificity(d, m) < level)) { score = s; level = specificity(d, m) }
    }
    return { id, score, level }
  }).filter(c => c.score > 0)
  if (!cands.length) return []
  const top = Math.max(...cands.map(c => c.score))
  const best = cands.filter(c => c.score === top)
  const lvl = Math.min(...best.map(c => c.level))
  return best.filter(c => c.level === lvl).map(c => c.id)
}

// Section 3: the Authority section prepended to plan and reviewer briefs, plus the
// mode constraints (read-only, file scope, escalation).
export function authoritySection(m: Matrix, agentId: string, active: string[], profile: Profile, mode: string): string {
  const out: string[] = []
  if (profile.authority_enforcement) {
    const own = domainsOf(m, agentId)
    const others = [...new Set(active)].filter(a => a !== agentId && domainsOf(m, a).length)
    if (own.length || others.length) {
      out.push('## Authority')
      if (own.length) out.push(`You have EXCLUSIVE AUTHORITY over: ${own.join(', ')}. Other active agents respect your judgment there.`)
      if (others.length) out.push('Co-agents own these domains; do not critique or override their findings there:', ...others.map(a => `- ${m.agents[a]!.name} (${a}): ${domainsOf(m, a).join(', ')}`))
    }
  }
  if (profile.read_only) out.push('## Advisory Mode', 'Control mode is read-only: analyze and suggest, but do not modify any file (writes are refused). Return your proposed changes as a list: path, change, rationale.')
  if (profile.file_scope_restriction) out.push('## File Scope Restriction', "Modify only the files in this plan's files_modified. If a task needs another file, stop and escalate.")
  if (profile.human_approval_required && profile.authority_enforcement) out.push('## Escalation', 'Decisions outside your scope (architecture, unplanned dependencies, out-of-scope files, schema, API contracts, deletions, CI/CD, overriding quality gates) go in an <escalation> block (severity: info|warning|blocker, type, decision, context). Keep working on in-scope items.')
  if (out.length) out.push(`Active control mode: ${mode}.`)
  return out.join('\n')
}

// The co-agents of a run: its scope's list, else the agents of the plans in the
// same wave as a plan scope.
export async function activeFor(io: Io, scope: Scope): Promise<string[] | undefined> {
  if (scope.active) return scope.active
  const m = scope.planId.match(/^(\d+)-\d+$/)
  if (!m) return undefined
  const p = await loadProject(io)
  const ph = await loadPhase(io, p, Number(m[1]))
  const plan = ph.plans.find(x => x.id === scope.planId)
  if (!plan) return []
  return [...new Set(ph.plans.filter(x => x.fm.wave === plan.fm.wave).map(x => x.fm.agents[0]).filter((a): a is string => !!a))]
}

// Every Legion agent start passes here: agents-orchestrator is refused, the scope
// gets its mode's resolved flags, plan and reviewer briefs get the Authority section.
export async function prepareRun(io: Io, persona: Persona, brief: string, scope: Scope): Promise<{ brief: string; scope: Scope } | { deny: string }> {
  if (persona.id === NOT_SPAWNED) return { deny: NOT_SPAWNED_MSG }
  const yaml = await io.read('.planning/config/control-modes.yaml')
  const s: Scope = { ...scope, profile: scope.profile ?? profileOf(scope.mode, yaml) }
  const active = await activeFor(io, s).catch(() => undefined)
  if (!active) return { brief, scope: s }
  const cm = await controlMode(io)
  const section = authoritySection(await loadMatrix(io), persona.id, active, cm.profile, cm.mode)
  return { brief: section ? `${section}\n\n---\n\n${brief}` : brief, scope: s }
}

// Section 4: out-of-domain findings from non-owners are removed; a blocker
// always stays, with an [OVERRIDE] note.
export type Removed = { finding: Finding; domain: string; owner: string; reason: string }
export function filterFindings(findings: Finding[], active: string[], m: Matrix, profile: Profile): { kept: Finding[]; removed: Removed[]; overrides: Removed[] } {
  if (!profile.domain_filtering) return { kept: findings, removed: [], overrides: [] }
  const kept: Finding[] = [], removed: Removed[] = [], overrides: Removed[] = []
  for (const f of findings) {
    const domain = detectDomain(`${f.criterion ?? ''} ${f.category} ${f.description}`, m)
    const owners = ownersOf(m, domain, active)
    if (!owners.length || owners.includes(f.agent)) { kept.push(f); continue }
    const owner = owners.join(', ')
    if (f.severity === 'blocker') {
      f.description = `${f.description} [OVERRIDE] Out-of-domain blocker kept per severity rule (domain owner: ${owner})`
      kept.push(f)
      overrides.push({ finding: f, domain, owner, reason: 'severity_override' })
    } else removed.push({ finding: f, domain, owner, reason: `Out-of-domain critique filtered — ${owner} is domain authority for '${domain}'` })
  }
  return { kept, removed, overrides }
}

// --- decision log (authority-enforcer Section 6) ---

export type LogEntry = { agents: string[]; topic: string; decision: string; owner?: string; reason: string }
export const logPath = (io: Io) => `.planning/logs/authority-decisions-${today(io)}.log`
export const logLine = (io: Io, e: LogEntry) =>
  `${io.now().toISOString()} | agents=${e.agents.join(',') || '-'} | topic=${e.topic} | decision=${e.decision} | owner=${e.owner || '-'} | reason=${e.reason.replace(/\s*\n\s*/g, ' ')}`

let chain: Promise<unknown> = Promise.resolve()
export function logDecision(io: Io, e: LogEntry): Promise<void> {
  const next = chain.then(async () => {
    const path = logPath(io)
    await io.write(path, ((await io.read(path)) ?? '') + logLine(io, e) + '\n')
  }).catch(() => undefined)
  chain = next
  return next
}

// The review run's call: filters each report in place, logs what was removed or
// overridden, and returns lines for the cycle delta.
export async function filterReview(io: Io, reports: ReviewerReport[], active: string[], cycle: number): Promise<string[]> {
  const cm = await controlMode(io)
  if (!cm.profile.domain_filtering) return []
  const m = await loadMatrix(io)
  const removed: Removed[] = []
  for (const r of reports) {
    const f = filterFindings(r.findings, active, m, cm.profile)
    r.findings = f.kept
    removed.push(...f.removed)
    for (const o of f.overrides) await logDecision(io, { agents: active, topic: o.domain, decision: 'kept (blocker override)', owner: o.owner, reason: `${o.finding.agent}: ${o.finding.file}: ${o.finding.description.slice(0, 160)}` })
  }
  for (const x of removed) await logDecision(io, { agents: active, topic: x.domain, decision: 'finding filtered', owner: x.owner, reason: `${x.reason}; ${x.finding.agent} [${x.finding.severity}] ${x.finding.file}: ${x.finding.description.slice(0, 160)}` })
  return removed.length ? [`cycle ${cycle}: ${removed.length} out-of-domain finding(s) filtered (${removed.map(x => `${x.finding.agent} on ${x.domain}, owner ${x.owner}`).join('; ')}); see ${logPath(io)}`] : []
}

// --- directory mappings on writes ---

let mapCache: { text: string; y: any } | undefined
export type MappingCheck = { action: 'ok' | 'warn' | 'deny'; reason?: string }
export async function checkMapping(io: Io, rel: string): Promise<MappingCheck> {
  const text = await io.read(MAPPINGS_PATH)
  if (text === undefined || rel.startsWith('.triad/')) return { action: 'ok' }
  if (mapCache?.text !== text) {
    let y: any
    try { y = parseYaml(text) ?? {} } catch { y = {} }
    mapCache = { text, y }
  }
  const y = mapCache.y
  const strictness = String(y.enforcement?.strictness ?? y.rules?.strictness ?? y.strictness ?? 'warn')
  if (strictness === 'off') return { action: 'ok' }
  const ex = y.enforcement?.exceptions ?? y.rules?.exceptions
  const exceptions: string[] = (Array.isArray(ex) ? ex : []).map(String)
  if (exceptions.some(x => globMatch(rel, x) || (x.endsWith('/**') && rel.startsWith(x.slice(0, -2))))) return { action: 'ok' }
  const category = inferCategory(rel)
  const allowed: string[] = (Array.isArray(y.mappings?.[category]?.paths) ? y.mappings[category].paths : []).map((a: unknown) => String(a).replace(/\/+$/, ''))
  if (!allowed.length) return { action: 'ok' }
  const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.'
  if (allowed.some(a => dir === a || dir.startsWith(a + '/') || a === '.')) return { action: 'ok' }
  const suggested = `${allowed[0]}/${rel.split('/').pop()}`
  const reason = `${rel} (${category}) is outside the directory mappings for ${category} (${allowed.join(', ')}); suggested location: ${suggested}`
  if (strictness !== 'strict') return { action: 'warn', reason }
  // Autonomous (user decision D4): warned and logged, never blocked.
  return (await controlMode(io)).mode === 'autonomous' ? { action: 'warn', reason: `${reason} (strict, but control mode autonomous only warns)` } : { action: 'deny', reason }
}

// --- the orchestrator's Dynamic Knowledge Index (byte-stable per plugin version) ---

export function frontmatterDescription(md: string): string | undefined {
  const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1]
  const d = fm?.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  return d?.replace(/^(["'])(.*)\1$/, '$2')
}

export function knowledgeIndex(commands: { name: string; description: string }[], personas: readonly Persona[] = PERSONAS): string {
  const byDiv = new Map<string, string[]>()
  for (const p of personas) if (p.id !== NOT_SPAWNED) byDiv.set(p.division, [...(byDiv.get(p.division) ?? []), p.id])
  const divs = [...byDiv.keys()].sort()
  return [
    '## Dynamic Knowledge Index',
    'Commands (their files are the procedure; read the one you run):',
    ...[...commands].sort((a, b) => a.name.localeCompare(b.name)).map(c => `- /triad:${c.name}: ${c.description}`),
    `Personas (${divs.reduce((n, d) => n + byDiv.get(d)!.length, 0)} spawnable; persona_brief ranks them, and their distilled cores are in the mod):`,
    ...divs.map(d => `- ${d} (${byDiv.get(d)!.length}): ${byDiv.get(d)!.sort().join(', ')}`),
  ].join('\n')
}

// Reads commands/*.md under the plugin root (or its parent, when the root is .claude-plugin).
export async function loadKnowledgeIndex(io: Io): Promise<string> {
  const commands: { name: string; description: string }[] = []
  for (const dir of ['commands', '../commands']) {
    const files = (await io.list(dir)).filter(f => !f.dir && f.name.endsWith('.md')).map(f => f.name).sort()
    for (const f of files) {
      const d = frontmatterDescription((await io.read(`${dir}/${f}`)) ?? '')
      if (d) commands.push({ name: f.slice(0, -3), description: d })
    }
    if (commands.length) break
  }
  return knowledgeIndex(commands)
}
