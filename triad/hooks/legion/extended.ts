// Dispatch for the Phase 6 (extended Legion) tools.
import { loadProject, type Io } from './io.ts'
import type { Agents } from './build.ts'
import { agentScores, briefing, learnList, learnRecall, learnRecord, prune, recallOutcomes } from './memory.ts'
import { milestoneArchive, milestoneComplete, milestoneDefine, milestoneFacts, milestoneStatus } from './milestone.ts'
import { freshness, mapBuild, mapNarrate, mapQuery, renderFreshness } from './map.ts'
import { agentCreate, loadCustomPersonas, validateAgent } from './custom.ts'
import { gapAnalysis, rosterLimit } from './gaps.ts'
import { portfolioAddDep, portfolioDashboard, portfolioDetails, portfolioRegister, portfolioUnregister } from './portfolio.ts'
import { retroGather, retroSave } from './retro.ts'

export const EXTENDED = new Set(['memory', 'milestone', 'retro', 'map', 'portfolio', 'agent', 'roster'])

export type Ctx = { agents: () => Agents; ioAt: (root: string) => Io; registry: () => Promise<Io> }

export async function extendedTool(io: Io, ctx: Ctx, name: string, input: any): Promise<string> {
  await loadCustomPersonas(io)
  const settings = (await loadProject(io)).settings
  switch (name) {
    case 'memory':
      switch (input.action) {
        case 'record': return learnRecord(io, { type: input.type, summary: String(input.summary ?? ''), tags: input.tags ?? [], text: String(input.text ?? input.summary ?? '') })
        case 'recall': return learnRecall(io, settings, String(input.topic ?? ''))
        case 'list': return learnList(io)
        case 'prune': return prune(io, settings)
        case 'outcomes': {
          const r = await recallOutcomes(io, settings, input)
          return [...r.records.map(o => `${o.id} ${o.date} ${o.plan} ${o.agent} ${o.task_type}: ${o.outcome} (importance ${o.importance}) — ${o.summary}`), `(${r.records.length} of ${r.total})`, ...(r.note ? [r.note] : [])].join('\n')
        }
        case 'scores': return JSON.stringify(await agentScores(io, settings, input.task_types ?? []))
        case 'briefing': return (await briefing(io, settings)) ?? 'No outcome records yet.'
      }
      return 'memory: unknown action'
    case 'milestone':
      switch (input.action) {
        case 'status': return milestoneStatus(io)
        case 'define': return milestoneDefine(io, input.milestones ?? [])
        case 'facts': return milestoneFacts(io, Number(input.n))
        case 'complete': return milestoneComplete(io, Number(input.n), input)
        case 'archive': return milestoneArchive(io, Number(input.n))
      }
      return 'milestone: unknown action'
    case 'retro':
      if (input.action === 'save') return retroSave(io, input)
      return retroGather(io, { phase: input.phase, milestone: input.milestone })
    case 'map':
      switch (input.action) {
        case 'build': return mapBuild(io, { scope: input.scope })
        case 'check': return renderFreshness(await freshness(io))
        case 'narrate': return mapNarrate(io, input.sections ?? {})
        case 'query': return mapQuery(io, String(input.query ?? ''))
      }
      return 'map: unknown action'
    case 'portfolio': {
      const reg = await ctx.registry()
      switch (input.action) {
        case 'dashboard': return portfolioDashboard(reg, ctx.ioAt)
        case 'register': return portfolioRegister(reg, io)
        case 'unregister': return portfolioUnregister(reg, String(input.project ?? io.root))
        case 'add_dep': return portfolioAddDep(reg, ctx.ioAt, input)
        case 'details': return portfolioDetails(reg, ctx.ioAt, String(input.project ?? ''))
      }
      return 'portfolio: unknown action'
    }
    case 'agent': {
      if (input.action === 'validate') {
        const errs = await validateAgent(io, { tags: [], ...input.agent })
        return errs.length ? errs.map(e => `- ${e}`).join('\n') : 'All checks pass.'
      }
      if (input.action === 'create') {
        const lim = await rosterLimit(io)
        return agentCreate(io, input.agent ?? {}, { limit: lim, force: input.force })
      }
      return 'agent: unknown action'
    }
    case 'roster':
      if (input.action === 'limit') { const l = await rosterLimit(io); return `${l.count} agents, limit ${l.limit}: ${l.status}${l.suggestions.length ? `\n${l.suggestions.map(s => `- ${s}`).join('\n')}` : ''}` }
      return gapAnalysis(io, input)
  }
  return `unknown tool ${name}`
}
