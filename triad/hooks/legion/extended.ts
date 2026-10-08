// Dispatch for the Phase 6 (extended Legion) tools.
import { loadProject, type Io } from './io.ts'
import type { Agents } from './build.ts'
import { agentScores, briefing, learnList, learnRecall, learnRecord, prune, recallOutcomes } from './memory.ts'
import { milestoneArchive, milestoneComplete, milestoneDefine, milestoneFacts, milestoneStatus } from './milestone.ts'
import { freshness, mapBuild, mapNarrate, mapQuery, renderFreshness } from './map.ts'
import { retroGather, retroSave } from './retro.ts'

export const EXTENDED = new Set(['memory', 'milestone', 'retro', 'map'])

export async function extendedTool(io: Io, _agents: () => Agents, name: string, input: any): Promise<string> {
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
  }
  return `unknown tool ${name}`
}
