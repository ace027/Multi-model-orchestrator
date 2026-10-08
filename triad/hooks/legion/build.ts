// The wave executor (wave-executor, execution-tracker) in mod code: waves in
// order, the plans of a wave in parallel (except those sharing files), one agent
// per plan at its persona's tier, verification commands run here, a SUMMARY.md
// per plan (failures too), STATE/ROADMAP updated as it goes, one commit per
// successful plan. Resumable: a plan with a successful SUMMARY is not run again.
import { preBuildCheck } from './gates.ts'
import { ghTickPlan } from './github.ts'
import { loadPhase, loadProject, today, type Io, type Project } from './io.ts'
import {
  appendToSection, checkPhase, getSection, handoffOf, pad2, planWaves, progressBar, runGroups, setRoadmapRow, summaryStatus,
  succeeded, updateState, verificationCommands, overlaps, type Plan,
} from './planning.ts'
import { commitPhase, commitPlan, commitWave, renderSummary, type SummaryInput, type VerifyRun } from './render.ts'
import { BY_ID, findPersona, personaBrief, ROSTER } from './registry.ts'
import type { Persona } from './personas.ts'
import { critique } from './critique.ts'
import { parseReply } from '../policy.ts'
import { profileOf, type Mode, type Scope } from './settings.ts'
import { OUTCOMES, storeOutcome, taskTypeOf } from './memory.ts'

export type AgentRun = { agentId?: string; answer?: string; deny?: string }
export interface Agents {
  // Starts an agent on a brief and resolves with its final answer.
  run(o: { persona: Persona; brief: string; scope: Scope; label: string }): Promise<AgentRun>
  // A follow-up message to an agent that already answered; resolves with its new answer.
  followUp(agentId: string, text: string): Promise<string | undefined>
  // Writes the mod saw this agent make (relative paths), and warnings it gave.
  writesOf(agentId: string): { files: string[]; warnings: string[] }
  usageOf(agentId: string): string | undefined
  maxParallel: number
}

// only: run just these plans (intent filters, two-wave stages); the phase is
// finalized only once every plan in it has succeeded.
export type BuildOptions = { phase?: number; wave?: number; rerun?: boolean; only?: string[]; log?: (s: string) => void }
export type PlanOutcome = { id: string; status: SummaryInput['status']; agent: string; files: string[]; failedChecks: string[]; skipped?: boolean }
export type BuildReport = { ok: boolean; phase?: number; error?: string; warnings: string[]; plans: PlanOutcome[]; stoppedAfterWave?: number; text: string }

const VERIFY_TIMEOUT = 10 * 60_000

export async function runVerification(io: Io, cmds: string[]): Promise<VerifyRun[]> {
  const out: VerifyRun[] = []
  for (const command of cmds) {
    let r
    try {
      r = await io.run(['bash', '-c', command], { timeoutMs: VERIFY_TIMEOUT })
    } catch (e) {
      r = { exitCode: 124, stdout: '', stderr: `did not finish: ${(e as Error).message}` }
    }
    out.push({ command, exitCode: r.exitCode, passed: r.exitCode === 0, output: (r.stdout + r.stderr).slice(-4000) })
  }
  return out
}

// `git status --porcelain` paths (renames by their new path).
export async function dirtyFiles(io: Io): Promise<Set<string>> {
  const r = await io.run(['git', 'status', '--porcelain', '--untracked-files=all'])
  const out = new Set<string>()
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue
    let p = line.slice(3)
    if (p.includes(' -> ')) p = p.split(' -> ')[1]
    out.add(p.replace(/^"|"$/g, ''))
  }
  return out
}

export async function commit(io: Io, files: string[], message: string): Promise<string | undefined> {
  if (!files.length) return undefined
  const add = await io.run(['git', 'add', '-A', '--', ...files])
  if (add.exitCode !== 0) return `git add failed: ${add.stderr.trim()}`
  const staged = await io.run(['git', 'diff', '--cached', '--quiet'])
  if (staged.exitCode === 0) return undefined // nothing to commit
  const c = await io.run(['git', 'commit', '-q', '-m', message])
  return c.exitCode === 0 ? undefined : `git commit failed: ${(c.stderr || c.stdout).trim()}`
}

