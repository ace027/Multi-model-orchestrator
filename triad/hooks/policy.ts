// Pure policy helpers: tiers, the return schema, write scoping. No `$` here.

export type Tier = 'opus' | 'sonnet' | 'haiku'
export type Role = 'orchestrator' | 'coder' | 'helper'

export type Options = {
  maxDepth: number
  maxCoders: number
  maxHelpers: number
  maxRetries: number
  strictMenu: boolean
  compress: boolean
  compressThreshold: number
  deferTools: boolean
  haikuCeiling: number
  haikuWrapAt: number
  openPane: boolean
}

export const DEFAULTS: Options = {
  maxDepth: 2, maxCoders: 4, maxHelpers: 6, maxRetries: 1, strictMenu: true,
  compress: true, compressThreshold: 4_000, deferTools: true,
  haikuCeiling: 95_000, haikuWrapAt: 80_000, openPane: false,
}

// Plugin agent types are namespaced (`triad:triad-coder`); match the suffix.
export function roleOfType(subagentType: string | undefined): Role | undefined {
  if (!subagentType) return undefined
  const name = subagentType.split(':').pop()
  if (name === 'triad-coder') return 'coder'
  if (name === 'triad-helper') return 'helper'
  return undefined
}

export const MODEL_FOR: Record<Exclude<Role, 'orchestrator'>, Tier> = { coder: 'sonnet', helper: 'haiku' }

export function tierOfModel(model: string | undefined): Tier | 'other' {
  const m = (model ?? '').toLowerCase()
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return 'other'
}

export type Reply = {
  status?: 'done' | 'blocked' | 'partial'
  summary: string[]
  hasChanges: boolean
  hasVerify: boolean
  blockedReason?: string
  lines: number
}

const STATUS = /^\s*status:\s*(done|blocked|partial)\b/im

export function parseReply(text: string): Reply {
  const body = text.replace(/```[a-z]*\n?/gi, '')
  const lines = body.split('\n')
  const at = (key: string) => lines.findIndex(l => new RegExp(`^\\s*${key}:`, 'i').test(l))
  const status = body.match(STATUS)?.[1]?.toLowerCase() as Reply['status']
  const s = at('summary')
  const summary: string[] = []
  if (s >= 0) {
    const first = lines[s]!.replace(/^\s*summary:\s*/i, '').trim()
    if (first) summary.push(first)
    for (let i = s + 1; i < lines.length && !/^\s*[a-z_]+:/i.test(lines[i]!); i++) if (lines[i]!.trim()) summary.push(lines[i]!.trim())
  }
  const b = at('blocked_reason')
  return {
    status,
    summary,
    hasChanges: at('changes') >= 0,
    hasVerify: at('verify') >= 0,
    blockedReason: b >= 0 ? lines[b]!.replace(/^\s*blocked_reason:\s*/i, '').trim() || undefined : undefined,
    lines: lines.filter(l => l.trim()).length,
  }
}

// Work handed back instead of done (Legion's no-agent-deferrals rule): planned
// work is completed, blocked with a reason, or returned partial; never deferred.
const DEFERRALS: RegExp[] = [
  /\b(?:I(?:'ll| will| am going to)|let me) leave\b[^.\n]{0,40}\b(?:for|to) (?:you|the user|the orchestrator|later|a later|a future|another)\b/i,
  /\bleav(?:e|ing) (?:this|that|it|these|those|the rest) (?:for|to) (?:you|the user|the orchestrator|later|a later|a future|another)\b/i,
  /\byou(?:'ll| will)? (?:should|need to|have to|must|may want to|can now) (?:still |then |now )?(?:add|implement|write|fix|update|create|finish|complete|wire|handle|change|edit|refactor|port|migrate)\b/i,
  /\bTODO\b[^.\n]{0,20}\b(?:for|by) (?:the )?(?:user|you|orchestrator|caller)\b/i,
  /\b(?:deferred|parked|punted)\b[^.\n]{0,40}\b(?:later|future|follow-?up|next phase|another (?:task|phase|agent))\b/i,
  /\b(?:left|leave) (?:as )?(?:an exercise|for (?:a )?(?:future|later|follow-?up)(?: phase| task| work)?)\b/i,
  /\b(?:can|could|will|should) be (?:done|handled|addressed|implemented|finished) (?:later|in a follow-?up|in a (?:future|later|next) (?:phase|task)|separately)\b/i,
]

export function deferralIn(text: string): string | undefined {
  for (const re of DEFERRALS) {
    const m = text.match(re)
    if (m) return m[0]
  }
  return undefined
}

// Returns the problems with a reply, empty when it follows the schema.
export function schemaProblems(text: string): string[] {
  const r = parseReply(text)
  const out: string[] = []
  if (!r.status) out.push('no "status: done|blocked|partial" line')
  const deferral = r.status === 'blocked' || r.status === 'partial' ? undefined : deferralIn(text)
  if (deferral) out.push(`reply defers work back ("${deferral}"); finish it, or return status blocked with a blocked_reason, or partial naming what is left`)
  if (!r.summary.length) out.push('no "summary:"')
  else if (r.summary.length > 5) out.push(`summary is ${r.summary.length} lines (max 5)`)
  if (!r.hasChanges) out.push('no "changes:" (use "changes: none")')
  if (!r.hasVerify) out.push('no "verify:" (use "verify: none")')
  if (r.status === 'blocked' && !r.blockedReason) out.push('status is blocked but there is no "blocked_reason:"')
  if (r.lines > 60) out.push(`reply is ${r.lines} lines; return the block only, no transcript or file contents`)
  return out
}

// The agent's own answer inside an Agent tool result (which may carry a trailer).
export function agentIdIn(text: string): string | undefined {
  return text.match(/agentId:\s*([A-Za-z0-9_-]+)/)?.[1]
}

// Paths a helper may write: given explicitly, or named in its brief.
const PATHLIKE = /(?:^|[\s`'"(\[])((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.-]+)*\.[A-Za-z0-9]{1,8})(?=$|[\s`'")\],:;.])/g

export function pathsInBrief(brief: string): string[] {
  const out = new Set<string>()
  for (const m of brief.matchAll(PATHLIKE)) {
    const p = m[1]!.replace(/[.,]+$/, '')
    if (!/^v?\d+(\.\d+)+$/.test(p) && !/^https?:/.test(p)) out.add(p)
  }
  return [...out]
}

export function normalize(path: string, cwd: string): string {
  let p = path.replace(/\\/g, '/')
  if (cwd && p.startsWith(cwd.replace(/\/$/, '') + '/')) p = p.slice(cwd.replace(/\/$/, '').length + 1)
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return (p.startsWith('/') && !parts.length ? '/' : '') + parts.join('/')
}

export function mayWrite(target: string, allowed: readonly string[], cwd: string): boolean {
  const t = normalize(target, cwd)
  return allowed.some(a => {
    const n = normalize(a, cwd)
    return n === t || (a.endsWith('/') && t.startsWith(n + '/'))
  })
}

// Rough token estimate for pre-flight checks (the exact count only arrives after sending).
export const approxTokens = (s: string) => Math.ceil(s.length / 3.5)
