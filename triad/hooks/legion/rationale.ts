// Agent Selection Rationale (wave-executor SUMMARY section, agent-registry
// score_export) and the Phase Decision Summary. Legion has the executing agent
// re-derive the scores; here they come from the registry scorer itself.
// Triad has no semantic scorer, so that column reads "—".
import type { Persona } from './personas.ts'
import { rank } from './registry.ts'
import { taskTypeOf } from './memory.ts'

export type Candidate = { id: string; heuristic: number; memory: number; total: number; source: string }
export type Rationale = { candidates: Candidate[]; taskType: string; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; tier: string }

// The chosen persona plus the two best runners-up for the plan's own text.
export function selectionRationale(chosen: Persona, planText: string, boost: Record<string, number> = {}): Rationale {
  const scored = rank(planText, p => p.id !== 'agents-orchestrator').map(r => {
    const memory = r.score > 0 ? boost[r.persona.id] ?? 0 : 0
    return { id: r.persona.id, heuristic: r.score, memory, total: r.score + memory }
  }).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
  const mine = scored.find(c => c.id === chosen.id) ?? { id: chosen.id, heuristic: 0, memory: 0, total: 0 }
  const others = scored.filter(c => c.id !== chosen.id).slice(0, 2)
  const best = others[0]?.total ?? 0
  const top = mine.total >= best
  const source = (c: { heuristic: number; memory: number }, isChosen: boolean) =>
    isChosen && !top ? 'mandatory' : c.memory > 0 && c.memory >= c.heuristic ? 'memory' : 'heuristic'
  const confidence = top && mine.total >= 6 && mine.total - best >= 3 ? 'HIGH' : top && mine.total > 0 ? 'MEDIUM' : 'LOW'
  return {
    candidates: [{ ...mine, source: source(mine, true) }, ...others.map(c => ({ ...c, source: source(c, false) }))],
    taskType: taskTypeOf(chosen), confidence, tier: chosen.tier,
  }
}

export function renderRationale(r: Rationale): string[] {
  return [
    '## Agent Selection Rationale', '',
    '| Candidate | Semantic | Heuristic | Memory | Total | Source |',
    '|-----------|----------|-----------|--------|-------|--------|',
    ...r.candidates.map(c => `| ${c.id} | — | ${c.heuristic} | ${c.memory} | ${c.total} | ${c.source} |`), '',
    `- **Task type detected**: ${r.taskType}`,
    `- **Confidence**: ${r.confidence}`,
    '- **Adapter**: claude-code',
    `- **Model tier**: ${r.tier}`,
  ]
}

export type Decision = { plan: string; agent: string; rationale?: Rationale; escalations: number }

export function renderDecisionSummary(ds: Decision[]): string[] {
  if (!ds.length) return []
  return [
    '## Phase Decision Summary', '',
    '| Plan | Agent | Confidence | Adapter | Model Tier | Escalations |',
    '|------|-------|------------|---------|------------|-------------|',
    ...ds.map(d => d.rationale
      ? `| ${d.plan} | ${d.agent} | ${d.rationale.confidence} | claude-code | ${d.rationale.tier} | ${d.escalations} |`
      : `| ${d.plan} | Autonomous | — | — | — | ${d.escalations} |`),
  ]
}
