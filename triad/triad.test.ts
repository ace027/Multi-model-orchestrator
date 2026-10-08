import { describe, expect, mock, test } from 'claude-code/testing'
import { mayWrite, pathsInBrief, schemaProblems } from './hooks/policy.ts'
import { costOf, emptyLedger, recordStep } from './hooks/ledger.ts'
import { chunks, errorLines, eligible } from './hooks/compress.ts'

const GOOD = 'status: done\nsummary: added the parser\nchanges:\n- src/a.ts | added | parser\nverify: npm test => 4 passed'
const usage = (input: number, output: number, read = 0, write = 0, model = 'claude-haiku-5-5') => ({
  input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write, model,
})

// The engine beneath the plugin: just enough of it for session.start and the ledger.
function world(on: any, log: { writes: Record<string, string>; spawns: any[] }) {
  mock.store(on)
  on('session.start', () => ({ cwd: '/repo' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__triad__' + e.name } }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('fs.write', (_$: any, e: any) => { log.writes[e.path] = e.text; return { value: undefined } })
  let n = 0
  on('agent.spawn', (_$: any, e: any) => { log.spawns.push(e); return { model: e.model, agentId: `agent${++n}` } })
}

async function start($: any) {
  await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
}

describe('policy', () => {
  test('accepts a reply that follows the return schema', () => {
    expect(schemaProblems(GOOD)).toEqual([])
    expect(schemaProblems('```\n' + GOOD + '\n```')).toEqual([])
  })
  test('names what a reply is missing', () => {
    expect(schemaProblems('I did it, all good.').length).toBe(4)
    expect(schemaProblems('status: blocked\nsummary: x\nchanges: none\nverify: none')).toEqual(['status is blocked but there is no "blocked_reason:"'])
  })
  test('finds the paths a brief names', () => {
    expect(pathsInBrief('Create `src/routes/users.ts` and tests/users.test.ts, see README.md. v1.2.3')).toEqual(['src/routes/users.ts', 'tests/users.test.ts', 'README.md'])
  })
  test('scopes writes to the named paths', () => {
    expect(mayWrite('/repo/src/a.ts', ['src/a.ts'], '/repo')).toBe(true)
    expect(mayWrite('/repo/src/b.ts', ['src/a.ts'], '/repo')).toBe(false)
    expect(mayWrite('/repo/src/x/b.ts', ['src/x/'], '/repo')).toBe(true)
    expect(mayWrite('/repo/src/../secret.ts', ['src/a.ts'], '/repo')).toBe(false)
  })
})

describe('ledger', () => {
  test('prices Haiku above the line at the higher rate, counting cache tokens', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-12
    expect(near(costOf('haiku', usage(10_000, 0, 85_000, 0)), (10_000 * 0.1 + 85_000 * 0.01) / 1e6)).toBe(true)
    expect(near(costOf('haiku', usage(10_000, 0, 85_000, 6_000)), (10_000 * 0.5 + 85_000 * 0.05 + 6_000 * 0.625) / 1e6)).toBe(true)
  })
  test('prices the main loop\'s cache writes at the 1-hour rate', () => {
    const l = emptyLedger()
    recordStep(l, undefined, 'claude-opus-5-5', usage(10, 2349, 147_681, 39_871, 'claude-opus-5-5'))
    // The CLI reported $0.3955242 for exactly this usage.
    expect(Math.abs(l.tiers.opus.cost - 0.3955242) < 1e-9).toBe(true)
  })
  test('accumulates per tier and per agent', () => {
    const l = emptyLedger()
    recordStep(l, undefined, 'claude-opus-5-5', usage(100, 10, 0, 0, 'claude-opus-5-5'))
    recordStep(l, 'h1', 'claude-haiku-5-5', usage(1_000, 50, 99_500))
    expect(l.tiers.opus.requests).toBe(1)
    expect(l.agents.h1.models).toEqual(['claude-haiku-5-5'])
    expect(l.haiku.overLine).toBe(1)
    expect(l.haiku.maxPrompt).toBe(100_500)
  })
})

describe('hooks', () => {
  test('offers only the Triad agent types', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    on('agent.offer', () => ({ isOffered: true }))
    await start($)
    expect((await $.agent.offer({ agent: 'general-purpose', description: '', source: 'built-in', provider: 'core' as any })).isOffered).toBe(false)
    expect((await $.agent.offer({ agent: 'triad:triad-coder', description: '', source: 'plugin', provider: 'core' as any })).isOffered).toBe(true)
  })

  test('forces each tier\'s model and refuses other agent types', async ($, on) => {
    const log = { writes: {}, spawns: [] as any[] }
    world(on, log)
    await start($)
    const r = await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'do it', description: 'x', model: 'opus' })
    expect(r.agentId).toBe('agent1')
    expect(log.spawns[0].model).toBe('sonnet')
    expect(log.spawns[0].background).toBe(false)
    expect(((await $.agent.spawn({ subagentType: 'general-purpose', prompt: 'p', description: 'd' })) as any).deny).toMatch(/bypasses the tiers/)
  })

  test('refuses a coder over the concurrency cap until one finishes', { options: { maxCoders: 1 } }, async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
    await start($)
    await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'a', description: 'a' })
    expect(((await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'b', description: 'b' })) as any).deny).toMatch(/limit 1/)
    await $.turn.complete({ agentId: 'agent1', answer: GOOD, durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as any)
    expect((await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'c', description: 'c' })).agentId).toBe('agent2')
  })

  test('limits a helper\'s writes to the files its brief names', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    on('tool.call', () => ({ result: 'ok' }) as any)
    await start($)
    const h = await $.agent.spawn({ subagentType: 'triad:triad-helper', prompt: 'Stub tests/a.test.ts', description: 'h' })
    const ok: any = await $.tool.call({ tool: 'Write', file_path: '/repo/tests/a.test.ts', content: 'x', agentId: h.agentId } as any)
    expect(ok.isError).toBeFalsy()
    const no: any = await $.tool.call({ tool: 'Write', file_path: '/repo/src/core.ts', content: 'x', agentId: h.agentId } as any)
    expect(String(no.deny ?? (no.isError && no.text))).toMatch(/may write only/)
  })

  test('/triad prints the tree and per-tier usage', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    on('turn.step', async function* (_$: any, e: any) {
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: usage(500, 40, 20_000, 0, e.model) }
    })
    await start($)
    const c = await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'a', description: 'a' })
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })) { /* drain */ }
    for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: c.agentId })) { /* drain */ }
    const out = await $.command.run({ command: 'triad' } as any)
    expect(out.text).toMatch(/orchestrator \(claude-opus-5-5\)/)
    expect(out.text).toMatch(/coder agent1 \(claude-sonnet-5-5\)/)
    expect(out.text).toMatch(/sonnet\s+1 req/)
  })

  test('sends a non-conforming coder reply back once, then lets it through', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    on('tool.call', { tool: 'Agent' }, () => ({ result: 'x', text: 'I finished everything!\nagentId: agent1' }) as any)
    await start($)
    await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'a', description: 'a' })
    const first: any = await $.tool.call({ tool: 'Agent', prompt: 'a', description: 'a', subagent_type: 'triad:triad-coder' } as any)
    expect(String(first.deny ?? first.text)).toMatch(/SendMessage to agent1/)
    const second: any = await $.tool.call({ tool: 'Agent', prompt: 'a', description: 'a', subagent_type: 'triad:triad-coder' } as any)
    expect(second.deny).toBeUndefined()
  })

  // The kit drops `agentId` from a plugin's own spawns, so the wait for the
  // helper's answer is covered by the live acceptance run instead (README).
  test('delegate_menial spawns the helper on Haiku with its writable files', async ($, on) => {
    const log = { writes: {} as Record<string, string>, spawns: [] as any[] }
    world(on, log)
    await start($)
    const coder = await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'a', description: 'a' })
    await $.tool.call({ tool: 'mcp__triad__delegate_menial', brief: 'Stub tests/a.test.ts', writable: ['tests/a.test.ts'], agentId: coder.agentId } as any)
    expect(log.spawns[1].model).toBe('haiku')
    expect(log.spawns[1].prompt).toMatch(/Writable files: tests\/a.test.ts/)
    expect(log.spawns[1].description).toBe('triad delegate from agent1')
  })

  test('delegate_menial refuses a helper below the depth limit', { options: { maxDepth: 1 } }, async ($, on) => {
    const log = { writes: {} as Record<string, string>, spawns: [] as any[] }
    world(on, log)
    await start($)
    const coder = await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'a', description: 'a' })
    const r: any = await $.tool.call({ tool: 'mcp__triad__delegate_menial', brief: 'x', agentId: coder.agentId } as any)
    expect(JSON.stringify(r)).toMatch(/depth 2 is over the limit of 1/)
    expect(log.spawns.length).toBe(1)
  })

  test('delegate_menial refuses helpers and the orchestrator', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    await start($)
    const h = await $.agent.spawn({ subagentType: 'triad:triad-helper', prompt: 'x', description: 'h' })
    const a: any = await $.tool.call({ tool: 'mcp__triad__delegate_menial', brief: 'x', agentId: h.agentId } as any)
    expect(String(a.deny ?? a.text)).toMatch(/only coders/)
    const b: any = await $.tool.call({ tool: 'mcp__triad__delegate_menial', brief: 'x' } as any)
    expect(String(b.deny ?? b.text)).toMatch(/Agent tool/)
  })

  test('compresses long Bash output to its error lines plus a summary, saving the original', async ($, on) => {
    const log = { writes: {} as Record<string, string>, spawns: [] as any[] }
    world(on, log)
    const prompts: string[] = []
    on('model.complete', (_$: any, e: any) => { prompts.push(e.prompt); return { value: { isAnswered: true, text: 'SUMMARY: 300 passed, 1 failed (test_total)', usage: usage(5_000, 60) } } })
    const big = Array.from({ length: 3000 }, (_, i) => `test_${i} ... ok`).join('\n') + '\nFAIL: test_total (tests.test_cart.CartTest)\nAssertionError: 560 != 561'
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: big, stderr: '', interrupted: false }, text: big }) as any)
    await start($)
    const r: any = await $.tool.call({ tool: 'Bash', command: 'python3 -m unittest -v' } as any)
    expect(r.result.stdout).toMatch(/output compressed/)
    expect(r.result.stdout).toMatch(/AssertionError: 560 != 561/)
    expect(r.result.stdout).toMatch(/SUMMARY: 300 passed/)
    expect(r.result.stdout.length < 2_000).toBe(true)
    const saved = Object.keys(log.writes).find(k => k.startsWith('/repo/.triad/out/'))!
    expect(log.writes[saved]).toMatch(/test_2999 \.\.\. ok/)
    expect(prompts[0]).toMatch(/python3 -m unittest -v/)
  })

  test('leaves short output, source reads and edits alone', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    const long = 'x = 1\n'.repeat(5_000)
    on('tool.call', (_$: any, e: any) => ({ result: e.tool === 'Read' ? { type: 'text', file: { filePath: e.file_path, content: long, numLines: 5000, startLine: 1, totalLines: 5000 } } : { stdout: 'ok', stderr: '', interrupted: false }, text: e.tool === 'Read' ? long : 'ok' }) as any)
    await start($)
    const read: any = await $.tool.call({ tool: 'Read', file_path: '/repo/shop/cart.py' } as any)
    expect(read.result.file.content).toBe(long)
    const bash: any = await $.tool.call({ tool: 'Bash', command: 'echo ok' } as any)
    expect(bash.result.stdout).toBe('ok')
  })

  test('defers engine tools the tiers do not use every turn', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    on('tool.describe', (_$: any, e: any) => ({ description: e.description }))
    await start($)
    const engine = { plugin: 'engine', tier: 'core' } as any
    expect((await $.tool.describe({ tool: 'Workflow', description: 'w', provider: engine })).isDeferred).toBe(true)
    expect((await $.tool.describe({ tool: 'Read', description: 'r', provider: engine })).isDeferred).toBeFalsy()
    expect((await $.tool.describe({ tool: 'mcp__github__x', description: 'g', provider: { plugin: 'github', tier: 'user' } as any })).isDeferred).toBeFalsy()
  })

  test('puts the orchestrator guidance in the main system prompt', async ($, on) => {
    world(on, { writes: {}, spawns: [] })
    on('prompt.section', (_$: any, e: any) => ({ text: e.text }))
    await start($)
    expect((await $.prompt.section({ name: 'communication', text: 'base' })).text).toMatch(/^base\n\n# Triad orchestration/)
    expect((await $.prompt.section({ name: 'env_info_model', text: 'model' })).text).toBe('model')
  })
})

describe('compression helpers', () => {
  test('compresses Bash and Grep, and only log-like reads', () => {
    expect(eligible('Bash', {})).toBe(true)
    expect(eligible('Read', { file_path: '/r/logs/app.log' })).toBe(true)
    expect(eligible('Read', { file_path: '/r/src/app.py' })).toBe(false)
    expect(eligible('Edit', {})).toBe(false)
  })
  test('keeps distinct error lines once', () => {
    expect(errorLines('ok\nERROR db timeout after 30s\nERROR db timeout after 31s\nTraceback (most recent call last):\nfine')).toEqual(['ERROR db timeout after 30s', 'Traceback (most recent call last):'])
  })
  test('chunks on line boundaries and keeps the ends of very long output', () => {
    const { parts } = chunks('aaaa\nbbbb\ncccc\n', 6)
    expect(parts).toEqual(['aaaa\n', 'bbbb\n', 'cccc\n'])
    const many = chunks('x\n'.repeat(100), 4)
    expect(many.parts.length).toBe(8)
    expect(many.skipped).toBe(42)
  })
})