// Escalation blocks an agent emitted (agent-communication format).
export function escalationsIn(text: string): { severity: string; type: string; decision: string; status: string }[] {
  const out = []
  for (const m of text.matchAll(/<escalation>([\s\S]*?)<\/escalation>/g)) {
    const f = (k: string) => m[1].match(new RegExp(`^\\s*${k}:\\s*(.+)$`, 'im'))?.[1]?.trim()
    const sev = f('severity')
    const severity = sev && ['info', 'warning', 'blocker'].includes(sev) ? sev : 'warning'
    out.push({ severity, type: f('type') ?? 'scope', decision: f('decision') ?? '(no decision given)', status: 'pending' })
  }
  return out
}

const listAfter = (text: string, key: string) => {
  const lines = text.split('\n')
  const i = lines.findIndex(l => new RegExp(`^\\s*${key}:`, 'i').test(l))
  if (i < 0) return []
  const first = lines[i].replace(new RegExp(`^\\s*${key}:\\s*`, 'i'), '').trim()
  const out = first && !/^none$/i.test(first) ? [first] : []
  for (let j = i + 1; j < lines.length && !/^\s*[a-z_]+:/i.test(lines[j]) && !/^</.test(lines[j]) && !/^\s*```/.test(lines[j]); j++) if (lines[j].trim().replace(/^-\s*/, '')) out.push(lines[j].trim().replace(/^-\s*/, ''))
  return out
}

export function planBrief(o: { persona: Persona; plan: Plan; planText: string; phase: number; phaseName: string; wave: number; peers: string[]; handoffs: string; mode: Mode; haiku: boolean }): string {
  const { plan } = o
  return [
    personaBrief(o.persona),
    '',
    `# Plan ${plan.id}: ${plan.title}`,
    `Phase ${o.phase}: ${o.phaseName}. Wave ${o.wave}.${o.peers.length ? ` Running in parallel with ${o.peers.join(', ')}; do not touch their files.` : ''}`,
    `Control mode: ${o.mode}.`,
    '',
    '## Execution Context',
    `- Files you may write: ${plan.fm.files_modified.join(', ') || '(none)'}`,
    `- Files you must not touch: ${(plan.fm.files_forbidden ?? []).join(', ') || '(none listed)'}`,
    '- Triad runs the verification commands after you return, commits your work and writes the SUMMARY.md. Do not commit, and do not write SUMMARY or STATE files.',
    '- Run each task\'s verification commands yourself before returning; on a failure, one focused fix attempt, then report it.',
    '- If the plan leaves a decision open or needs a file outside its list, stop and return status blocked (or emit an <escalation> block) instead of guessing.',
    ...(o.handoffs ? ['', '## Handoff Context from Prior Wave', o.handoffs] : []),
    '',
    '## The plan',
    o.planText.replace(/^---\n[\s\S]*?\n---\n/, `---\n(frontmatter: files_modified ${plan.fm.files_modified.join(', ')}; verification ${verificationCommands(plan).join(' ; ')})\n---\n`),
    '',
    '## Return',
    'Reply with only this block (no transcript, no file contents):',
    'status: done | partial | blocked',
    'summary: one to five lines',
    'tasks: one line per task, "N done|partial|failed|skipped: what"',
    'changes:',
    '- <path> | <added|edited|deleted> | <what>',
    'verify: <command> => <result>, one per line',
    'decisions: key decisions, one per line, or none',
    'issues: problems met, one per line, or none',
    'handoff: what the next wave needs to know (key outputs, conventions), one per line, or none',
    'blocked_reason: <only when blocked>',
    'Plus any <escalation> blocks (severity, type, decision, context).',
    ...(o.haiku ? ['', `Writable files: ${plan.fm.files_modified.join(', ') || 'none'}`] : []),
  ].join('\n')
}

function statusFrom(reply: ReturnType<typeof parseReply>, verify: VerifyRun[], escalations: { severity: string }[], warnings: string[]): SummaryInput['status'] {
  if (reply.status === 'blocked') return 'BLOCKED'
  if (verify.some(v => !v.passed)) return reply.status === 'done' ? 'Failed' : 'Partial'
  if (reply.status === 'partial' || !reply.status) return 'Partial'
  if (escalations.some(e => e.severity === 'blocker')) return 'Partial'
  return warnings.length || escalations.some(e => e.severity === 'warning') ? 'Complete with Warnings' : 'Complete'
}

