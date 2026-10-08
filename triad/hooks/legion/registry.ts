// The persona registry: lookup, scoring (agent-registry: exact 3, division 2,
// partial 1), review panels (review-panel Section 1) and rubrics.
import { PERSONAS, type Persona } from './personas.ts'
import { DEFAULT_RUBRICS, RUBRICS } from './data.ts'
import { PERSONA_BODIES } from './personasfull.ts'
import type { Io } from './io.ts'

export const BY_ID = new Map(PERSONAS.map(p => [p.id, p]))
export const ROSTER = new Set(PERSONAS.map(p => p.id))

// Exact id, then a unique id containing the name (Legion's fuzzy match).
export function findPersona(name: string): { persona?: Persona; ambiguous?: string[] } {
  const n = name.trim().toLowerCase()
  if (BY_ID.has(n)) return { persona: BY_ID.get(n) }
  const hits = PERSONAS.filter(p => p.id.includes(n) || p.name.toLowerCase() === n)
  if (hits.length === 1) return { persona: hits[0] }
  return hits.length ? { ambiguous: hits.map(h => h.id) } : {}
}

const DIVISION_WORDS: Record<string, string[]> = {
  Engineering: ['api', 'backend', 'frontend', 'code', 'server', 'database', 'sqlite', 'sql', 'storage', 'persistence', 'refactor', 'bug', 'implement', 'feature', 'service', 'cli', 'library'],
  Testing: ['test', 'tests', 'qa', 'verify', 'verification', 'coverage', 'benchmark', 'performance'],
  Design: ['ui', 'ux', 'design', 'visual', 'brand', 'accessibility', 'layout'],
  Marketing: ['marketing', 'campaign', 'social', 'seo', 'content', 'growth'],
  Product: ['product', 'roadmap', 'prioritize', 'feedback', 'docs', 'documentation'],
  'Project Management': ['plan', 'schedule', 'milestone', 'process', 'delivery'],
  Support: ['support', 'finance', 'legal', 'compliance', 'summary'],
  'Spatial Computing': ['xr', 'vr', 'ar', 'visionos', 'metal', 'spatial'],
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length > 1)

// Data formats every kind of project uses; they say nothing about who should do the work.
const GENERIC = new Set(['json', 'yaml', 'yml', 'toml', 'xml', 'csv', 'markdown', 'md', 'text', 'txt'])

// Concrete technologies imply the general area their personas list.
const IMPLIES: Record<string, string[]> = {
  database: ['sqlite', 'postgres', 'postgresql', 'mysql', 'sql', 'mongodb', 'redis', 'persistence', 'storage', 'orm', 'migration', 'migrations'],
}

export function score(p: Persona, text: string): number {
  const terms = new Set(words(text))
  for (const [area, xs] of Object.entries(IMPLIES)) if (xs.some(x => terms.has(x))) terms.add(area)
  const keys = [...p.languages, ...p.frameworks, ...p.artifact_types, ...p.review_strengths].map(k => k.toLowerCase()).filter(k => !GENERIC.has(k))
  let s = 0
  for (const k of new Set(keys)) {
    const parts = words(k)
    if (terms.has(k) || (parts.length > 1 && parts.every(w => terms.has(w)))) s += 3
    else if (parts.some(w => w.length > 3 && terms.has(w))) s += 1
  }
  // Id words ("app-store-optimizer") are a weak signal: an everyday word like
  // "store" must not outrank a persona's declared skills.
  const idParts = p.id.split('-').filter(w => w.length > 3 && !keys.includes(w))
  if (idParts.some(w => terms.has(w))) s += 1
  if ((DIVISION_WORDS[p.division] ?? []).some(w => terms.has(w))) s += 2
  return s
}

export function rank(text: string, filter: (p: Persona) => boolean = () => true): { persona: Persona; score: number }[] {
  return PERSONAS.filter(filter).map(p => ({ persona: p, score: score(p, text) }))
    .sort((a, b) => b.score - a.score || a.persona.id.localeCompare(b.persona.id))
}

export type Rubric = { name: string; criteria: { name: string; check: string }[] }
export function rubricOf(p: Persona): Rubric {
  return RUBRICS[p.id] ?? DEFAULT_RUBRICS[p.division] ?? DEFAULT_RUBRICS.Engineering
}

