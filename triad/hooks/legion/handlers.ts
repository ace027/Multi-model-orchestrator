// Tool and command handlers over an Io (the mod passes one built on `$`).
import { gapSummary } from './gaps.ts'
import { parseGithubSection } from './github.ts'
import { loadPhase, loadProject, today, type Io } from './io.ts'
import { isLight, isPlanFile, pad2, parsePlan, setRoadmapRow, slugify, updateState, findPhaseDir } from './planning.ts'
import { renderContext, renderPlan, renderProject, type ContextInput, type PlanInput, type ProjectInput } from './render.ts'
import { critique, critiqueDoc, renderCritique } from './critique.ts'
import { lifecyclePosition, nextAction, phaseNumbers, renderStatus, renderSuggestions } from './status.ts'
import { contextSuggestions, loadIntentConfig } from './intents.ts'
import type { Project } from './io.ts'
import { dryRunReport, renderDryRun } from './dryrun.ts'
import { renderValidate, runValidate } from './validate.ts'
import { BY_ID, ROSTER, findPersona, rank } from './registry.ts'
import { agentScores, briefing } from './memory.ts'
import { deriveStatus, parseMilestones } from './milestone.ts'

export async function statusText(io: Io, opts: { dryRun?: boolean } = {}): Promise<string> {
  if (opts.dryRun) return renderDryRun(await dryRunReport(io, 'status'))
  const p = await loadProject(io)
  const plans = new Map<number, [boolean, boolean]>()
  for (const d of p.phaseDirs) {
    const n = Number(d.match(/^(\d+)/)?.[1])
    if (!Number.isFinite(n)) continue
    const ph = await loadPhase(io, p, n)
    plans.set(n, [ph.plans.length > 0, Object.keys(ph.summaries).length > 0])
  }
  const extra: string[] = []
  const ms = p.roadmap && p.roadmapText ? parseMilestones(p.roadmapText).map(m => ({ ...m, status: deriveStatus(m, p.roadmap!) })) : []
  const cur = ms.find(m => m.status === 'In Progress') ?? ms.find(m => m.status === 'Pending') ?? ms.find(m => m.status === 'Complete')
  if (cur) {
    extra.push('', '## Current Milestone', `**Milestone ${cur.n}: ${cur.name}** — ${cur.status}`)
    if (cur.status === 'Complete') extra.push('Run `/triad:milestone` to generate a summary and optionally archive.')
  }
  const b = await briefing(io, p.settings)
  if (b) extra.push('', '## Memory', b)
  const g = await gapSummary(io)
  if (g) extra.push('', '## Roster', g)
  // local readback of STATE.md ## GitHub; the live one is the github tool's status action
  const gh = p.stateText ? parseGithubSection(p.stateText) : undefined
  if (gh?.rows.length) {
    extra.push('', '## GitHub', ...gh.rows.map(r => `- ${r.phase}: issue ${r.issue}, PR ${r.pr || '—'}, ${r.status}`))
    for (const m of gh.milestones) extra.push(`- Milestone ${m.name} (${m.number}): ${m.status}`)
  }
  extra.push(...await suggestionsFor(io, p, n => plans.get(n)?.[0] ?? false))
  return renderStatus(p, nextAction(p, n => plans.get(n)?.[0] ?? false, n => plans.get(n)?.[1] ?? false)) + (extra.length ? '\n' + extra.join('\n') : '')
}

// intent-teams context_rules for the lifecycle position (the project's yaml, else the bundled one).
async function suggestionsFor(io: Io, p: Project, hasPlans: (n: number) => boolean): Promise<string[]> {
  const { config } = await loadIntentConfig(io)
  const pos = lifecyclePosition(p, hasPlans)
  const n = p.state?.phase ?? 1
  const phases = p.roadmap ? phaseNumbers(p.roadmap) : []
  const next = pos === 'needs_planning' || pos === 'just_started' ? n || 1 : phases.find(x => x > n) ?? n + 1
  const nameOf = (k: number) => p.roadmap?.phases.find(x => x.phase === k)?.name ?? ''
  const s = renderSuggestions(contextSuggestions(config, pos, { phase: n, next_phase: next, phase_name: nameOf(pos === 'needs_planning' || pos === 'phase_complete' || pos === 'just_started' ? next : n) }))
  return s.length ? ['', ...s] : []
}

