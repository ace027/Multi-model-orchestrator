import type { Register } from 'claude-code'

// Throwaway Phase 0 spike. Logs every probed event to $SPIKE_LOG (JSONL) and
// runs the experiment named by $SPIKE_MODE (comma-separated flags):
//   force     agent.spawn forces spike-coder (defined as haiku) onto sonnet
//   rewrite   tool.call rewrites the stdout of any Bash command containing SPIKE_REWRITE
//   ret       turn.complete replaces every subagent's answer with a marker
//   send      turn.step sends a message to spike-helper at its 2nd step
//   abort     turn.step aborts spike-helper's turn at its 3rd step
//   hide      agent.offer hides general-purpose
//   deny      agent.spawn denies any spawn whose parent is a subagent (depth cap)

const rows: unknown[] = []
let logPath = ''
let mode = new Set<string>()
const parents: Record<string, string | undefined> = {}
const types: Record<string, string> = {}
const waiting: Record<string, (answer: string) => void> = {}
const depth = (id?: string): number => (id ? 1 + depth(parents[id]) : 0)

async function log($: any, ev: string, data: unknown) {
  rows.push({ t: Date.now(), ev, data })
  if (logPath) await $.fs.write(logPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    logPath = (await $.env.get('SPIKE_LOG')) ?? ''
    mode = new Set(((await $.env.get('SPIKE_MODE')) ?? '').split(',').filter(Boolean))
    const reg = await $.tool.register({
      name: 'delegate_menial',
      description: 'Delegate a menial one-off job to a Haiku helper agent. Returns its report.',
      inputSchema: { type: 'object', properties: { brief: { type: 'string' } }, required: ['brief'] },
      isDeferred: false,
    })
    await log($, 'session.start', { mode: [...mode], reg })
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    await log($, 'agent.offer', { keys: Object.keys(e), agent: e.agent, source: e.source, provider: e.provider, all: e })
    if (mode.has('hide') && e.agent === 'general-purpose') return { isOffered: false }
    return next(e)
  })

  on('agent.spawn', async ($, e0, next) => {
    let e: any = e0
    const d = depth(e.parentAgentId) + 1
    await log($, 'agent.spawn.in', {
      subagentType: e.subagentType, model: e.model, parentModel: e.parentModel,
      parentAgentId: e.parentAgentId, parentType: e.parentAgentId ? types[e.parentAgentId] : 'main', depth: d, keys: Object.keys(e),
    })
    if (mode.has('deny') && e.parentAgentId) {
      await log($, 'agent.spawn.deny', { depth: d })
      return { deny: `triad-spike: depth cap, a subagent may not spawn (depth ${d})` }
    }
    if (mode.has('fg')) e = { ...e, background: false } as any
    const want = mode.has('force') && e.subagentType.endsWith('spike-coder') ? 'sonnet' : e.model
    const r = await next({ ...e, model: want })
    if (r.agentId) { parents[r.agentId] = e.parentAgentId; types[r.agentId] = e.subagentType }
    await log($, 'agent.spawn.out', { requested: want, result: r, list: await $.agent.list() })
    return r
  })

  on('tool.call', { tool: 'mcp__triad-spike__delegate_menial' }, async ($, e, next) => {
    const brief = String((e as any).brief)
    await log($, 'delegate.in', { callerAgentId: e.agentId, callerType: e.agentId ? types[e.agentId] : 'main' })
    const started = Date.now()
    const r = await $.agent.spawn({ subagentType: 'triad-spike:spike-helper', prompt: brief, description: 'menial', model: 'haiku' })
    if (!r.agentId) return { result: 'spawn refused: ' + (r as any).deny }
    types[r.agentId] = 'triad-spike:spike-helper(mod)'; parents[r.agentId] = e.agentId
    const marker = logPath + '.' + r.agentId + '.done'
    let answer: string | undefined
    waiting[r.agentId] = a => { answer = a }
    while (answer === undefined) {
      const w = await $.process.run(['bash', '-c', 'for i in $(seq 1 2400); do [ -e "$1" ] && exit 0; sleep 0.25; done; exit 1', 'wait', marker], { timeoutMs: 600_000 })
      await log($, 'delegate.poll', { exitCode: w.exitCode, have: answer !== undefined })
    }
    await log($, 'delegate.done', { ms: Date.now() - started, answer: answer.slice(0, 200) })
    return { result: answer }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool === 'mcp__triad-spike__delegate_menial') return next(e)
    const r: any = await next(e)
    if (mode.has('agentdeny') && e.tool === 'Agent' && !/status:/.test(r.text ?? '')) {
      await log($, 'tool.call.agentdeny', { text: r.text?.slice(0, 300) })
      return { deny: 'triad-spike: the subagent reply did not follow the return schema (no "status:" line). Resend it with SendMessage asking for the schema.' }
    }
    await log($, 'tool.call', { tool: e.tool, agentId: e.agentId, isError: r.isError, textLen: r.text?.length })
    if (mode.has('rewrite') && e.tool === 'Bash' && String((e as any).command).includes('SPIKE_REWRITE')) {
      const out = { result: { ...r.result, stdout: 'REWRITTEN-BY-MOD (original saved to .triad/out/x.txt)' } }
      await log($, 'tool.call.rewrite', { before: r.text, after: out })
      return out
    }
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const pre: any = { agentId: e.agentId, type: e.agentId ? types[e.agentId] : 'main', index: e.index, model: e.model, messageCount: e.messageCount }
    try {
      const msgs = await $.session.messages({ agentId: e.agentId, as: 'api' } as any)
      pre.preSendChars = JSON.stringify(msgs).length
    } catch (err) { pre.preSendErr = String(err) }
    await log($, 'turn.step.pre', pre)
    if (e.agentId && types[e.agentId]?.endsWith('spike-helper')) {
      if (mode.has('send') && e.index === 1) {
        const s = await $.session.send({ to: { agentId: e.agentId }, text: 'MESSAGE FROM MOD: include the word PINEAPPLE in your final report.' })
        await log($, 'session.send', { to: e.agentId, result: s })
      }
      if (mode.has('abort') && e.index === 2) {
        try { await $.turn.abort({ turnId: e.turnId }); await log($, 'turn.abort', { ok: true, turnId: e.turnId }) }
        catch (err) { await log($, 'turn.abort', { ok: false, err: String(err) }) }
      }
    }
    if (mode.has('synth') && e.agentId && types[e.agentId]?.endsWith('spike-helper') && e.index === 2) {
      const answer = 'status: partial\nsummary: stopped by triad-spike before request ' + e.index + ' (projected prompt over ceiling)'
      await log($, 'turn.step.synth', { agentId: e.agentId, index: e.index })
      yield { kind: 'text', index: 0, text: answer } as any
      yield { kind: 'stop', stopReason: 'end_turn', usage: null } as any
      return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: null } as any
    }
    const r = yield* next(e)
    await log($, 'turn.step.post', { agentId: e.agentId, index: e.index, usage: r?.usage, stopReason: r?.stopReason })
    return r
  })

  on('turn.complete', async ($, e, next) => {
    await log($, 'turn.complete', { agentId: e.agentId, type: e.agentId ? types[e.agentId] : 'main', reason: e.reason, usage: e.usage, answer: e.answer.slice(0, 400) })
    if (e.agentId && waiting[e.agentId]) { waiting[e.agentId](e.answer); delete waiting[e.agentId]; await $.fs.write(logPath + '.' + e.agentId + '.done', 'done') }
    if (mode.has('ret') && e.agentId) return { text: 'REWRITTEN-RETURN-BY-MOD status: done' }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await log($, 'session.measure', { cost: e.cost, changed: e.changed })
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    await log($, 'session.compact', { agentId: e.agentId, trigger: e.trigger })
    return next(e)
  })
}
