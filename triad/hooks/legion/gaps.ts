// Roster gap analysis (Legion's GAP_ANALYSIS design, never a command there):
// coverage per production role, gap severity, intent-team validation and the
// agent limit, all in code. The report's prose is the model's.
import { PERSONAS, type Persona } from './personas.ts'
import { ROSTER_GAP_CONFIG } from './configdata.ts'
import { parseYaml } from './yaml.ts'
import { loadProject, today, type Io } from './io.ts'

export const GAP_CONFIG = '.planning/config/roster-gap-config.yaml'
export const GAP_REPORT = '.planning/gap-report.md'
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const
type Severity = typeof SEVERITIES[number]

export type GapConfig = {
  agent_limit: number
  role_categories: Record<string, { priority: string; description?: string; roles: Record<string, { description?: string; required_capabilities: string[]; coverage_indicators?: string[] }> }>
  scoring: { full_coverage: number; partial_coverage: number; minimal_coverage: number; no_coverage: number; weight_by_role_count: { single_agent: number; two_agents: number; three_or_more: number } }
  severity: Record<Severity, { min_gap_score: number }>
  intent_teams_to_check?: Record<string, { description?: string; required_agents: string[] }>
  replacement_candidates?: Record<string, { agent_id: string; reason: string; replacement_difficulty: string }[]>
}

export async function loadGapConfig(io: Io): Promise<{ config: GapConfig; source: string; errors: string[] }> {
  const text = await io.read(GAP_CONFIG)
  let raw: any = ROSTER_GAP_CONFIG
  let source = 'bundled default'
  if (text !== undefined) {
    try { raw = parseYaml(text.replace(/^---\s*$/m, '')); source = GAP_CONFIG } catch (e) { return { config: ROSTER_GAP_CONFIG.gap_analysis, source, errors: [`${GAP_CONFIG} did not parse: ${(e as Error).message}`] } }
  }
  const config = (raw?.gap_analysis ?? raw) as GapConfig
  const errors: string[] = []
  if (!Number.isInteger(config.agent_limit) || config.agent_limit <= 0) errors.push('agent_limit must be a positive integer')
  for (const [c, cat] of Object.entries(config.role_categories ?? {})) for (const [r, role] of Object.entries(cat.roles ?? {})) if (!role.required_capabilities?.length) errors.push(`${c}.${r} has no required_capabilities`)
  const t = SEVERITIES.map(s => config.severity?.[s]?.min_gap_score)
  if (t.some(x => typeof x !== 'number') || !(t[0]! > t[1]! && t[1]! > t[2]! && t[2]! > t[3]!)) errors.push('severity thresholds must be strictly ordered critical > high > medium > low')
  return { config, source, errors }
}

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2)
const agentWords = (p: Persona) => new Set(tokens([p.id, p.description, ...p.languages, ...p.frameworks, ...p.artifact_types, ...p.review_strengths].join(' ')))
// A capability is matched when at least half its words (stems of 4+ letters) appear in the agent's tags or description.
function capMatched(cap: string, words: Set<string>): boolean {
  const parts = tokens(cap.replace(/_/g, ' '))
  if (!parts.length) return false
  const hit = parts.filter(w => words.has(w) || [...words].some(x => x.length >= 4 && w.length >= 4 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5))))).length
  return hit / parts.length >= 0.5
}

export type RoleCoverage = { category: string; priority: string; role: string; description: string; agents: { id: string; strength: string; value: number }[]; score: number; pct: number; missing: string[] }
export type Gap = RoleCoverage & { gap: number; severity: Severity; recommendation: 'create_agent' | 'enhance_existing' | 'accept_gap' }

export function coverage(config: GapConfig, roster: Persona[]): RoleCoverage[] {
  const ids = new Set(roster.map(p => p.id))
  const words = new Map(roster.map(p => [p.id, agentWords(p)]))
  const sc = config.scoring
  const out: RoleCoverage[] = []
  for (const [category, cat] of Object.entries(config.role_categories ?? {})) {
    for (const [role, r] of Object.entries(cat.roles ?? {})) {
      const caps = r.required_capabilities ?? []
      const indicators = new Set((r.coverage_indicators ?? []).filter(i => ids.has(i)))
      const agents: RoleCoverage['agents'] = []
      const matchedCaps = new Set<string>()
      for (const p of roster) {
        const m = caps.filter(c => capMatched(c, words.get(p.id)!))
        if (!m.length && !indicators.has(p.id)) continue
        m.forEach(c => matchedCaps.add(c))
        const f = m.length / Math.max(1, caps.length)
        const [strength, value] = f >= 0.75 ? ['full', sc.full_coverage] : f >= 0.25 ? ['partial', sc.partial_coverage] : ['minimal', sc.minimal_coverage]
        agents.push({ id: p.id, strength, value })
      }
      agents.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
      const n = agents.length
      const w = n >= 3 ? sc.weight_by_role_count.three_or_more : n === 2 ? sc.weight_by_role_count.two_agents : sc.weight_by_role_count.single_agent
      const score = Math.round(agents.reduce((s, a) => s + a.value, 0) * w * 1000) / 1000
      out.push({ category, priority: cat.priority, role, description: r.description ?? '', agents, score, pct: Math.min(100, Math.round(score * 100)), missing: caps.filter(c => !matchedCaps.has(c)) })
    }
  }
  return out
}