// Light process (option lightPlans, isLight): plan counts are the ROADMAP's,
// the estimate until plan_write records the real count.
export async function processLine(io: Io, lightPlans: number): Promise<string> {
  const p = await loadProject(io)
  const rows = p.roadmap?.rows ?? []
  if (!rows.length) return ''
  if (!(lightPlans > 0)) return 'Process: full for every phase (lightPlans 0).'
  const count = (n: number) => rows.find(r => r.phase === n)?.plans ?? p.roadmap?.phases.find(x => x.phase === n)?.plans
  const light = rows.filter(r => isLight(count(r.phase), lightPlans)).map(r => r.phase)
  const full = rows.filter(r => !light.includes(r.phase)).map(r => r.phase)
  const list = (ns: number[]) => (ns.length === 1 ? `phase ${ns[0]}` : `phases ${ns.join(', ')}`)
  return `Process: ${[light.length ? `light for ${list(light)}` : '', full.length ? `full for ${list(full)}` : ''].filter(Boolean).join('; ')} (light: at most ${lightPlans} plans).`
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
  // A partial rewrite (auto-refine) keeps CONTEXT.md, which describes every plan.
  const contextPath = `${rel}/${pad2(n)}-CONTEXT.md`
  if (!only || (await io.read(contextPath)) === undefined) await io.write(contextPath, renderContext(n, name, input.context, input.plans))
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
  return [`Wrote ${only ? '' : `${rel}/${pad2(n)}-CONTEXT.md and `}${writing.length} plan file(s): ${writing.map(pl => `${pad2(n)}-${pad2(pl.plan)}-PLAN.md`).join(', ')}.`, '', renderCritique(c)].join('\n')
}

export async function planCheck(io: Io, phase: number): Promise<string> {
  const p = await loadProject(io)
  const ph = await loadPhase(io, p, phase)
  if (!ph.plans.length) return `No plans found for Phase ${phase}.`
  const r = critique(ph.plans, p.settings.planning?.max_tasks_per_plan ?? 3, ROSTER)
  if (ph.rel) {
    const name = p.roadmap?.phases.find(x => x.phase === phase)?.name ?? ph.dir?.replace(/^\d+-/, '') ?? ''
    await io.write(`${ph.rel}/CRITIQUE.md`, critiqueDoc(r, ph.plans, phase, name, today(io)))
  }
  return renderCritique(r) + (ph.rel ? `\nWrote ${ph.rel}/CRITIQUE.md.` : '')
}

// With a task: registry scores plus the memory boost (agents with 2+ outcome
// records, added only to a persona that already matches).
export async function personaRank(io: Io, input: { task?: string; agent?: string }): Promise<string> {
  if (input.agent || !input.task) return personaQuery(input)
  const p = await loadProject(io)
  const boost = await agentScores(io, p.settings).catch(() => ({} as Record<string, number>))
  const top = rank(input.task, x => x.tier !== 'opus').map(r => ({ ...r, mem: r.score > 0 ? boost[r.persona.id] ?? 0 : 0 }))
    .sort((a, b) => b.score + b.mem - (a.score + a.mem) || a.persona.id.localeCompare(b.persona.id)).slice(0, 6)
  return top.map(r => `${r.persona.id} (${r.persona.division}, tier ${r.persona.tier}): score ${r.score}${r.mem ? ` + memory ${r.mem}` : ''} — ${r.persona.description}`).join('\n')
}

export function personaQuery(input: { task?: string; agent?: string }): string {
  if (input.agent) {
    const f = findPersona(input.agent)
    if (!f.persona) return f.ambiguous ? `Ambiguous: ${f.ambiguous.join(', ')}` : `No persona "${input.agent}".`
    const p = f.persona
    return `id: ${p.id}\ntier: ${p.tier} (spawn as ${p.tier === 'haiku' ? 'triad:triad-helper' : p.tier === 'opus' ? 'triad:triad-opus-coder' : 'triad:triad-coder'})\n\nPut this at the top of the agent's brief:\n\n# Persona: ${p.name}\n${p.core}`
  }
  const top = rank(input.task ?? '', p => p.tier !== 'opus').slice(0, 6)
  return top.map(r => `${r.persona.id} (${r.persona.division}, tier ${r.persona.tier}): score ${r.score} — ${r.persona.description}`).join('\n')
}

export { BY_ID }
