// Intent router (intent-router skill) in code: --just-*/--skip-* flags with
// strict validation, team templates, plan filtering, and natural-language
// routing over intent-teams.yaml (bundled, or the project's copy).
import { INTENT_TEAMS } from './configdata.ts'
import { parseYaml } from './yaml.ts'
import type { Io } from './io.ts'
import type { Plan } from './planning.ts'

export type IntentConfig = { intents: Record<string, any>; task_types: Record<string, string[]>; validation: any; nl_patterns: Record<string, any>; command_routes: Record<string, any>; context_rules: Record<string, any> }

const CONFIG = '.planning/config/intent-teams.yaml'

export async function loadIntentConfig(io: Io): Promise<{ config: IntentConfig; warnings: string[] }> {
  const warnings: string[] = []
  let raw: any = INTENT_TEAMS
  const text = await io.read(CONFIG)
  if (text !== undefined) {
    try {
      raw = parseYaml(text)
    } catch (e) {
      warnings.push(`${CONFIG} is not valid YAML (${(e as Error).message}); using the bundled intent teams`)
    }
  }
  const config = { intents: raw?.intents ?? {}, task_types: raw?.task_types ?? {}, validation: raw?.validation ?? {}, nl_patterns: raw?.nl_patterns ?? {}, command_routes: raw?.command_routes ?? {}, context_rules: raw?.context_rules ?? {} }
  return { config, warnings }
}

// Intent name <-> flag. --just-security names the security-only intent.
export const INTENT_FLAGS: Record<string, string> = { harden: '--just-harden', document: '--just-document', 'security-only': '--just-security', 'skip-frontend': '--skip-frontend', 'skip-backend': '--skip-backend' }
const FLAG_INTENT = Object.fromEntries(Object.entries(INTENT_FLAGS).map(([k, v]) => [v, k]))
const PRIMARY = new Set(['harden', 'document', 'security-only'])

// Non-intent flags each command accepts (with or without a value).
export const COMMAND_FLAGS: Record<string, string[]> = {
  build: ['--phase', '--wave', '--rerun', '--dry-run', '--two-wave', '--single-wave', '--skip-gates', '--skip-architecture', '--skip-security'],
  review: ['--phase', '--panel', '--classic', '--security', '--dry-run'],
  plan: ['--phase', '--auto', '--auto-refine', '--skip-board', '--skip-security', '--security', '--spec', '--domain', '--dry-run'],
  quick: ['--dry-run', '--fix'],
}

export type ParsedFlags = {
  rawFlags: string[]
  intents: string[]
  filters: { skipFrontend: boolean; skipBackend: boolean }
  primaryIntent: string | null
  hasConflicts: boolean
  other: Record<string, string | true>
  positional: string[]
  unknown: { flag: string; suggestion?: string }[]
}

export function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0]![j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length]![b.length]!
}

export function tokenize(args: string): string[] {
  return [...args.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]!)
}

export function parseIntentFlags(args: string[] | string, command: string): ParsedFlags {
  const list = typeof args === 'string' ? tokenize(args) : args
  const r: ParsedFlags = { rawFlags: [], intents: [], filters: { skipFrontend: false, skipBackend: false }, primaryIntent: null, hasConflicts: false, other: {}, positional: [], unknown: [] }
  const known = [...Object.values(INTENT_FLAGS), ...(COMMAND_FLAGS[command] ?? []), '--unsafe-unknown-flags']
  const seen = new Set<string>()
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!
    if (!arg.startsWith('--')) { r.positional.push(arg); continue }
    const [name, value] = [arg.toLowerCase().split('=')[0]!, arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : undefined]
    if (seen.has(name)) continue
    seen.add(name)
    const intent = FLAG_INTENT[name]
    if (intent) {
      r.rawFlags.push(name)
      if (intent === 'skip-frontend') r.filters.skipFrontend = true
      else if (intent === 'skip-backend') r.filters.skipBackend = true
      r.intents.push(intent)
      if (PRIMARY.has(intent)) r.primaryIntent ??= intent
      continue
    }
    if (known.includes(name)) {
      // --phase 3 and --phase=3 both work
      const next = list[i + 1]
      r.other[name] = value ?? (next !== undefined && !next.startsWith('--') && /^(--phase|--wave)$/.test(name) ? (i++, next) : true)
      continue
    }
    const best = known.map(k => ({ k, d: levenshtein(name, k) })).sort((a, b) => a.d - b.d)[0]
    r.unknown.push({ flag: name, suggestion: best && best.d <= 2 ? best.k : undefined })
  }
  r.hasConflicts = r.intents.filter(i => PRIMARY.has(i)).length > 1
  return r
}