export function severityOf(gap: number, priority: string, config: GapConfig): Severity {
  let i = SEVERITIES.findIndex(s => gap >= config.severity[s].min_gap_score)
  if (i < 0) i = 3
  if (priority === 'critical') i = Math.max(0, i - 1)
  if (priority === 'nice_to_have') i = Math.min(3, i + 1)
  return SEVERITIES[i]!
}

export function gaps(config: GapConfig, cov: RoleCoverage[]): Gap[] {
  const seen = new Set<string>()
  return cov.filter(r => r.pct < 100 && !seen.has(r.role) && seen.add(r.role)).map(r => {
    const gap = Math.round((1 - r.pct / 100) * 100) / 100
    const recommendation = !r.agents.length || gap >= 0.8 ? 'create_agent' : r.agents.some(a => a.strength === 'partial') ? 'enhance_existing' : 'accept_gap'
    return { ...r, gap, severity: severityOf(gap, r.priority, config), recommendation } as Gap
  }).sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.gap - a.gap)
}

export function intentCheck(config: GapConfig, ids: Set<string>) {
  const valid: string[] = []
  const invalid: { intent: string; missing: string[]; impact: string }[] = []
  for (const [intent, t] of Object.entries(config.intent_teams_to_check ?? {})) {
    const missing = (t.required_agents ?? []).filter(a => !ids.has(a))
    if (!missing.length) { valid.push(intent); continue }
    const primary = missing.includes(t.required_agents[0]!)
    invalid.push({ intent, missing, impact: primary ? 'CRITICAL: primary agent missing' : 'HIGH: fallback agent missing' })
  }
  return { valid, invalid, orphaned: [...new Set(invalid.flatMap(i => i.missing))] }
}

const DIFFICULTY = ['low', 'medium', 'high']
export function limitStatus(config: GapConfig, count: number, limitOverride?: number) {
  const limit = limitOverride ?? config.agent_limit
  const overage = Math.max(0, count - limit)
  const status = count > limit ? 'EXCEEDED' : count === limit ? 'AT_LIMIT' : 'COMPLIANT'
  const level = overage === 0 ? 'ok' : overage <= 5 ? 'warning' : 'error'
  const cands = Object.entries(config.replacement_candidates ?? {}).flatMap(([type, xs]) => (xs ?? []).map(x => ({ ...x, type })))
    .sort((a, b) => DIFFICULTY.indexOf(a.replacement_difficulty) - DIFFICULTY.indexOf(b.replacement_difficulty))
  const suggestions = cands.slice(0, Math.max(overage, status === 'AT_LIMIT' ? 1 : 0)).map(c => `${c.type === 'overlapping' ? 'consolidate' : 'remove'} ${c.agent_id} (${c.reason}; effort ${c.replacement_difficulty})`)
  return { count, limit, overage, status, level, suggestions }
}

export async function rosterLimit(io: Io) {
  const { config } = await loadGapConfig(io)
  const p = await loadProject(io)
  return limitStatus(config, PERSONAS.length, (p.settings as any).roster?.agent_limit)
}

