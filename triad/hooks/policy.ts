// Pure policy helpers: tiers, the return schema, write scoping. No `$` here.

export type Tier = 'opus' | 'sonnet' | 'haiku'
export type Role = 'orchestrator' | 'coder' | 'helper'

export type Options = {
  maxDepth: number
  maxCoders: number
  maxHelpers: number
  maxRetries: number
  strictMenu: boolean
}

export const DEFAULTS: Options = { maxDepth: 2, maxCoders: 4, maxHelpers: 6, maxRetries: 1, strictMenu: true }

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
    const first = lines[s].replace(/^\s*summary:\s*/i, '').trim()
    if (first) summary.push(first)
    for (let i = s + 1; i < lines.length && !/^\s*[a-z_]+:/i.test(lines[i]); i++) if (lines[i].trim()) summary.push(lines[i].trim())
  }
  const b = at('blocked_reason')
  return {
    status,
    summary,
    hasChanges: at('changes') >= 0,
    hasVerify: at('verify') >= 0,
    blockedReason: b >= 0 ? lines[b].replace(/^\s*blocked_reason:\s*/i, '').trim() || undefined : undefined,
    lines: lines.filter(l => l.trim()).length,
  }
}

// Returns the problems with a reply, empty when it follows the schema.
export function schemaProblems(text: string): string[] {
  const r = parseReply(text)
  const out: string[] = []
  if (!r.status) out.push('no "status: done|blocked|partial" line')
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
    const p = m[1].replace(/[.,]+$/, '')
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
