// Spending budgets: maxSpend (USD per session) and maxProjectSpend (USD across
// every session on the project, kept in .planning/SPEND.json). Pure; the hooks
// act on the level.
import type { Ledger } from './ledger.ts'

export const WARN_AT = 0.8
export type BudgetLevel = 'off' | 'ok' | 'warn' | 'over'
export type BudgetOption = 'maxSpend' | 'maxProjectSpend'
// The budget that binds: the one at the worse level (the session's on a tie).
export type Budget = { level: BudgetLevel; spent: number; max: number; option: BudgetOption }

// The ledger's estimate, or the session's measured cost when that is higher.
export function spentOf(l: Ledger): number {
  const est = Object.values(l.tiers).reduce((n, t) => n + t.cost, 0)
  return Math.max(est, l.measuredUsd ?? 0)
}

export function levelOf(spent: number, max: number): BudgetLevel {
  if (!(max > 0)) return 'off'
  if (spent >= max) return 'over'
  return spent >= max * WARN_AT ? 'warn' : 'ok'
}

const RANK: Record<BudgetLevel, number> = { off: 0, ok: 1, warn: 2, over: 3 }
export function bindingBudget(session: number, maxSpend: number, project: number, maxProjectSpend: number): Budget {
  const s: Budget = { level: levelOf(session, maxSpend), spent: session, max: maxSpend, option: 'maxSpend' }
  const p: Budget = { level: levelOf(project, maxProjectSpend), spent: project, max: maxProjectSpend, option: 'maxProjectSpend' }
  return RANK[p.level] > RANK[s.level] ? p : s
}

// .planning/SPEND.json: each session's spend on the project, so a resumed run
// (a new session, a fresh clone) still counts what earlier sessions spent.
export const SPEND_FILE = '.planning/SPEND.json'
export type SpendFile = { sessions: Record<string, { usd: number; at: string }> }

export function parseSpend(text: string | undefined): SpendFile {
  try {
    const j = JSON.parse(text ?? '')
    if (j && typeof j.sessions === 'object') return { sessions: j.sessions }
  } catch { /* a missing or broken file starts the count over */ }
  return { sessions: {} }
}

// What the project spent before this session.
export function earlierSpend(f: SpendFile, sessionId: string): number {
  return Object.entries(f.sessions).reduce((n, [id, s]) => (id === sessionId ? n : n + (Number(s.usd) || 0)), 0)
}

const usd = (n: number) => '$' + n.toFixed(2)
const scope = (o: BudgetOption) => (o === 'maxSpend' ? 'spending budget' : 'project spending budget')
const rest = (o: BudgetOption) => (o === 'maxSpend' ? '' : ' across sessions')

export const BUDGET_WARN = (b: Pick<Budget, 'spent' | 'max' | 'option'>) =>
  `triad: ${usd(b.spent)} of the ${usd(b.max)} ${scope(b.option)} (${b.option}) is spent${rest(b.option)}. Finish the step in hand; start nothing large.`

export const BUDGET_OVER = (b: Pick<Budget, 'spent' | 'max' | 'option'>) =>
  `triad: the ${scope(b.option)} is reached (${usd(b.spent)} of ${usd(b.max)}${rest(b.option)}, option ${b.option}). New agents and workflow steps are refused. ` +
  `Make sure finished work is committed, then stop and tell the user what is done, what is left, and that raising ${b.option} (or 0 for no limit) lets the work continue.`

// Sent to agents still running when the budget runs out.
export const BUDGET_AGENT_NOTE = (b: Pick<Budget, 'max' | 'option'>) =>
  `triad: the ${b.option === 'maxSpend' ? "session's" : "project's"} spending budget (${usd(b.max)}) is used up. Stop exploring: make sure what is on disk works, then return now with status done, or partial with what is left.`
