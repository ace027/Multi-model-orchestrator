import { describe, expect, mock, test } from 'claude-code/testing'
import { emptyLedger, ensureAgent, paneView, recordStep } from './hooks/ledger.ts'

const usage = (input: number, output: number, read = 0, write = 0, model = 'claude-haiku-5-5') => ({
  input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write, model,
})

function world(on: any, opened: string[]) {
  mock.store(on)
  on('session.start', () => ({ cwd: '/repo' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__triad__' + e.name } }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.open', (_$: any, e: any) => { opened.push(e.id); return { value: undefined } })
  let n = 0
  on('agent.spawn', (_$: any, e: any) => ({ model: e.model, agentId: `agent${++n}` }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* (_$: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usage(500, 40, 20_000, 0, e.model) }
  })
}

const PANE = (bodyColumns: number) => ({
  component: 'Pane' as const, requestId: 'triad', viewport: { columns: bodyColumns + 4, rows: 30 },
  props: { title: 'Triad', isFocused: false, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 26 }, view: {} },
})

describe('pane view', () => {
  test('flattens the tree in drawing order with depth, tier and spend', () => {
    const l = emptyLedger()
    ensureAgent(l, 'coder-aaaaaaaa1', { role: 'coder', parent: 'main', depth: 1, status: 'running' })
    ensureAgent(l, 'helper-bbbbbbbb', { role: 'helper', parent: 'coder-aaaaaaaa1', depth: 2, status: 'done' })
    ensureAgent(l, 'helper-cccccccc', { role: 'helper', parent: 'main', depth: 1 })
    recordStep(l, undefined, 'claude-opus-5-5', usage(1000, 100, 0, 0, 'claude-opus-5-5'))
    recordStep(l, 'coder-aaaaaaaa1', 'claude-sonnet-5-5', usage(2000, 200, 0, 0, 'claude-sonnet-5-5'))
    recordStep(l, 'helper-bbbbbbbb', 'claude-haiku-5-5', usage(3000, 300))
    const v = paneView(l, { coders: [1, 4], helpers: [0, 6], maxDepth: 2 })
    expect(v.rows.map(r => [r.label, r.depth, r.tier, r.status])).toEqual([
      ['orchestrator', 0, 'opus', ''],
      ['coder coder-aa', 1, 'sonnet', 'running'],
      ['helper helper-b', 2, 'haiku', 'done'],
      ['helper helper-c', 1, '-', ''],
    ])
    expect(v.rows[1]!.tokens).toBe(2200)
    expect(v.tiers.map(t => t.tier)).toEqual(['opus', 'sonnet', 'haiku'])
    expect(Math.abs(v.total - v.tiers.reduce((n, t) => n + t.cost, 0))).toBeLessThan(1e-9)
  })

  test('an agent whose parent is missing still shows', () => {
    const l = emptyLedger()
    ensureAgent(l, 'orphan01', { role: 'helper', parent: 'gone', depth: 2 })
    expect(paneView(l, { coders: [0, 4], helpers: [0, 6], maxDepth: 2 }).rows.map(r => r.id)).toEqual(['main', 'orphan01'])
  })
})

describe('pane', () => {
  test('/triad pane opens it, and it draws the agents and spend as they run', async ($, on) => {
    const opened: string[] = []
    world(on, opened)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    expect(opened).toEqual([])
    const out = await $.command.run({ command: 'triad', args: 'pane' } as any)
    expect(out.text).toMatch(/pane opened/)
    expect(opened).toEqual(['triad'])
    const c = await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'a', description: 'a' })
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) { /* drain */ }
    for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: c.agentId })) { /* drain */ }
    for (const surface of ['terminal', 'desktop'] as const) {
      for (const cols of [80, 40]) {
        const ui = await $.ui.mount({ plugin: 'triad', surface, ...PANE(cols) })
        expect((await ui.find({ key: 'agent-main' }))?.text).toMatch(/^orchestrator opus/)
        const coder = (await ui.find({ key: 'agent-agent1' }))?.text ?? ''
        expect(coder).toMatch(/^  coder agent1 sonnet \[running\]/)
        expect(coder.length).toBe(cols)
        expect((await ui.find({ key: 'tier-sonnet' }))?.text).toMatch(/sonnet/)
        expect((await ui.find({ key: 'total' }))?.text).toMatch(/\$0\.\d{4}$/)
        expect((await ui.find({ key: 'budgets' }))?.text).toMatch(/coders 1\/4, helpers 0\/6, max depth 2/)
        await ui.unmount()
      }
    }
    await $.turn.complete({ agentId: c.agentId, answer: 'status: done\nsummary: x\nchanges: none\nverify: none', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' } as any)
    const ui = await $.ui.mount({ plugin: 'triad', surface: 'terminal', ...PANE(80) })
    expect((await ui.find({ key: 'agent-agent1' }))?.text).toMatch(/\[done\]/)
    expect((await ui.find({ key: 'budgets' }))?.text).toMatch(/coders 0\/4/)
    await ui.unmount()
  })

  test('the openPane option opens it at session start', { options: { openPane: true } }, async ($, on) => {
    const opened: string[] = []
    world(on, opened)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    expect(opened).toEqual(['triad'])
    const ui = await $.ui.mount({ plugin: 'triad', surface: 'terminal', ...PANE(60) })
    expect((await ui.find({ key: 'agent-main' }))?.text).toMatch(/orchestrator/)
    expect(await ui.find({ text: /No requests yet/ })).toBeDefined()
    await ui.unmount()
  })
})