export type Validation = { valid: boolean; errors: string[]; suggestions: string[]; info: string[] }

const triad = (s: string) => s.replace(/\/legion:/g, '/triad:')

export function validateFlagCombination(f: ParsedFlags, command: string, config: IntentConfig): Validation {
  const errors: string[] = []
  const suggestions: string[] = []
  const info: string[] = []
  const unsafe = '--unsafe-unknown-flags' in f.other
  for (const u of f.unknown) {
    if (unsafe) { info.push(`Ignoring unknown flag ${u.flag} (--unsafe-unknown-flags)`); continue }
    errors.push(u.suggestion ? `Unknown flag: ${u.flag}. Did you mean ${u.suggestion}?` : `Unknown flag: ${u.flag}. Valid flags for /triad:${command}: ${[...Object.values(INTENT_FLAGS), ...(COMMAND_FLAGS[command] ?? [])].join(', ')}`)
  }
  const has = (i: string) => f.intents.includes(i)
  for (const rule of config.validation?.mutual_exclusion ?? []) {
    if ((rule.flags as string[]).every(has)) {
      errors.push(triad(rule.error))
      suggestions.push(`Use only ${INTENT_FLAGS[rule.flags[0]] ?? `--${rule.flags[0]}`} for this operation`)
    }
  }
  if (f.hasConflicts && !errors.some(e => /together/.test(e))) errors.push(`Only one --just-* intent at a time (got ${f.intents.filter(i => PRIMARY.has(i)).map(i => INTENT_FLAGS[i]).join(', ')}).`)
  for (const rule of config.validation?.requires_command ?? []) {
    if (has(rule.flag) && !(rule.commands as string[]).includes(command)) {
      errors.push(`${triad(rule.error)} (used with ${command})`)
      if (rule.commands.length === 1) suggestions.push(`Use /triad:${rule.commands[0]} instead`)
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)], suggestions: [...new Set(suggestions)], info }
}

export function renderValidation(v: Validation): string {
  return ['❌ Intent Validation Failed', '', 'Errors:', ...v.errors.map((e, i) => `${i + 1}. ${e}`), ...(v.suggestions.length ? ['', 'Suggestions:', ...v.suggestions.map(s => `- ${s}`)] : [])].join('\n')
}

export type Team = { intent: string; description: string; mode: 'ad_hoc' | 'filter_plans' | 'filter_review'; agents: { primary: string[]; secondary: string[] }; domains: string[]; filter: any }

export function resolveTeam(config: IntentConfig, intent: string): Team | undefined {
  const t = config.intents[intent]
  if (!t) return undefined
  return { intent, description: t.description ?? '', mode: t.mode ?? 'ad_hoc', agents: { primary: t.agents?.primary ?? [], secondary: t.agents?.secondary ?? [] }, domains: t.domains ?? [], filter: t.filter ?? null }
}

// A slashless pattern matches the basename (*.tsx matches src/a.tsx).
export function globMatch(path: string, pattern: string): boolean {
  const re = (p: string) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*')}$`)
  return pattern.includes('/') ? re(pattern).test(path) : re(pattern).test(path.split('/').pop()!)
}

const words = (t: string) => t.toLowerCase()
function typeMatches(config: IntentConfig, text: string, type: string): boolean {
  const terms = [type, ...(config.task_types[type] ?? [])]
  return terms.some(term => new RegExp(`\\b${term.replace(/[-]/g, '[- ]?')}s?\\b`, 'i').test(text))
}
const isDoc = (f: string) => /\.(md|mdx|rst|txt|adoc)$/i.test(f) || /(^|\/)docs?\//i.test(f)

export type PlanFilter = { keep: string[]; drop: { id: string; reason: string }[]; warnings: string[] }

