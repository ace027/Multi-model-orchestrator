// Dispatch for the Phase 6 (extended Legion) tools.
import { loadPhase, loadProject, type Io } from './io.ts'
import type { Agents } from './build.ts'
import { agentScores, briefing, claudeMemoryNote, learnList, learnRecall, learnRecord, prune, recallOutcomes } from './memory.ts'
import { milestoneArchive, milestoneComplete, milestoneDefine, milestoneFacts, milestoneStatus } from './milestone.ts'
import { freshness, mapBuild, mapNarrate, mapQuery, renderFreshness } from './map.ts'
import { agentCreate, loadCustomPersonas, validateAgent } from './custom.ts'
import { gapAnalysis, rosterLimit } from './gaps.ts'
import { portfolioAddDep, portfolioDashboard, portfolioDetails, portfolioRegister, portfolioUnregister } from './portfolio.ts'
import { ghClosePhase, ghPhaseIssue, ghMode, ghStatus, ghTickPlan, setGhMode } from './github.ts'
import { canaryCheck, renderCanary, shipCheck, shipPublish } from './ship.ts'
import { polishRun, polishScope } from './polish.ts'
import { securitySave, securityScan } from './security.ts'
import { retroGather, retroSave } from './retro.ts'
import { filterPlans, loadIntentConfig, parseIntentFlags, parseNaturalLanguage, renderNl, renderValidation, resolveTeam, validateFlagCombination } from './intents.ts'
import { dryRunReport, renderDryRun } from './dryrun.ts'
import { renderSpecCheck, specAssess, specCheck, specGather, specTrigger } from './spec.ts'
import { campaignReport, designGrade, designTeam, detectDomain, domainCheck, marketingTeam, passSummary, setStatus, slopGrade, wavePattern, writeDoc } from './domain.ts'
import { boardCompose, boardDecide, boardMeet, boardReview } from './board.ts'

export const EXTENDED = new Set(['memory', 'milestone', 'retro', 'map', 'portfolio', 'agent', 'roster', 'ship', 'polish', 'github', 'security', 'intent', 'dry_run', 'board', 'spec', 'domain'])

export type Ctx = { agents: () => Agents; ioAt: (root: string) => Io; registry: () => Promise<Io>; schedule?: (ms: number, fn: () => void) => void; notify?: (text: string) => void }

