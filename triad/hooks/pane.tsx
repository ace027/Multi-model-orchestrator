// The Triad pane: the agent tree and spend per tier, drawn from the view
// register.ts writes to $.state whenever the ledger changes.
import { atom, read } from 'claude-code'
import type { Register } from 'claude-code'
import type { PaneRow } from '../types'

export const PANE = 'triad'
const paneState = atom({ plugin: 'triad', key: 'view' } as const, null)

const usd = (n: number) => '$' + n.toFixed(n < 1 ? 4 : 2)
const k = (n: number) => (n >= 10_000 ? Math.round(n / 1000) + 'k' : String(n))
const fit = (left: string, right: string, cols: number) => {
  const room = Math.max(1, cols - right.length - 1)
  const l = left.length > room ? left.slice(0, Math.max(0, room - 1)) + '…' : left
  return l.padEnd(room) + ' ' + right
}
const figures = (r: { requests: number; tokens: number; cost: number }) => `${String(r.requests).padStart(4)} req ${k(r.tokens).padStart(6)} tok ${usd(r.cost).padStart(8)}`

// Called from register.ts: a plugin has one hooks module.
export const registerPane = (on: Parameters<Register>[0]) => {
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const v = await read($, paneState)
    const cols = Math.max(30, e.props.bodyColumns)
    if (!v) return <Box><Text dimColor>No Triad activity yet.</Text></Box>
    const wide = cols >= 60
    const row = (r: PaneRow) => {
      const name = `${'  '.repeat(r.depth)}${r.label} ${r.tier}${r.status ? ` [${r.status}]` : ''}`
      return wide ? fit(name, figures(r), cols) : fit(name, usd(r.cost), cols)
    }
    return (
      <Box flexDirection="column">
        <Text bold>Agents</Text>
        {v.rows.map(r => (
          <Box key={`agent-${r.id}`}><Text dimColor={!!r.status && r.status !== 'running'} wrap="truncate">{row(r)}</Text></Box>
        ))}
        <Text> </Text>
        <Text bold>Spend</Text>
        {v.tiers.length === 0 && <Text dimColor>No requests yet.</Text>}
        {v.tiers.map(t => (
          <Box key={`tier-${t.tier}`}><Text wrap="truncate">{wide ? fit(t.tier, figures(t), cols) : fit(t.tier, usd(t.cost), cols)}</Text></Box>
        ))}
        <Box key="total"><Text bold wrap="truncate">{fit('total', usd(v.total), cols)}</Text></Box>
        {v.measuredUsd !== undefined && <Box key="measured"><Text dimColor wrap="truncate">{fit('session (measured)', usd(v.measuredUsd), cols)}</Text></Box>}
        <Text> </Text>
        <Box key="budgets"><Text dimColor wrap="wrap">
          {`coders ${v.coders[0]}/${v.coders[1]}, helpers ${v.helpers[0]}/${v.helpers[1]}, max depth ${v.maxDepth}${v.refusals ? `, ${v.refusals} spawns refused` : ''}`}
        </Text></Box>
      </Box>
    )
  })
}