// filter_plans intents subtract plans; they never edit one. Task types are
// matched on the plan title (a body mentioning React in passing is not UI work),
// a file pattern drops a plan only when it covers all of the plan's files.
export function filterPlans(plans: Plan[], f: ParsedFlags, config: IntentConfig): PlanFilter {
  const out: PlanFilter = { keep: [], drop: [], warnings: [] }
  const teams = f.intents.map(i => resolveTeam(config, i)).filter((t): t is Team => !!t && t.mode === 'filter_plans' && !!t.filter)
  for (const p of plans) {
    const title = words(p.title)
    const files = p.fm.files_modified
    let reason: string | undefined
    for (const t of teams) {
      const fl = t.filter
      const agent = p.fm.agents[0]
      if (agent && (fl.exclude_agents ?? []).includes(agent)) { reason = `${INTENT_FLAGS[t.intent]}: agent ${agent}`; break }
      const hit = files.filter(x => (fl.exclude_file_patterns ?? []).some((g: string) => globMatch(x, g)))
      if (files.length && hit.length === files.length) { reason = `${INTENT_FLAGS[t.intent]}: all files match ${fl.exclude_file_patterns.join(', ')}`; break }
      if (hit.length) out.warnings.push(`${p.id} kept: only some of its files match ${INTENT_FLAGS[t.intent]} (${hit.join(', ')})`)
      const include: string[] = fl.include_task_types ?? []
      if (include.length) {
        const docOnly = files.length > 0 && files.every(isDoc)
        if (!docOnly && !include.some(ty => typeMatches(config, title, ty))) { reason = `${INTENT_FLAGS[t.intent]}: not a ${include.join('/')} plan`; break }
        continue
      }
      const ex = (fl.exclude_task_types ?? []).find((ty: string) => typeMatches(config, title, ty))
      if (ex) { reason = `${INTENT_FLAGS[t.intent]}: ${ex} task`; break }
    }
    if (reason) out.drop.push({ id: p.id, reason })
    else out.keep.push(p.id)
  }
  return out
}

// ---- natural language (intent-router section 7) ----

export function phraseToRegex(phrase: string): RegExp {
  const p = phrase.replace(/\{([^}]+)\}\?\s*/g, '(?:(?:$1)\\s*)?').replace(/\{([^}]+)\}/g, '(?:$1)').replace(/\s+/g, '\\s*')
  return new RegExp(`\\b${p}`, 'i')
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// final = max(keyword score over the top-3 weights, 0.8 for a phrase) + 0.2 for
// the cluster's primary (weight 1) keyword. Legion's own calibration table
// expects a bare command name ("build", "status") to route HIGH, which that
// formula cannot reach (1/2.7 + 0.2); here a primary keyword match counts at
// least 0.6 before the bonus, so a named command is HIGH.
export function scoreCandidate(input: string, patterns: { keywords?: Record<string, number>; phrases?: string[] }): number {
  const kw = Object.entries(patterns.keywords ?? {})
  let matched = 0
  let primary = false
  for (const [k, w] of kw) {
    if (new RegExp(`\\b${esc(k)}\\b`, 'i').test(input)) {
      matched += w
      if (w >= 1) primary = true
    }
  }
  const top = kw.map(([, w]) => w).sort((a, b) => b - a).slice(0, Math.min(3, kw.length)).reduce((s, w) => s + w, 0)
  let keyword = top > 0 ? Math.min(1, matched / top) : 0
  if (primary) keyword = Math.max(keyword, 0.6)
  const phrase = (patterns.phrases ?? []).some(ph => phraseToRegex(ph).test(input)) ? 0.8 : 0
  return Math.min(1, Math.max(keyword, phrase) + (primary ? 0.2 : 0))
}

const INTENT_ROUTE: Record<string, { command: string; flags: string[] }> = {
  harden: { command: 'build', flags: ['--just-harden'] },
  document: { command: 'build', flags: ['--just-document'] },
  'skip-frontend': { command: 'build', flags: ['--skip-frontend'] },
  'skip-backend': { command: 'build', flags: ['--skip-backend'] },
  'security-only': { command: 'review', flags: ['--just-security'] },
}