export async function extendedTool(io: Io, ctx: Ctx, name: string, input: any): Promise<string> {
  await loadCustomPersonas(io)
  const settings = (await loadProject(io)).settings
  // Claude Code memory (read only) next to Triad's recall; home is the registry's parent.
  const withClaudeMemory = async (text: string) => {
    const reg = await ctx.registry().catch(() => undefined)
    const note = reg ? await claudeMemoryNote(settings, ctx.ioAt(reg.root.replace(/\/\.claude\/legion\/?$/, '')), io.root) : undefined
    return note ? `${text}\n\n${note}` : text
  }
  switch (name) {
    case 'intent': {
      const { config, warnings } = await loadIntentConfig(io)
      const note = warnings.map(w => `Note: ${w}\n`).join('')
      const command = String(input.command ?? 'build').replace(/^\/?(triad:)?/, '')
      if (input.action === 'route') return note + renderNl(parseNaturalLanguage(String(input.text ?? ''), config), input.command ? command : undefined)
      const f = parseIntentFlags(String(input.flags ?? ''), command)
      const v = validateFlagCombination(f, command, config)
      if (!v.valid) return note + renderValidation(v)
      const out = [`Flags valid for /triad:${command}.${v.info.length ? ' ' + v.info.join('; ') : ''}`]
      for (const i of f.intents) {
        const t = resolveTeam(config, i)!
        out.push(`- ${i} (${t.mode}): ${t.description}${t.agents.primary.length ? `; team ${[...t.agents.primary, ...t.agents.secondary].join(', ')}` : ''}${t.domains.length ? `; domains ${t.domains.join(', ')}` : ''}`)
      }
      if (f.intents.some(i => resolveTeam(config, i)?.mode === 'filter_plans')) {
        const p = await loadProject(io)
        const n = input.phase ?? p.state?.phase
        const ph = n ? await loadPhase(io, p, n) : undefined
        if (ph?.plans.length) {
          const fl = filterPlans(ph.plans, f, config)
          out.push(`Plans run: ${fl.keep.join(', ') || 'none'}`, ...fl.drop.map(d => `- skip ${d.id}: ${d.reason}`), ...fl.warnings.map(w => `- ${w}`))
        }
      }
      return note + out.join('\n')
    }
    case 'board':
      switch (input.action) {
        case 'compose': return boardCompose(String(input.topic ?? ''), settings)
        case 'meet': return boardMeet(io, ctx.agents(), { topic: String(input.topic ?? ''), members: input.members, context: input.context, allow_two: input.allow_two })
        case 'review': return boardReview(io, ctx.agents(), { phase: input.phase, topic: input.topic })
        case 'decide': return boardDecide(io, { dir: String(input.dir ?? ''), decision: input.decision, conditions: input.conditions })
      }
      return 'board: unknown action'
    case 'spec':
      switch (input.action) {
        case 'trigger': { const t = await specTrigger(io, input.phase, !!input.flag); return `${t.action}: ${t.reason}\nproposals: ${t.proposals} (planning.architecture_proposals_default)` }
        case 'gather': return specGather(io, input.phase)
        case 'check': return renderSpecCheck(await specCheck(io, input.phase))
        case 'assess': return specAssess(io, input.phase)
      }
      return 'spec: unknown action'
    case 'domain':
      switch (input.action) {
        case 'detect': { const d = await detectDomain(io, input.phase, input.flag); return [`domain: ${d.domain ?? 'none'} (${d.reason})`, d.supporting ? `supporting: ${d.supporting}` : '', d.hint ?? '', d.domain ? `Waves:\n${wavePattern(d.domain, input.options ?? {}).map(w => `- ${w}`).join('\n')}` : ''].filter(Boolean).join('\n') }
        case 'team': { const t = input.domain === 'marketing' ? marketingTeam(input.answers ?? {}) : designTeam(input.answers ?? {}); return t.map(m => `- ${m.agent}: ${m.role}`).join('\n') }
        case 'write': return writeDoc(io, { kind: input.kind, name: String(input.name ?? ''), fields: input.fields, overwrite: input.overwrite })
        case 'status': return setStatus(io, String(input.path ?? ''), String(input.status ?? ''))
        case 'check': return domainCheck(io, String(input.path ?? ''))
        case 'report': return campaignReport(io, input)
        case 'grade': return `Design Score: ${designGrade(Number(input.high ?? 0), Number(input.medium ?? 0))}; AI Slop Score: ${slopGrade(Number(input.slop ?? 0))}`
        case 'passes': {
          const text = passSummary(input.scores ?? [])
          if (input.phase) {
            const p = await loadProject(io)
            const ph = await loadPhase(io, p, Number(input.phase))
            if (ph.rel) { const c = (await io.read(`${ph.rel}/CONTEXT.md`)) ?? ''; await io.write(`${ph.rel}/CONTEXT.md`, `${c.trimEnd()}\n\n${text}\n`) }
          }
          return text
        }
      }
      return 'domain: unknown action'
    case 'dry_run': return renderDryRun(await dryRunReport(io, String(input.command), input.phase, input.target))
    case 'memory':
      switch (input.action) {
        case 'record': return learnRecord(io, { type: input.type, summary: String(input.summary ?? ''), tags: input.tags ?? [], text: String(input.text ?? input.summary ?? '') })
        case 'recall': return withClaudeMemory(await learnRecall(io, settings, String(input.topic ?? '')))
        case 'list': return learnList(io)
        case 'prune': return prune(io, settings)
        case 'outcomes': {
          const r = await recallOutcomes(io, settings, input)
          return [...r.records.map(o => `${o.id} ${o.date} ${o.plan} ${o.agent} ${o.task_type}: ${o.outcome} (importance ${o.importance}) — ${o.summary}`), `(${r.records.length} of ${r.total})`, ...(r.note ? [r.note] : [])].join('\n')
        }
        case 'scores': return JSON.stringify(await agentScores(io, settings, input.task_types ?? []))
        case 'briefing': return withClaudeMemory((await briefing(io, settings)) ?? 'No outcome records yet.')
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
    case 'ship':
      switch (input.action) {
        case 'check': return shipCheck(io, input)
        case 'publish': return shipPublish(io, input)
        case 'canary': return canary(io, ctx, settings, input)
      }
      return 'ship: unknown action'
    case 'polish': {
      if (input.action === 'scope') {
        const sc = await polishScope(io, input)
        return sc.error ?? [`Files: ${sc.files.length} (${sc.base} base + ${sc.expanded} dependents, ${sc.excluded} excluded)`, ...sc.warnings, ...sc.files.map(f => `- ${f}`)].join('\n')
      }
      const r = await polishRun(io, ctx.agents(), input)
      return typeof r === 'string' ? r : r.text
    }
    case 'github':
      switch (input.action) {
        case 'mode': return `integrations.github: ${await ghMode(io)}`
        case 'set': return setGhMode(io, input.value)
        case 'issue': return ghPhaseIssue(io, Number(input.phase))
        case 'tick': return (await ghTickPlan(io, Number(input.phase), String(input.plan))) ?? 'No issue to update.'
        case 'close': return (await ghClosePhase(io, Number(input.phase), { plans: Number(input.plans ?? 0), requirements: String(input.requirements ?? ''), result: String(input.result ?? 'pass') })) ?? 'No issue recorded for that phase.'
        case 'status': return ghStatus(io)
      }
      return 'github: unknown action'
    case 'security':
      if (input.action === 'save') return securitySave(io, input)
      return securityScan(io, input)
    case 'roster':
      if (input.action === 'limit') { const l = await rosterLimit(io); return `${l.count} agents, limit ${l.limit}: ${l.status}${l.suggestions.length ? `\n${l.suggestions.map(s => `- ${s}`).join('\n')}` : ''}` }
      return gapAnalysis(io, input)
  }
  return `unknown tool ${name}`
}

const CANARY: [string, number][] = [['1 min', 60_000], ['5 min', 300_000], ['15 min', 900_000]]

// Deploy (adapter.deploy_command), then checks at 1, 5 and 15 minutes on the
// clock, never a blocking wait. Each result goes into the ship report; anything
// but a healthy check, and the final all-clear, comes back as a message.
async function canary(io: Io, ctx: Ctx, settings: any, input: any): Promise<string> {
  const deploy = settings?.adapter?.deploy_command
  if (!deploy) return 'Canary monitoring needs adapter.deploy_command in settings.json; nothing was deployed.'
  if (!ctx.schedule || !ctx.notify) return 'Canary scheduling is not available here.'
  const phase = Number(input.phase ?? (await loadProject(io)).state?.phase)
  const d = await io.run(['bash', '-c', String(deploy)], { timeoutMs: 600_000 })
  if (d.exitCode !== 0) return `Deploy failed (exit ${d.exitCode}): ${(d.stderr || d.stdout).trim().split('\n').slice(-10).join('\n')}`
  const hash = (await io.run(['git', 'rev-parse', '--short', 'HEAD'])).stdout.trim()
  let stopped = false
  const record = async (text: string) => {
    const log = '.planning/memory/OUTCOMES.md'
    if ((await io.list('.planning/memory')).length) await io.write(log, ((await io.read(log)) ?? '').replace(/\s*$/, '\n\n') + `## Phase ${phase} — Canary ${new Date(io.now()).toISOString().slice(0, 16)}\ntask_type: canary\nagent: ship-pipeline\nresult: ${/REGRESSION/.test(text) ? 'failed' : 'success'}\n`)
  }
  for (const [label, ms] of CANARY) {
    ctx.schedule(ms, () => {
      if (stopped) return
      void (async () => {
        const r = await canaryCheck(io, phase, input.commands ?? [])
        const text = renderCanary(label, r, hash) + (r.status === 'HEALTHY' && label === '15 min' ? '\n\n## Canary Monitoring — ALL CLEAR' : '')
        const p = await loadProject(io)
        const dir = p.phaseDirs.find(x => x.startsWith(String(phase).padStart(2, '0')))
        if (dir) { const f = `.planning/phases/${dir}/${String(phase).padStart(2, '0')}-SHIP-REPORT.md`; const t = await io.read(f); if (t !== undefined) await io.write(f, t.replace(/\s*$/, '\n\n') + text + '\n') }
        if (r.status !== 'HEALTHY') stopped = true
        if (r.status !== 'HEALTHY' || label === '15 min') { await record(text); ctx.notify!(`triad canary for Phase ${phase}:\n\n${text}\n\nAsk the user how to proceed (Rollback (Recommended) / Investigate first / Ignore) when it is not healthy; never run the revert yourself without their yes.`) }
      })().catch(() => undefined)
    })
  }
  return `Deployed (${String(deploy)}). Canary checks are scheduled at 1, 5 and 15 minutes after deploy; results are appended to the ship report and arrive here as a message. Rollback is never automatic.`
}
