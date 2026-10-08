import type { Register } from 'claude-code'

// Throwaway Phase 3 probe. Appends JSONL rows to $PROBE_LOG.
const rows: string[] = []
let logPath = ''

async function log($: any, ev: string, data: unknown) {
  rows.push(JSON.stringify({ ev, ...(data as object) }))
  if (logPath) await $.fs.write(logPath, rows.join('\n') + '\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    logPath = (await $.env.get('PROBE_LOG')) ?? ''
    return next(e)
  })
  on('tool.describe', async ($, e, next) => {
    const r = await next(e)
    await log($, 'tool.describe', { tool: e.tool, provider: e.provider, chars: r.description.length, isDeferred: r.isDeferred ?? false })
    return r
  })
  on('prompt.section', async ($, e, next) => {
    const r = await next(e)
    await log($, 'prompt.section', { name: e.name, chars: r.text?.length ?? null, head: r.text?.slice(0, 160) ?? null })
    return r
  })
  on('prompt.context', async ($, e, next) => {
    const r = await next(e)
    await log($, 'prompt.context', { blocks: r.blocks.map(b => [b.name, b.text.length]) })
    return r
  })
  on('turn.step', async function* ($, e, next) {
    if (e.index === 0) {
      try {
        const msgs = await $.session.messages({ agentId: e.agentId, as: 'api' } as any)
        await $.fs.write(logPath + '.' + (e.agentId ?? 'main') + '.messages.json', JSON.stringify(msgs, null, 1))
      } catch (err) { await log($, 'messages.err', { err: String(err) }) }
    }
    const r = yield* next(e)
    await log($, 'turn.step', { agentId: e.agentId ?? 'main', index: e.index, model: e.model, usage: r?.usage })
    return r
  })
  on('tool.call', async ($, e, next) => {
    const r: any = await next(e)
    await log($, 'tool.call', { agentId: e.agentId ?? 'main', tool: e.tool, chars: typeof r.text === 'string' ? r.text.length : null, isError: r.isError ?? false })
    return r
  })
}