function taskList(plan: Plan, answer: string): SummaryInput['tasks'] {
  const names = [...plan.body.matchAll(/<name>([^<]+)<\/name>/g)].map(m => m[1].trim())
  const reported = listAfter(answer, 'tasks')
  return (names.length ? names : reported.map((_, i) => `Task ${i + 1}`)).map((name, i) => {
    const r = reported.find(l => new RegExp(`^(task\\s*)?${i + 1}\\b`, 'i').test(l)) ?? reported[i] ?? ''
    const st = r.match(/\b(done|partial|failed|skipped)\b/i)?.[1]?.toLowerCase() as SummaryInput['tasks'][number]['status'] | undefined
    return { name, status: st ?? (parseReply(answer).status === 'done' ? 'done' : 'partial') }
  })
}

export async function build(io: Io, agents: Agents, opts: BuildOptions = {}): Promise<BuildReport> {
  const log = opts.log ?? (() => {})
  const warnings: string[] = []
  const fail = (error: string): BuildReport => ({ ok: false, error, warnings, plans: [], text: `Build stopped: ${error}` })
  let p = await loadProject(io)
  if (!p.hasPlanning || p.project === undefined) return fail('no Legion project here (.planning/PROJECT.md is missing). Run /triad:start.')
  if (!p.state || !p.roadmap || !p.stateText || !p.roadmapText) return fail('.planning/STATE.md or ROADMAP.md is missing.')
  const malformed = await preBuildCheck(io)
  if (malformed) return fail(malformed)
  const n = opts.phase ?? p.state.phase
  if (!n) return fail('STATE.md names no phase. Run /triad:plan 1 first, or pass --phase N.')
  const note = `${p.state.phaseNote} ${p.state.status}`.toLowerCase()
  if (opts.phase === undefined && /\bcomplete\b|executed|pending review/.test(p.state.phaseNote.toLowerCase()) && !/executing/.test(note)) {
    return fail(`phase ${n} is already executed (${p.state.phaseNote}). Run /triad:review, or /triad:build --phase N to build another phase.`)
  }
  const ph = await loadPhase(io, p, n)
  if (!ph.plans.length || !ph.rel) return fail(`No plans found for Phase ${n}. Run /triad:plan ${n} first.`)
  const info = p.roadmap.phases.find(x => x.phase === n)
  const phaseName = info?.name ?? p.roadmap.rows.find(r => r.phase === n)?.name ?? ph.dir!.replace(/^\d+-/, '')
  const settings = p.settings
  const mode = settings.control_mode as Mode
  const profile = profileOf(mode, await io.read('.planning/config/control-modes.yaml'))
  const prefix = settings.execution.commit_prefix
  const autoCommit = settings.execution.auto_commit !== false && !profile.read_only

  // Hard stops (wave-executor plan discovery).
  const waves = planWaves(ph.plans, ROSTER)
  const personaOf = new Map<string, Persona>()
  for (const plan of ph.plans) {
    const name = plan.fm.agents[0] ?? (plan.fm.autonomous ? 'engineering-senior-developer' : undefined)
    if (!name) { waves.errors.push(`${plan.id} names no agent`); continue }
    const f = findPersona(name)
    if (f.persona) personaOf.set(plan.id, f.persona)
    else waves.errors.push(f.ambiguous ? `${plan.id}: agent "${name}" is ambiguous (${f.ambiguous.join(', ')})` : `${plan.id}: agent "${name}" is not in the roster`)
  }
  if (waves.errors.length) return fail(`the plans have problems:\n- ${waves.errors.join('\n- ')}\nFix the plans (/triad:plan ${n}) and build again.`)
  warnings.push(...waves.warnings, ...p.settingsWarnings)
  const crit = critique(ph.plans, settings.planning?.max_tasks_per_plan ?? 3, ROSTER)
  for (const i of crit.issues.filter(i => i.severity === 'BLOCKER' && i.rule !== 'waves')) warnings.push(`critique ${i.plan} ${i.rule}: ${i.message}`)

  const outcomes: PlanOutcome[] = []
  const summaries = { ...ph.summaries }
  const ok = (id: string) => summaries[id] !== undefined && succeeded(summaryStatus(summaries[id]))
  const date = today(io)
  let state = p.stateText
  let roadmap = p.roadmapText
  const total = p.state.total ?? p.roadmap.rows.length
  const planned = ph.plans.length
  const doneCount = () => ph.plans.filter(x => ok(x.id)).length
  const overall = () => {
    const rows = p.roadmap!.rows.map(r => (r.phase === n ? { ...r, completed: doneCount(), plans: Math.max(r.plans ?? 0, planned) } : r))
    return rows.reduce((t, r) => ({ done: t.done + (r.completed ?? 0), all: t.all + (r.plans ?? 0) }), { done: 0, all: 0 })
  }
  const saveState = async (fields: Parameters<typeof updateState>[1]) => {
    const t = overall()
    state = updateState(state, { ...fields, progress: progressBar(t.done, t.all) })
    await io.write('.planning/STATE.md', state)
  }
  const resultsHeading = `## Phase ${n} Results`
  if (!getSection(state, new RegExp(`^##\\s+Phase ${n} Results`))) state = appendToSection(state, resultsHeading, `(build started ${date})`)
  await saveState({ phase: `${n} of ${total} (executing)`, status: `Phase ${n} executing — ${planned} plans across ${waves.waves.length} waves`, lastActivity: `Phase ${n} build (${date})` })

  let stopped: number | undefined
  for (const w of waves.waves) {
    if (opts.wave !== undefined && w.wave !== opts.wave) continue
    const mine = opts.only ? w.plans.filter(x => opts.only!.includes(x.id)) : w.plans
    const todo = mine.filter(x => opts.rerun || !ok(x.id))
    for (const x of mine.filter(x => !todo.includes(x))) outcomes.push({ id: x.id, status: 'Complete', agent: personaOf.get(x.id)!.id, files: [], failedChecks: [], skipped: true })
    if (!todo.length) continue
    // Dependencies must have succeeded (in this build or before it).
    const unmet = todo.flatMap(x => x.fm.depends_on.filter(d => !ok(d)).map(d => `${x.id} needs ${d}`))
    if (unmet.length) {
      warnings.push(`wave ${w.wave} not run: ${unmet.join('; ')}`)
      stopped = w.wave
      break
    }
    log(`wave ${w.wave}: ${todo.map(x => x.id).join(', ')}`)
    for (const group of runGroups(todo)) {
      for (let i = 0; i < group.length; i += Math.max(1, agents.maxParallel)) {
        const batch = group.slice(i, i + Math.max(1, agents.maxParallel))
        const before = await dirtyFiles(io)
        const runs = await Promise.all(batch.map(async plan => {
          const persona = personaOf.get(plan.id)!
          const handoffs = plan.fm.depends_on.filter(d => summaries[d]).map(d => `### From Plan ${d}\n${handoffOf(summaries[d])}`).join('\n\n')
          const brief = planBrief({
            persona, plan, planText: (await io.read(`${ph.rel}/${plan.file}`)) ?? plan.body, phase: n, phaseName, wave: w.wave,
            peers: batch.filter(x => x !== plan).map(x => x.id), handoffs, mode, haiku: persona.tier === 'haiku',
          })
          const scope: Scope = { planId: plan.id, mode, files_modified: plan.fm.files_modified, files_forbidden: plan.fm.files_forbidden ?? [] }
          const r = await agents.run({ persona, brief, scope, label: `plan ${plan.id}` })
          return { plan, persona, r }
        }))
        // Files changed by this batch, attributed to the plan that owns them.
        const after = await dirtyFiles(io)
        const changed = [...after].filter(f => !before.has(f) && !f.startsWith('.triad/') && !f.startsWith('.planning/'))
        const claimed = new Map<string, string[]>()
        const unclaimed: string[] = []
        for (const f of changed) {
          const owner = batch.find(x => x.fm.files_modified.some(m => overlaps(f, m))) ?? batch.find(x => runs.find(r => r.plan === x)?.r.agentId && agents.writesOf(runs.find(r => r.plan === x)!.r.agentId!).files.includes(f))
          if (owner) claimed.set(owner.id, [...(claimed.get(owner.id) ?? []), f])
          else unclaimed.push(f)
        }
        if (unclaimed.length && (mode === 'surgical' || profile.file_scope_restriction)) {
          // Surgical: changes outside every plan's files are reverted.
          await io.run(['git', 'checkout', '--', ...unclaimed]).catch(() => undefined)
          await io.run(['git', 'clean', '-fq', '--', ...unclaimed]).catch(() => undefined)
          warnings.push(`reverted changes outside the plans' files (control mode ${mode}): ${unclaimed.join(', ')}`)
        } else if (unclaimed.length) warnings.push(`changes outside every plan's files_modified (left uncommitted): ${unclaimed.join(', ')}`)

        for (const { plan, persona, r } of runs) {
          let answer = r.answer ?? ''
          const cmds = verificationCommands(plan)
          let verify = r.deny ? [] : await runVerification(io, cmds)
          // One focused fix attempt on a failed check (wave-executor's rule).
          if (r.agentId && verify.some(v => !v.passed) && parseReply(answer).status !== 'blocked') {
            const failed = verify.filter(v => !v.passed)
            const again = await agents.followUp(r.agentId, `Triad ran the plan's verification commands and ${failed.length} failed:\n${failed.map(v => `$ ${v.command}\n(exit ${v.exitCode})\n${v.output.slice(-1500)}`).join('\n\n')}\n\nMake one focused fix inside the plan's files, then reply again with the full return block.`)
            if (again) answer = again
            verify = await runVerification(io, cmds)
          }
          const reply = parseReply(answer)
          const esc = escalationsIn(answer)
          const seen = r.agentId ? agents.writesOf(r.agentId) : { files: [], warnings: [] }
          for (const wmsg of seen.warnings) esc.push({ severity: 'warning', type: 'scope', decision: wmsg, status: 'pending' })
          const status: SummaryInput['status'] = r.deny ? 'Failed' : !r.answer ? 'Failed' : statusFrom(reply, verify, esc, [])
          const files = [...new Set([...(claimed.get(plan.id) ?? []), ...seen.files.filter(f => plan.fm.files_modified.some(m => overlaps(f, m)))])].sort()
          const s: SummaryInput = {
            planId: plan.id, title: plan.title, wave: w.wave, agent: persona.id, status, date,
            tasks: taskList(plan, answer), files, verification: verify,
            decisions: listAfter(answer, 'decisions'), issues: [...listAfter(answer, 'issues'), ...(reply.blockedReason ? [`Blocked: ${reply.blockedReason}`] : [])],
            escalations: esc,
            handoff: { keyOutputs: files, decisions: listAfter(answer, 'decisions'), openQuestions: [], conventions: listAfter(answer, 'handoff') },
            requirements: plan.fm.requirements,
            error: r.deny ? `The agent could not start: ${r.deny}` : !r.answer ? 'The agent did not return an answer.' : status === 'Failed' ? `Verification failed: ${verify.filter(v => !v.passed).map(v => v.command).join('; ')}` : undefined,
            tokens: r.agentId ? agents.usageOf(r.agentId) : undefined,
          }
          const summaryText = renderSummary(s)
          summaries[plan.id] = summaryText
          await io.write(`${ph.rel}/${plan.id}-SUMMARY.md`, summaryText)
          const okNow = succeeded(status)
          state = appendToSection(state, resultsHeading, `- Plan ${plan.id} (Wave ${w.wave}): ${plan.title} — ${okNow ? status : `${status.toUpperCase()}: ${(s.error ?? reply.blockedReason ?? reply.summary[0] ?? '').slice(0, 200)}`}`)
          await saveState({ status: `Phase ${n} executing — Plan ${plan.id} ${okNow ? 'complete' : 'failed'}`, lastActivity: `Plan ${plan.id} execution (${date})` })
          // Memory: one outcome record per plan (memory-manager Store Outcome).
          const rec = await storeOutcome(io, settings, {
            phase: n, plan: plan.id, agent: persona.id, task_type: taskTypeOf(persona), tags: [ph.dir!.replace(/^\d+-/, ''), persona.division.toLowerCase()],
            outcome: status === 'Complete' ? 'success' : status === 'Complete with Warnings' ? 'partial' : 'failed',
            summary: `${plan.title}: ${status}${s.error ? ` — ${s.error.slice(0, 120)}` : ''}`,
          }).catch(() => undefined)
          if (okNow && autoCommit) {
            const err = await commit(io, [...files, `${ph.rel}/${plan.id}-SUMMARY.md`, ...(rec ? [OUTCOMES] : [])], commitPlan(prefix, plan.id, plan.title, n, phaseName, w.wave, plan.fm.requirements))
            if (err) warnings.push(`${plan.id}: ${err}`)
          }
          if (okNow && settings.integrations?.github === 'enabled') {
            const gh = await ghTickPlan(io, n, plan.id).catch(() => undefined)
            if (gh) log(gh)
          }
          outcomes.push({ id: plan.id, status, agent: persona.id, files, failedChecks: verify.filter(v => !v.passed).map(v => v.command) })
          log(`${plan.id}: ${status}`)
        }
      }
    }
    // After the wave: ROADMAP row and a state commit.
    const failedHere = outcomes.filter(o => todo.some(t => t.id === o.id) && !succeeded(o.status))
    const last = w.wave === waves.waves[waves.waves.length - 1].wave
    roadmap = setRoadmapRow(roadmap, n, { plans: Math.max(p.roadmap.rows.find(r => r.phase === n)?.plans ?? 0, planned), completed: doneCount(), status: failedHere.length ? 'Partial' : last && ph.plans.every(x => ok(x.id)) ? 'Executed' : 'In Progress' })
    await io.write('.planning/ROADMAP.md', roadmap)
    const t = overall()
    if (autoCommit) {
      const err = await commit(io, ['.planning/STATE.md', '.planning/ROADMAP.md', ...todo.map(x => `${ph.rel}/${x.id}-SUMMARY.md`)], commitWave(prefix, w.wave, n, todo.length - failedHere.length, todo.length, t.done, t.all))
      if (err) warnings.push(err)
    }
    if (failedHere.length) { stopped = w.wave; break }
  }

  const allOk = ph.plans.every(x => ok(x.id))
  const failed = ph.plans.filter(x => summaries[x.id] !== undefined && !ok(x.id))
  if ((opts.wave === undefined && !opts.only) || allOk) {
    if (allOk) {
      await saveState({ phase: `${n} of ${total} (executed, pending review)`, status: `Phase ${n} complete — all plans executed successfully`, nextAction: `Run \`/triad:review\` to verify Phase ${n}: ${phaseName}` })
      roadmap = setRoadmapRow(roadmap, n, { status: 'Executed', completed: doneCount() })
    } else {
      await saveState({ phase: `${n} of ${total} (partial — ${failed.length} plan(s) failed)`, status: `Phase ${n} partial — ${failed.map(f => f.id).join(', ')} failed${stopped !== undefined ? `, stopped after wave ${stopped}` : ''}, review needed`, nextAction: `Fix the failed plans and run \`/triad:build\` again (completed plans are kept), or run \`/triad:review\`` })
      roadmap = setRoadmapRow(roadmap, n, { status: 'Partial', completed: doneCount() })
    }
    await io.write('.planning/ROADMAP.md', roadmap)
    if (autoCommit) {
      const err = await commit(io, ['.planning/STATE.md', '.planning/ROADMAP.md'], allOk ? commitPhase(prefix, n, phaseName) : `chore(${prefix}): phase ${n} build stopped — ${phaseName}`)
      if (err) warnings.push(err)
    }
  }
  // With only, success means the selected plans succeeded; the rest of the phase is someone else's run.
  const selectedOk = opts.only ? ph.plans.filter(x => opts.only!.includes(x.id)).every(x => ok(x.id)) && stopped === undefined : allOk
  const held = opts.only ? ph.plans.filter(x => !opts.only!.includes(x.id) && !ok(x.id)).map(x => x.id) : []
  const text = [
    `Phase ${n}: ${phaseName} — ${allOk ? 'all plans executed' : selectedOk ? `selected plans executed${held.length ? ` (not run: ${held.join(', ')})` : ''}` : 'build incomplete'}`,
    ...outcomes.map(o => `- ${o.id} ${o.agent}: ${o.status}${o.skipped ? ' (already done, skipped)' : ''}${o.failedChecks.length ? ` — failed: ${o.failedChecks.join('; ')}` : ''}`),
    ...(warnings.length ? ['', 'Warnings:', ...warnings.map(x => `- ${x}`)] : []),
    '',
    allOk ? `Next: /triad:review` : selectedOk ? 'Next: the plans not run here' : `Next: fix ${failed.map(f => f.id).join(', ') || 'the plans'} and run /triad:build again`,
  ].join('\n')
  return { ok: selectedOk, phase: n, warnings, plans: outcomes, stoppedAfterWave: stopped, text }
}

export { BY_ID, checkPhase, pad2 }
export type { Project }
