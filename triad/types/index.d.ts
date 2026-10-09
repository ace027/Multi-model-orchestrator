// What the Triad pane draws: the agent tree and spend, rebuilt from the ledger
// each time it changes.
export type PaneRow = {
  id: string
  depth: number
  label: string
  tier: string
  status: string
  requests: number
  tokens: number
  cost: number
}
export type PaneTier = { tier: string; requests: number; tokens: number; cost: number }
export type PaneView = {
  rows: PaneRow[]
  tiers: PaneTier[]
  total: number
  measuredUsd?: number
  coders: [number, number]
  helpers: [number, number]
  maxDepth: number
  refusals: number
  // The session's spending budget (option maxSpend), when one is set.
  maxSpend?: number
  // Spend across the project's sessions and its budget (option maxProjectSpend), when one is set.
  project?: { spent: number; max: number }
}

declare module 'claude-code' {
  interface PluginState {
    triad: { view: PaneView | null }
  }
}