export type NlResult = { command: string | null; flags: string[]; confidence: number; tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'; fallbackSuggestion: string | null; candidates: { label: string; confidence: number }[] }

export function parseNaturalLanguage(input: string, config: IntentConfig): NlResult {
  const text = input.toLowerCase().trim()
  if (!text) return { command: null, flags: [], confidence: 0, tier: 'NONE', fallbackSuggestion: null, candidates: [] }
  type C = { command: string; flags: string[]; confidence: number; intent: boolean; order: number; label: string }
  const cs: C[] = []
  let order = 0
  for (const [name, pat] of Object.entries(config.nl_patterns)) {
    const s = scoreCandidate(text, pat)
    const route = INTENT_ROUTE[name]
    if (s > 0 && route) cs.push({ ...route, confidence: s, intent: true, order: order++, label: `/triad:${route.command} ${route.flags.join(' ')}` })
  }
  for (const [name, pat] of Object.entries(config.command_routes)) {
    const s = scoreCandidate(text, pat)
    if (s > 0) cs.push({ command: name, flags: [], confidence: s, intent: false, order: order++, label: `/triad:${name}` })
  }
  // Tie-breaks: within 0.1, an intent beats a command route; then the named command; then file order.
  const named = (c: C) => new RegExp(`\\b${esc(c.command)}\\b`).test(text)
  cs.sort((a, b) => {
    if (Math.abs(a.confidence - b.confidence) <= 0.1 && a.intent !== b.intent) return a.intent ? -1 : 1
    if (a.confidence !== b.confidence) return b.confidence - a.confidence
    if (named(a) !== named(b)) return named(a) ? -1 : 1
    return a.order - b.order
  })
  const candidates = cs.map(c => ({ label: c.label, confidence: Math.round(c.confidence * 100) / 100 }))
  if (!cs.length) return { command: null, flags: [], confidence: 0, tier: 'NONE', fallbackSuggestion: 'No matching command found. Try /triad:status for available commands.', candidates }
  const best = { ...cs[0]! }
  // A command route plus a weaker intent for the same command ("review the code for security") carries the intent's flags.
  if (!best.intent) {
    const refine = cs.find(c => c.intent && c.command === best.command && c.confidence > 0.25)
    if (refine) { best.flags = refine.flags; best.label = refine.label }
  }
  if (best.confidence >= 0.8) return { command: `/triad:${best.command}`, flags: best.flags, confidence: best.confidence, tier: 'HIGH', fallbackSuggestion: null, candidates }
  if (best.confidence >= 0.5) return { command: `/triad:${best.command}`, flags: best.flags, confidence: best.confidence, tier: 'MEDIUM', fallbackSuggestion: best.label, candidates }
  return { command: null, flags: [], confidence: best.confidence, tier: 'LOW', fallbackSuggestion: `Did you mean: ${cs.slice(0, 3).map((c, i) => `${i + 1}. ${c.label}`).join(' ')}`, candidates }
}

export function renderNl(r: NlResult, current?: string): string {
  const head = r.tier === 'HIGH' ? `Route: ${r.command}${r.flags.length ? ' ' + r.flags.join(' ') : ''} (confidence ${r.confidence.toFixed(2)}, HIGH: proceed)`
    : r.tier === 'MEDIUM' ? `Suggest: ${r.fallbackSuggestion} (confidence ${r.confidence.toFixed(2)}, MEDIUM: confirm with the user)`
    : r.tier === 'LOW' ? `${r.fallbackSuggestion} (confidence ${r.confidence.toFixed(2)}, LOW: ask the user to pick)`
    : r.fallbackSuggestion ?? 'Empty input: nothing to route.'
  const cross = current && r.command && r.command !== `/triad:${current}` ? [`You ran /triad:${current}, but your input matches ${r.command}. Ask the user whether to run that instead; do not redirect silently.`] : []
  return [head, ...cross].join('\n')
}

// context_rules suggestions for a lifecycle position, with /triad: commands.
export function contextSuggestions(config: IntentConfig, position: string, vars: Record<string, string | number>): { command: string; description: string; reason: string }[] {
  const fill = (s: string) => triad(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m))
  return (config.context_rules[position]?.suggestions ?? []).map((s: any) => ({ command: fill(s.command), description: fill(s.description), reason: fill(s.reason) }))
}