// Panel: review-capable personas (non-empty review_strengths), 2/3/4 reviewers
// for 1/2/3+ divisions touched, at most 2 per division, at least one Testing.
// `divisionsTouched` is a count or the divisions themselves; given the divisions,
// reviewers come from them first (Testing always counts as touched).
export function composePanel(text: string, divisionsTouched: number | string[], size?: number): Persona[] {
  const count = Array.isArray(divisionsTouched) ? divisionsTouched.length : divisionsTouched
  const want = Math.min(4, Math.max(2, size ?? (count >= 3 ? 4 : count === 2 ? 3 : 2)))
  const ranked = rank(text, p => p.review_strengths.length > 0 && p.tier !== 'haiku' && p.tier !== 'opus')
  const panel: Persona[] = []
  const per: Record<string, number> = {}
  const take = (p: Persona) => {
    if (panel.includes(p) || (per[p.division] ?? 0) >= 2) return false
    panel.push(p)
    per[p.division] = (per[p.division] ?? 0) + 1
    return true
  }
  const qa = BY_ID.get('testing-qa-verification-specialist')
  if (qa) take(qa)
  const inScope = Array.isArray(divisionsTouched) ? new Set([...divisionsTouched, 'Testing']) : undefined
  for (const pass of inScope ? [true, false] : [false]) {
    for (const r of ranked) {
      if (panel.length >= want) break
      if (pass && !inScope!.has(r.persona.division)) continue
      take(r.persona)
    }
  }
  return panel
}

// Classic mode: QA always, plus up to two by phase type.
export function classicReviewers(text: string): Persona[] {
  const out = [BY_ID.get('testing-qa-verification-specialist')!]
  for (const r of rank(text, p => p.review_strengths.length > 0 && p.division !== 'Testing' && p.tier === 'sonnet')) {
    if (out.length >= 3 || r.score === 0) break
    out.push(r.persona)
  }
  if (out.length < 2) out.push(BY_ID.get('engineering-senior-developer')!)
  return out
}

// Divisions a phase touches, from the files it changed and the plans' agents.
export function divisionsOf(files: string[], agents: string[]): string[] {
  const d = new Set<string>()
  for (const a of agents) { const p = BY_ID.get(a); if (p) d.add(p.division) }
  if (files.some(f => /(^|\/)tests?\/|test_|\.test\.|\.spec\./.test(f))) d.add('Testing')
  if (files.some(f => /\.(css|scss|sass|tsx|jsx|html|svg)$/.test(f))) d.add('Design')
  if (files.some(f => /\.(py|ts|js|go|rs|rb|java|sh|sql)$/.test(f))) d.add('Engineering')
  return [...d]
}

// The brief header a persona gets: its distilled core (SPEC: not the full file).
export function personaBrief(p: Persona): string {
  return `# Persona: ${p.name} (${p.id}, ${p.division})\n${p.core}`
}

// Review fix routing (review.md): first matching path pattern.
export function fixAgentFor(file: string): string {
  if (/^(skills|commands|agents|\.planning)\/.*\.md$/.test(file)) return 'engineering-senior-developer'
  if (/\.(tsx|jsx)$/.test(file) || /src\/(components|pages)\//.test(file)) return 'engineering-frontend-developer'
  if (/\.(ts|js|py|rb|go|rs)$/.test(file)) return 'engineering-backend-architect'
  if (/\.(css|scss|sass)$/.test(file)) return 'design-ux-architect'
  if (/(content|campaigns|marketing)\//.test(file)) return 'marketing-content-social-strategist'
  if (/(^|\/)(\.github\/workflows|Dockerfile|docker-compose)/.test(file)) return 'engineering-infrastructure-devops'
  return 'engineering-senior-developer'
}

// execution.agent_personality_verbosity: the full Legion body only when the
// project's settings.json says `full`; otherwise the condensed core.
export async function personaTextFor(io: Io): Promise<(p: Persona) => string> {
  let raw: any = {}
  try { raw = JSON.parse((await io.read('settings.json')) ?? '{}') } catch { /* loadProject warns */ }
  const full = raw?.execution?.agent_personality_verbosity === 'full'
  return p => (full && PERSONA_BODIES[p.id] ? `# Persona: ${p.name} (${p.id}, ${p.division})\n${PERSONA_BODIES[p.id]}` : personaBrief(p))
}
