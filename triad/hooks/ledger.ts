// Token ledger: per-tier and per-agent usage and cost. Pure; the hooks persist it.
import { tierOfModel, type Tier } from './policy.ts'

export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

// USD per million tokens. Cache writes are the 5-minute rate (1.25x input); the
// main loop writes with the 1-hour TTL (2x input), measured against the CLI's
// own cost in the Phase 2 acceptance run.
type Rate = { in: number; out: number; read: number; write: number }
const RATES: Record<Tier, Rate> = {
  opus: { in: 4, out: 20, read: 0.2, write: 5 },
  sonnet: { in: 2, out: 10, read: 0.2, write: 2.5 },
  haiku: { in: 0.1, out: 0.5, read: 0.01, write: 0.125 },
}
const HAIKU_OVER: Rate = { in: 0.5, out: 2.5, read: 0.05, write: 0.625 }
// Haiku's pricing line. Spike #9: cache reads and writes both count toward it.
export const HAIKU_LINE = 100_000

export const promptTokens = (u: Usage) => u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens

export function costOf(tier: Tier | 'other', u: Usage, hourCache = false): number {
  if (tier === 'other') return 0
  const r = tier === 'haiku' && promptTokens(u) > HAIKU_LINE ? HAIKU_OVER : RATES[tier]
  const write = hourCache ? r.in * 2 : r.write
  return (u.input_tokens * r.in + u.output_tokens * r.out + u.cache_read_input_tokens * r.read + u.cache_creation_input_tokens * write) / 1e6
}

export type Totals = { requests: number; input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }
export type AgentRow = Totals & {
  role: string
  type?: string
  parent?: string
  depth: number
  models: string[]
  status?: string
  maxPrompt: number
}
export type Ledger = {
  version: 1
  tiers: Record<string, Totals>
  agents: Record<string, AgentRow>
  haiku: { requests: number; maxPrompt: number; overLine: number }
  refusals: { reason: string; at: string }[]
  rejectedReplies: number
  measuredUsd?: number
  contextInjections?: number
}

const zero = (): Totals => ({ requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })

export const emptyLedger = (): Ledger => ({
  version: 1,
  tiers: {},
  agents: { main: { ...zero(), role: 'orchestrator', depth: 0, models: [], maxPrompt: 0 } },
  haiku: { requests: 0, maxPrompt: 0, overLine: 0 },
  refusals: [],
  rejectedReplies: 0,
})

export function ensureAgent(l: Ledger, id: string, init: Partial<AgentRow>): AgentRow {
  const row = (l.agents[id] ??= { ...zero(), role: 'unknown', depth: 1, models: [], maxPrompt: 0 })
  Object.assign(row, init)
  return row
}

function add(t: Totals, u: Usage, cost: number) {
  t.requests++
  t.input += u.input_tokens
  t.output += u.output_tokens
  t.cacheRead += u.cache_read_input_tokens
  t.cacheWrite += u.cache_creation_input_tokens
  t.cost += cost
}

// One model request (a `turn.step` result).
export function recordStep(l: Ledger, agentId: string | undefined, model: string, u: Usage) {
  const tier = tierOfModel(model)
  const cost = costOf(tier, u, !agentId)
  add((l.tiers[tier] ??= zero()), u, cost)
  const row = ensureAgent(l, agentId ?? 'main', {})
  add(row, u, cost)
  if (!row.models.includes(model)) row.models.push(model)
  const p = promptTokens(u)
  row.maxPrompt = Math.max(row.maxPrompt, p)
  if (tier === 'haiku') {
    l.haiku.requests++
    l.haiku.maxPrompt = Math.max(l.haiku.maxPrompt, p)
    if (p > HAIKU_LINE) l.haiku.overLine++
  }
}

const usd = (n: number) => '$' + n.toFixed(n < 1 ? 4 : 2)
const k = (n: number) => (n >= 10_000 ? Math.round(n / 1000) + 'k' : String(n))

export function render(l: Ledger, budgets: { coders: [number, number]; helpers: [number, number]; maxDepth: number }): string {
  const out: string[] = ['Triad', '']
  const kids: Record<string, string[]> = {}
  for (const [id, a] of Object.entries(l.agents)) if (id !== 'main') (kids[a.parent ?? 'main'] ??= []).push(id)
  const line = (id: string, indent: string) => {
    const a = l.agents[id]
    const name = id === 'main' ? 'orchestrator' : `${a.role} ${id.slice(0, 8)}`
    const st = a.status ? ` [${a.status}]` : ''
    out.push(`${indent}${name} (${a.models.join(', ') || 'no requests yet'})${st}: ${a.requests} req, in ${k(a.input)} / out ${k(a.output)} / cache r ${k(a.cacheRead)} w ${k(a.cacheWrite)}, ${usd(a.cost)}`)
    for (const c of kids[id] ?? []) line(c, indent + '  ')
  }
  out.push('Tree:')
  line('main', '  ')
  out.push('', 'Per tier:')
  let total = 0
  for (const tier of ['opus', 'sonnet', 'haiku', 'other']) {
    const t = l.tiers[tier]
    if (!t) continue
    total += t.cost
    out.push(`  ${tier.padEnd(6)} ${String(t.requests).padStart(4)} req  in ${k(t.input)}  out ${k(t.output)}  cache r ${k(t.cacheRead)} w ${k(t.cacheWrite)}  ${usd(t.cost)}`)
  }
  out.push(`  total  ${usd(total)} (agent requests only; the engine's own side calls, such as titles, are not counted)`)
  out.push('', 'Budgets:')
  out.push(`  coders running ${budgets.coders[0]}/${budgets.coders[1]}, helpers running ${budgets.helpers[0]}/${budgets.helpers[1]}, max depth ${budgets.maxDepth}`)
  out.push(`  Haiku: ${l.haiku.requests} requests, largest prompt ${k(l.haiku.maxPrompt)} of ${k(HAIKU_LINE)}, ${l.haiku.overLine} over the line`)
  out.push(`  replies sent back for the return schema: ${l.rejectedReplies}; spawns refused: ${l.refusals.length}`)
  out.push('', 'Compression savings: none yet (Phase 3)')
  return out.join('\n')
}