export async function gapAnalysis(io: Io, opts: { category?: string; validate_intents?: boolean; output?: string; overwrite?: boolean } = {}): Promise<string> {
  const { config, source, errors } = await loadGapConfig(io)
  if (errors.length) return [`Gap config (${source}) is invalid:`, ...errors.map(e => `- ${e}`)].join('\n')
  if (opts.category && !config.role_categories[opts.category]) return `Unknown category "${opts.category}". Categories: ${Object.keys(config.role_categories).join(', ')}.`
  const out = opts.output ?? GAP_REPORT
  if (out.startsWith('/') || out.split('/').includes('..')) return `--output must be a path inside the project (got ${out}).`
  if ((await io.read(out)) !== undefined && !opts.overwrite) return `${out} already exists. Ask the user, then call again with overwrite.`
  const p = await loadProject(io)
  const roster = [...PERSONAS]
  const ids = new Set(roster.map(r => r.id))
  const dupes = roster.map(r => r.id).filter((x, i, a) => a.indexOf(x) !== i)
  const cfg = opts.category ? { ...config, role_categories: { [opts.category]: config.role_categories[opts.category]! } } : config
  const cov = coverage(cfg, roster)
  const gs = gaps(cfg, cov)
  const intents = intentCheck(config, ids)
  const lim = limitStatus(config, roster.length, (p.settings as any).roster?.agent_limit)
  const byDiv = new Map<string, string[]>()
  for (const r of roster) byDiv.set(r.division, [...(byDiv.get(r.division) ?? []), r.id])
  const count = (s: Severity) => gs.filter(g => g.severity === s).length
  const cats = [...new Set(cov.map(c => c.category))].map(c => { const rs = cov.filter(x => x.category === c); return { c, score: Math.round(rs.reduce((s, r) => s + r.pct, 0) / rs.length) } })
  const report = [
    '---', `date: ${today(io)}`, `agent_count: ${roster.length}`, `agent_limit: ${lim.limit}`, `limit_status: ${lim.status}`, `config: ${source}`, '---', '',
    '# Roster Gap Analysis Report', '',
    '## 1. Executive Summary', '', `**Current Roster:** ${roster.length} agents across ${byDiv.size} divisions`, `**Agent Limit:** ${lim.limit} (${lim.status}${lim.overage ? `, ${lim.overage} over, ${lim.level}` : ''})`,
    `**Critical Gaps:** ${count('critical')}`, `**High Priority Gaps:** ${count('high')}`, `**Medium Priority Gaps:** ${count('medium')}`, ...(dupes.length ? [`**Duplicate ids:** ${dupes.join(', ')}`] : []), '',
    '## 2. Critical Findings', '', ...(opts.validate_intents === false ? ['_Intent validation skipped._'] : intents.invalid.length
      ? ['| Intent | Missing agents | Impact |', '|--------|----------------|--------|', ...intents.invalid.map(i => `| ${i.intent} | ${i.missing.join(', ')} | ${i.impact} |`)]
      : [`All ${intents.valid.length} intent teams resolve to roster agents.`]), '',
    '## 3. Coverage Analysis by Requirement', '',
    ...cats.flatMap(({ c, score }) => [`### ${c} (${config.role_categories[c]!.priority}) — Category Score ${score}%`, '', '| Role | Covering Agents | Coverage Strength | Gaps |', '|------|-----------------|-------------------|------|',
      ...cov.filter(r => r.category === c).map(r => `| ${r.role} | ${r.agents.map(a => a.id).join(', ') || '—'} | ${r.pct}% (${r.agents.map(a => a.strength).join(', ') || 'none'}) | ${r.missing.join(', ') || '—'} |`), '']),
    '## 4. Gap Severity Summary', '', ...(gs.length ? ['| Severity | Role | Category | Gap | Recommendation |', '|----------|------|----------|-----|----------------|', ...gs.map(g => `| ${g.severity} | ${g.role} | ${g.category} | ${g.gap.toFixed(2)} | ${g.recommendation} |`)] : ['No gaps: every role is fully covered.']), '',
    '## 5. Recommendations', '', '_Pending: impact and recommendation prose._', '',
    ...(lim.suggestions.length ? ['### Agent limit', ...lim.suggestions.map(s => `- ${s}`), ''] : []),
    '## 6. Appendix: Agent Inventory', '', '| Division | Count | Agents |', '|----------|-------|--------|', ...[...byDiv].sort().map(([d, xs]) => `| ${d} | ${xs.length} | ${xs.join(', ')} |`), '',
  ].join('\n')
  await io.write(out, report)
  return [`Wrote ${out}. ${roster.length} agents (limit ${lim.limit}, ${lim.status}); gaps: ${count('critical')} critical, ${count('high')} high, ${count('medium')} medium, ${count('low')} low; ${intents.invalid.length} intent team(s) with missing agents.`,
    'Top gaps:', ...gs.slice(0, 5).map(g => `- ${g.severity} ${g.role} (${g.category}): ${g.pct}% covered, missing ${g.missing.join(', ') || '—'}; ${g.recommendation}`),
    'Write the impact and recommendation prose into section 5 (replace the _Pending_ line); all numbers are already in the report.'].join('\n')
}

// One line for /triad:status, from an existing report.
export async function gapSummary(io: Io): Promise<string | undefined> {
  const t = await io.read(GAP_REPORT)
  if (!t) return undefined
  const f = (k: string) => t.match(new RegExp(`^\\*\\*${k}:\\*\\* (.+)$`, 'm'))?.[1]
  return `Roster gaps (${t.match(/^date: (\S+)/m)?.[1] ?? '?'}): ${f('Critical Gaps')} critical, ${f('High Priority Gaps')} high; limit ${t.match(/^limit_status: (\S+)/m)?.[1]}`
}
