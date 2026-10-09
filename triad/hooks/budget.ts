// Spending budget (maxSpend, USD per session). Pure; the hooks act on the level.
import type { Ledger } from './ledger.ts'

export const WARN_AT = 0.8
export type BudgetLevel = 'off' | 'ok' | 'warn' | 'over'

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

const usd = (n: number) => '$' + n.toFixed(2)

export const BUDGET_WARN = (spent: number, max: number) =>
  `triad: ${usd(spent)} of the ${usd(max)} spending budget (maxSpend) is spent. Finish the step in hand; start nothing large.`

export const BUDGET_OVER = (spent: number, max: number) =>
  `triad: the spending budget is reached (${usd(spent)} of ${usd(max)}, option maxSpend). New agents and workflow steps are refused. ` +
  `Make sure finished work is committed, then stop and tell the user what is done, what is left, and that raising maxSpend (or 0 for no limit) lets the work continue.`

// Sent to agents still running when the budget runs out.
export const BUDGET_AGENT_NOTE = (max: number) =>
  `triad: the session's spending budget (${usd(max)}) is used up. Stop exploring: make sure what is on disk works, then return now with status done, or partial with what is left.`
