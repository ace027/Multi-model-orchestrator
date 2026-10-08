// Tool and command handlers over an Io (the mod passes one built on `$`).
import { loadPhase, loadProject, today, type Io } from './io.ts'
import { isPlanFile, pad2, parsePlan, setRoadmapRow, slugify, updateState, findPhaseDir } from './planning.ts'
import { renderContext, renderPlan, renderProject, type ContextInput, type PlanInput, type ProjectInput } from './render.ts'
import { critique, renderCritique } from './critique.ts'
import { nextAction, renderStatus } from './status.ts'
import { renderValidate, runValidate } from './validate.ts'
import { BY_ID, ROSTER, findPersona, rank } from './registry.ts'

export async function statusText(io: Io): Promise<string> {
  const p = await loadProject(io)
  const plans = new Map<number, [boolean, boolean]>()
  for (const d of p.phaseDirs) {
    const n = Number(d.match(/^(\d+)/)?.[1])
    if (!Number.isFinite(n)) continue
    const ph = await loadPhase(io, p, n)
    plans.set(n, [ph.plans.length > 0, Object.keys(ph.summaries).length > 0])
  }
  return renderStatus(p, nextAction(p, n => plans.get(n)?.[0] ?? false, n => plans.get(n)?.[1] ?? false))
}

export async function validateText(io: Io, args: string): Promise<{ text: string; exitCode: number }> {
  const r = await runValidate(io, { fix: /--fix\b/.test(args) })
  return renderValidate(r, /--ci\b/.test(args))
}

export async function projectInit(io: Io, input: ProjectInput & { overwrite?: boolean }): Promise<string> {
  if (!input?.name || !Array.isArray(input.phases) || !input.phases.length) return 'project_init needs name, description and at least one phase.'
  if ((await io.read('.planning/PROJECT.md')) !== undefined && !input.overwrite) return 'A project already exists (.planning/PROJECT.md). Ask the user: overwrite, or abort. Call again with overwrite: true only if they chose to overwrite.'
  const unknown = input.phases.flatMap(ph => (ph.agents ?? []).filter(a => !ROSTER.has(a)))
  if (unknown.length) return `Unknown persona ids: ${[...new Set(unknown)].join(', ')}. Use persona_brief with a task to find the right ids.`
  const f = renderProject(input, today(io))
  await io.write('.planning/PROJECT.md', f.project)
  await io.write('.planning/ROADMAP.md', f.roadmap)
  await io.write('.planning/STATE.md', f.state)
  await io.write('.planning/phases/.gitkeep', '')
  const total = input.phases.reduce((n, ph) => n + (ph.plans ?? 1), 0)
  return `Wrote .planning/PROJECT.md, ROADMAP.md (${input.phases.length} phases, ~${total} plans) and STATE.md.\nNext: /triad:plan 1 — Phase 1: ${input.phases[0]!.name}`
}

export async function planWrite(io: Io, input: { phase: number; context: ContextInput; plans: PlanInput[]; replace?: boolean; only?: number[] }): Promise<string> {
  const p = await loadProject(io)
  if (!p.roadmap || !p.stateText || !p.roadmapText) return 'No ROADMAP.md/STATE.md. Run /triad:start first.'
  const n = input.phase
  const info = p.roadmap.phases.find(x => x.phase === n)
  const row = p.roadmap.rows.find(r => r.phase === n)
  if (!info && !row) return `Phase ${n} doesn't exist. ROADMAP.md has ${p.roadmap.rows.length || p.roadmap.phases.length} phases.`
  const name = info?.name ?? row!.name
  const dir = findPhaseDir(p.phaseDirs, n) ?? `${pad2(n)}-${slugify(name)}`
  const rel = `.planning/phases/${dir}`
  const slug = dir.replace(/^\d+-/, '')
  const existing = (await io.list(rel)).filter(e => !e.dir && isPlanFile(e.name)).map(e => e.name)
  const only = input.only?.length ? new Set(input.only) : undefined
  if (existing.length && !input.replace && !only) return `Phase ${n} already has plans (${existing.join(', ')}). Ask the user: re-plan from scratch (call again with replace: true) or keep them (stop here).`
  const max = p.settings.planning?.max_tasks_per_plan ?? 3
  const unknown = input.plans.flatMap(pl => pl.agents.filter(a => !ROSTER.has(a)))
  if (unknown.length) return `Unknown persona ids: ${[...new Set(unknown)].join(', ')}. Pick ids with persona_brief.`
  const writing = input.plans.filter(pl => !only || only.has(pl.plan))
  if (input.replace && !only) for (const f of existing) await io.run(['rm', '-f', `${rel}/${f}`])
  await io.write(`${rel}/${pad2(n)}-CONTEXT.md`, renderContext(n, name, input.context, input.plans))
  for (const pl of writing) await io.write(`${rel}/${pad2(n)}-${pad2(pl.plan)}-PLAN.md`, renderPlan(n, slug, pl))
  // Read back what is on disk: the critique and the schema see the files as written.
  const files = (await io.list(rel)).filter(e => !e.dir && isPlanFile(e.name)).map(e => e.name).sort()
  const plans = []
  for (const f of files) plans.push(parsePlan(f, (await io.read(`${rel}/${f}`)) ?? '', n))
  const c = critique(plans, max, ROSTER)
  const waves = new Set(plans.map(x => x.fm.wave)).size
  const state = updateState(p.stateText, {
    phase: `${n} of ${p.state?.total ?? p.roadmap.rows.length} (planned)`,
    status: `Phase ${n} planned -- ${plans.length} plans across ${waves} waves`,
    lastActivity: `Phase ${n} planning (${today(io)})`,
    nextAction: `Run \`/triad:build\` to execute Phase ${n}: ${name}`,
  })
  await io.write('.planning/STATE.md', state)
  await io.write('.planning/ROADMAP.md', setRoadmapRow(p.roadmapText, n, { plans: plans.length, completed: 0, status: 'Planned' }))
  return [`Wrote ${rel}/${pad2(n)}-CONTEXT.md and ${writing.length} plan file(s): ${writing.map(pl => `${pad2(n)}-${pad2(pl.plan)}-PLAN.md`).join(', ')}.`, '', renderCritique(c)].join('\n')
}

export async function planCheck(io: Io, phase: number): Promise<string> {
  const p = await loadProject(io)
  const ph = await loadPhase(io, p, phase)
  if (!ph.plans.length) return `No plans found for Phase ${phase}.`
  return renderCritique(critique(ph.plans, p.settings.planning?.max_tasks_per_plan ?? 3, ROSTER))
}

export function personaQuery(input: { task?: string; agent?: string }): string {
  if (input.agent) {
    const f = findPersona(input.agent)
    if (!f.persona) return f.ambiguous ? `Ambiguous: ${f.ambiguous.join(', ')}` : `No persona "${input.agent}".`
    const p = f.persona
    return `id: ${p.id}\ntier: ${p.tier} (spawn as ${p.tier === 'haiku' ? 'triad:triad-helper' : 'triad:triad-coder'}${p.tier === 'opus' ? ' with model opus' : ''})\n\nPut this at the top of the agent's brief:\n\n# Persona: ${p.name}\n${p.core}`
  }
  const top = rank(input.task ?? '', p => p.tier !== 'opus').slice(0, 6)
  return top.map(r => `${r.persona.id} (${r.persona.division}, tier ${r.persona.tier}): score ${r.score} — ${r.persona.description}`).join('\n')
}

export { BY_ID }
