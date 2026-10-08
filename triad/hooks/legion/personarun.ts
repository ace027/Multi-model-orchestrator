// Persona agents for the judgment commands (advise, board, explore, retro,
// polish, spec pipeline, domain workflows): each run starts one agent at its
// persona's tier with the persona's distilled core, in parallel up to the coder
// cap. Read-only runs may not write any file; others only their `writable` list.
import type { Io } from './io.ts'
import type { Agents } from './build.ts'
import { BY_ID, findPersona, personaBrief } from './registry.ts'
import { NOT_SPAWNED, NOT_SPAWNED_MSG } from './authority.ts'

export type PersonaRunInput = { runs: { agent: string; brief: string; label?: string; writable?: string[] }[]; read_only?: boolean }
export type PersonaRunResult = { agent: string; label: string; agentId?: string; answer?: string; error?: string; files: string[]; warnings: string[]; reviewed?: 'sonnet' }

const REVIEWER = 'testing-qa-verification-specialist'

const READ_ONLY_NOTE = 'You are read-only for this task: do not create, edit or delete any file (edits are refused). Read, search and run read-only commands; put everything in your answer.'

export async function runPersonas(io: Io, agents: Agents, input: PersonaRunInput, log: (s: string) => void = () => {}): Promise<PersonaRunResult[]> {
  const runs = Array.isArray(input?.runs) ? input.runs : []
  const readOnly = input.read_only !== false
  // Writes outside the run's list are refused whatever the project's mode.
  const mode = 'surgical' as const
  const results: PersonaRunResult[] = new Array(runs.length)
  let next = 0
  const worker = async () => {
    while (next < runs.length) {
      const i = next++
      const r = runs[i]!
      const label = (r.label || r.agent).slice(0, 60)
      const f = findPersona(String(r.agent ?? ''))
      if (!f.persona || f.persona.id === NOT_SPAWNED) {
        results[i] = { agent: r.agent, label, error: f.persona ? NOT_SPAWNED_MSG : f.ambiguous ? `ambiguous persona: ${f.ambiguous.join(', ')}` : `unknown persona "${r.agent}"`, files: [], warnings: [] }
        continue
      }
      const writable = readOnly ? [] : (r.writable ?? [])
      const scopeNote = readOnly ? READ_ONLY_NOTE : `Files you may write: ${writable.length ? writable.join(', ') : 'none'}. Other writes are refused.`
      const brief = `${personaBrief(f.persona)}\n\n---\n\n${r.brief}\n\n${scopeNote}`
      const scope = { planId: label, mode, files_modified: writable, files_forbidden: [] }
      const run = await agents.run({ persona: f.persona, brief, label, scope })
      const w = run.agentId ? agents.writesOf(run.agentId) : { files: [], warnings: [] }
      results[i] = { agent: f.persona.id, label, agentId: run.agentId, answer: run.answer, error: run.deny ?? (run.answer === undefined ? 'no answer' : undefined), ...w }
      // User decision 1: haiku-tier personas run on Haiku and Sonnet reviews their output.
      if (f.persona.tier === 'haiku' && run.answer !== undefined && !run.deny) {
        const reviewer = BY_ID.get(REVIEWER)!
        const rb = `${personaBrief(reviewer)}\n\n---\n\n# Review of a Haiku agent's output\nThe ${f.persona.name} (${f.persona.id}) did the task below on Haiku. Check its output against the task: correct errors and omissions, and return the corrected output in the same format as the original, with nothing before or after it.\n\n## Original task\n${r.brief}\n\n## Haiku output\n${run.answer}\n\n${scopeNote}`
        const rv = await agents.run({ persona: reviewer, brief: rb, label: `${label} sonnet review`.slice(0, 60), scope })
        if (rv.answer !== undefined && !rv.deny && rv.answer.trim()) Object.assign(results[i]!, { answer: rv.answer, reviewed: 'sonnet' })
        else results[i]!.warnings.push(`sonnet review of the haiku output failed (${rv.deny ?? 'no answer'}); the haiku output is unreviewed`)
      }
      log(`${label}: ${results[i]!.error ?? 'answered'}`)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(agents.maxParallel, runs.length)) }, worker))
  return results
}

export function renderPersonaRuns(rs: PersonaRunResult[]): string {
  return rs.map(r => [
    `## ${r.label} (${r.agent}${r.agentId ? `, agent ${r.agentId}` : ''}${r.reviewed ? ', reviewed by sonnet' : ''})`,
    r.error ? `**Error:** ${r.error}` : (r.answer ?? '').trim(),
    r.files.length ? `\nFiles written: ${r.files.join(', ')}` : '',
    r.warnings.length ? `Refused or flagged writes: ${r.warnings.join('; ')}` : '',
  ].filter(Boolean).join('\n')).join('\n\n')
}
