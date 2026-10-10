// Two-wave execution (wave-executor WAVE-A/WAVE-B) on top of the wave
// executor. Wave A builds (build-role plans in their own wave order) and then
// analyzes read-only (analysis plans, or the architecture and security
// defaults); the architecture gate sits between the waves. Wave B runs the
// execution plans (tests, benchmarks) with the executor and the remediation
// plans read-only, then gives a production-readiness verdict.
import { loadPhase, loadProject, today, type Io } from './io.ts'
import type { Plan } from './planning.ts'
import { renderSummary } from './render.ts'
import type { PersonaRunResult } from './personarun.ts'
import { build, runVerification, type BuildReport } from './build.ts'
import { runPersonas } from './personarun.ts'
import { detectTestCommand } from './ship.ts'
import type { Agents } from './build.ts'

export type WaveRole = 'build' | 'analysis' | 'execution' | 'remediation'
export const WAVE_ROLES: WaveRole[] = ['build', 'analysis', 'execution', 'remediation']

const ANALYSIS_AGENT = /architect|security/
const ANALYSIS_TITLE = /\b(review|audit|analy[sz]e|analysis)\b/i

export function roleOf(p: Plan): WaveRole {
  const r = (p.fm as any).wave_role
  if (WAVE_ROLES.includes(r)) return r
  return 'build'
}

// Service group from files_modified (build.md's detection: src/frontend,
// src/backend, src/shared, and the usual client/server/api spellings).
export function serviceGroup(p: Plan): string {
  const groups = new Set(p.fm.files_modified.map(f => {
    if (/(^|\/)(frontend|client|web|ui)\//i.test(f)) return 'frontend'
    if (/(^|\/)(backend|server|api)\//i.test(f)) return 'backend'
    if (/(^|\/)(shared|common)\//i.test(f)) return 'shared'
    return 'default'
  }))
  groups.delete('shared')
  return groups.size === 1 ? [...groups][0]! : groups.size ? 'mixed' : 'shared'
}

// Without a wave_role, a plan counts as analysis only when it writes no code
// (no files, or only notes and reports): an architect or security agent, or a
// plan titled "review", that writes source files is a build plan
// (engineering-backend-architect is the usual build agent).
const writesCode = (p: Plan) => p.fm.files_modified.some(f => !/\.(md|txt)$/i.test(f))
const isAnalysis = (p: Plan) => roleOf(p) === 'analysis' || (!(p.fm as any).wave_role && !writesCode(p) && (ANALYSIS_AGENT.test(p.fm.agents[0] ?? '') || ANALYSIS_TITLE.test(p.title)))

export type Detection = { twoWave: boolean; reason: string; groups: string[]; analysis: string[] }

// Flags first (--single-wave, --two-wave), then CONTEXT.md two_wave, then the
// auto rule: at least 4 plans and (2+ service groups or an analysis plan).
export function detectTwoWave(plans: Plan[], context: string | undefined, flags: { twoWave?: boolean; singleWave?: boolean }): Detection {
  const groups = [...new Set(plans.filter(p => !isAnalysis(p)).map(serviceGroup).filter(g => g !== 'shared' && g !== 'mixed'))].sort()
  const analysis = plans.filter(isAnalysis).map(p => p.id)
  const ctx = context?.match(/^\s*two_wave:\s*(true|false)\b/m)?.[1]
  const d = (twoWave: boolean, reason: string): Detection => ({ twoWave, reason, groups, analysis })
  if (flags.singleWave) return d(false, '--single-wave')
  if (flags.twoWave) return d(true, '--two-wave')
  if (ctx) return d(ctx === 'true', `CONTEXT.md two_wave: ${ctx}`)
  if (plans.length < 4) return d(false, `${plans.length} plans (two-wave needs at least 4)`)
  // Wave A builds before it analyzes, so a build plan cannot wait on an analysis plan.
  const ids = new Set(analysis)
  const waits = plans.filter(p => !ids.has(p.id) && p.fm.depends_on.some(x => ids.has(x)))
  if (waits.length) return d(false, `${waits.map(p => p.id).join(', ')} depend${waits.length === 1 ? 's' : ''} on analysis plan(s), so the plans run in their own wave order`)
  if (groups.length >= 2) return d(true, `${plans.length} plans across service groups ${groups.join(', ')}`)
  if (analysis.length) return d(true, `${plans.length} plans with analysis plan(s) ${analysis.join(', ')}`)
  return d(false, 'one service group and no analysis plans')
}

export type TwoWaveOptions = { phase?: number; stage?: 'A' | 'B'; skipGates?: boolean; skipArchitecture?: boolean; skipSecurity?: boolean; log?: (s: string) => void }

const yamlList = (xs: string[]) => (xs.length ? `[${xs.join(', ')}]` : '[]')
const sevCount = (text: string) => ({
  blocker: (text.match(/\b(blocker|critical)\b/gi) ?? []).length,
  warning: (text.match(/\b(warning|major|high)\b/gi) ?? []).length,
})

async function phaseOf(io: Io, phase?: number) {
  const p = await loadProject(io)
  const n = phase ?? p.state?.phase
  if (!n) return { error: 'STATE.md names no phase; pass --phase N.' }
  const ph = await loadPhase(io, p, n)
  if (!ph.plans.length || !ph.rel) return { error: `No plans found for Phase ${n}. Run /triad:plan ${n} first.` }
  return { p, n, ph }
}

function readOnlyBrief(plan: Plan | undefined, role: string, phase: number, outputs: string[]): string {
  return [
    `# Two-wave ${role}: Phase ${phase}`,
    plan ? `## Plan ${plan.id}: ${plan.title}\n\n${plan.body.trim()}` : `## Task\nReview the Wave A build outputs for ${role === 'security' ? 'security (OWASP Top 10, authentication, input handling, secrets)' : 'architecture (boundaries, coupling, data flow, error handling)'}.`,
    `## Wave A outputs\n${outputs.map(f => `- ${f}`).join('\n') || '- (no files recorded)'}`,
    '## Return\nFindings, one per line: `- [SEVERITY] file:line — finding — recommendation`, with SEVERITY one of BLOCKER, WARNING, SUGGESTION. End with `Verdict: PASS`, `Verdict: NEEDS_WORK` or `Verdict: FAIL`.',
  ].join('\n\n')
}

// A read-only plan (analysis, remediation) still gets its SUMMARY.md, so the
// phase counts it as done and the executor can finalize the phase.
async function readOnlySummary(io: Io, rel: string, plan: Plan, r: PersonaRunResult): Promise<void> {
  const ok = !r.error && !!r.answer
  const lines = (r.answer ?? '').split('\n').filter(l => /^\s*-\s*\[/.test(l)).map(l => l.trim().replace(/^-\s*/, ''))
  await io.write(`${rel}/${plan.id}-SUMMARY.md`, renderSummary({
    planId: plan.id, title: plan.title, wave: plan.fm.wave, agent: r.agent, status: ok ? 'Complete' : 'Failed', date: today(io),
    tasks: [{ name: `${roleOf(plan)} (read-only)`, status: ok ? 'done' : 'failed' }], files: [], verification: [], decisions: [], issues: lines,
    escalations: [], handoff: { keyOutputs: [], decisions: [], openQuestions: [], conventions: [] }, requirements: plan.fm.requirements,
    error: ok ? undefined : r.error ?? 'The agent did not return an answer.',
  }))
}

export async function twoWaveBuild(io: Io, agents: Agents, opts: TwoWaveOptions = {}): Promise<{ ok: boolean; text: string; gate?: 'architecture' | 'production' }> {
  const log = opts.log ?? (() => {})
  const at = await phaseOf(io, opts.phase)
  if ('error' in at) return { ok: false, text: `Build stopped: ${at.error}` }
  const { n, ph } = at
  const rel = ph.rel!
  const plans = ph.plans
  const buildA = plans.filter(p => roleOf(p) === 'build' && !isAnalysis(p))
  const analysisA = plans.filter(p => isAnalysis(p) && !['execution', 'remediation'].includes(roleOf(p)))
  const execB = plans.filter(p => roleOf(p) === 'execution')
  const remB = plans.filter(p => roleOf(p) === 'remediation')
  const manifestA = `${rel}/WAVE-A-MANIFEST.yaml`
  const manifestB = `${rel}/WAVE-B-MANIFEST.yaml`
  const stamp = io.now().toISOString().replace(/\.\d+Z$/, 'Z')

  if ((opts.stage ?? 'A') === 'A') {
    log(`two-wave: Wave A build (${buildA.map(p => p.id).join(', ')})`)
    const b: BuildReport = buildA.length ? await build(io, agents, { phase: n, only: buildA.map(p => p.id), log }) : { ok: true, warnings: [], plans: [], text: 'No build plans.' }
    const outputs = [...new Set(b.plans.flatMap(o => o.files))].sort()
    const failed = b.plans.filter(o => !/^complete/i.test(o.status))
    const groups = new Map<string, Plan[]>()
    for (const p of buildA) groups.set(serviceGroup(p), [...(groups.get(serviceGroup(p)) ?? []), p])
    const groupYaml = [...groups].map(([g, ps]) => {
      const os = b.plans.filter(o => ps.some(p => p.id === o.id))
      const st = os.length && os.every(o => /^complete/i.test(o.status)) ? 'complete' : os.some(o => /^complete/i.test(o.status)) ? 'partial' : 'failed'
      return `  ${g}:\n    status: ${st}\n    plans: ${yamlList(ps.map(p => p.id))}\n    files: ${yamlList([...new Set(os.flatMap(o => o.files))])}`
    })
    if (!b.ok || failed.length) {
      await io.write(manifestA, [`wave: A`, `phase: ${n}`, `status: failed`, `timestamp: "${stamp}"`, 'service_groups:', ...groupYaml, ''].join('\n'))
      return { ok: false, text: `${b.text}\n\nWave A: build failed (${failed.map(o => o.id).join(', ') || b.error || b.warnings.filter(w => /not run/.test(w)).join('; ') || 'no plan finished'}). Fix before proceeding; Wave B was not started.` }
    }
    // Analysis: plans with the role, else the architecture and security defaults.
    const runs = analysisA.length
      ? analysisA.map(p => ({ agent: p.fm.agents[0] ?? 'engineering-backend-architect', brief: readOnlyBrief(p, 'analysis', n, outputs), label: `analysis ${p.id}` }))
      : [
          ...(opts.skipArchitecture ? [] : [{ agent: 'engineering-backend-architect', brief: readOnlyBrief(undefined, 'architecture', n, outputs), label: 'architecture analysis' }]),
          ...(opts.skipSecurity ? [] : [{ agent: 'engineering-security-engineer', brief: readOnlyBrief(undefined, 'security', n, outputs), label: 'security analysis' }]),
        ]
    log(`two-wave: Wave A analysis (${runs.map(r => r.label).join(', ') || 'none'})`)
    const found = runs.length ? await runPersonas(io, agents, { runs, read_only: true }, log) : []
    for (const [i, p] of analysisA.entries()) await readOnlySummary(io, rel, p, found[i]!)
    const partial = found.some(f => f.error || !f.answer)
    const findings = found.map(f => ({ label: f.label, agent: f.agent, ...sevCount(f.answer ?? ''), text: (f.answer ?? f.error ?? '').trim() }))
    await io.write(manifestA, [
      'wave: A', `phase: ${n}`, 'status: complete', `timestamp: "${stamp}"`, 'service_groups:', ...groupYaml,
      'analysis_findings:', `  count: ${findings.reduce((t, f) => t + f.blocker + f.warning, 0)}`, ...(partial ? ['  analysis_partial: true'] : []),
      '  by_agent:', ...findings.map(f => `    ${f.agent}: {blockers: ${f.blocker}, warnings: ${f.warning}}`),
      'outputs:', `  total_files: ${outputs.length}`, `  total_plans: ${buildA.length}`, `  passed: ${buildA.length - failed.length}`, `  failed: ${failed.length}`,
      'gate: architecture', `gate_status: ${opts.skipGates ? 'skipped' : 'pending'}`, '',
    ].join('\n'))
    const report = [
      `Wave A complete — Phase ${n}`, '', 'Build:', ...[...groups].map(([g, ps]) => `- ${g}: ${ps.length} plan(s) complete`),
      '', 'Analysis findings:', ...(findings.length ? findings.map(f => `### ${f.label} (${f.agent}): ${f.blocker} blocker(s), ${f.warning} warning(s)\n${f.text}`) : ['- none (no analysis run)']),
      ...(partial ? ['', 'Note: an analysis agent failed; analysis is advisory and does not block Wave B.'] : []),
    ].join('\n')
    if (!opts.skipGates) return { ok: true, gate: 'architecture', text: `${report}\n\nArchitecture gate: ask the user to proceed to Wave B (build_phase with stage B), revise Wave A outputs, or abort the phase.` }
    log('two-wave: --skip-gates, continuing to Wave B')
    const bRes = await twoWaveBuild(io, agents, { ...opts, phase: n, stage: 'B' })
    return { ...bRes, text: `${report}\n\n${bRes.text}` }
  }

  // Wave B
  const mA = await io.read(manifestA)
  if (!mA || !/^status: complete$/m.test(mA)) return { ok: false, text: 'Wave A incomplete or manifest missing. Run Wave A first (build_phase without stage).' }
  await io.write(manifestA, mA.replace(/^gate_status: pending$/m, 'gate_status: passed'))
  log(`two-wave: Wave B execution (${execB.map(p => p.id).join(', ') || 'test suite'}) and remediation (${remB.map(p => p.id).join(', ') || 'none'})`)
  const outputs = [...new Set((mA.match(/files: \[(.*)\]/g) ?? []).flatMap(l => l.slice(8, -1).split(', ').filter(Boolean)))]
  const [exec, rem] = await Promise.all([
    execB.length ? build(io, agents, { phase: n, only: execB.map(p => p.id), log }) : (async () => {
      // No execution plans: the execution stream is the project's own tests.
      const p = await loadProject(io)
      const cmd = await detectTestCommand(io, p.settings)
      if (!cmd) return { ok: true, warnings: [], plans: [], text: 'No execution plans and no test command found; execution stream skipped.' } as BuildReport
      const r = (await runVerification(io, [cmd], undefined, `two-wave phase ${n} test suite`))[0]!
      return { ok: r.passed, warnings: [], plans: [], text: `Tests (${cmd}): ${r.passed ? 'passed' : `FAILED (exit ${r.exitCode})\n${(r.output ?? '').slice(-1500)}`}` } as BuildReport
    })(),
    remB.length ? runPersonas(io, agents, { runs: remB.map(p => ({ agent: p.fm.agents[0] ?? 'engineering-infrastructure-devops', brief: readOnlyBrief(p, 'remediation', n, outputs), label: `remediation ${p.id}` })), read_only: true }, log) : Promise.resolve([]),
  ])
  for (const [i, p] of remB.entries()) await readOnlySummary(io, rel, p, rem[i]!)
  const execFailed = !exec.ok || exec.plans.some(o => !/^complete/i.test(o.status))
  const remCounts = rem.map(r => ({ label: r.label, ...sevCount(r.answer ?? ''), text: (r.answer ?? r.error ?? '').trim() }))
  const blockers = remCounts.reduce((t, r) => t + r.blocker, 0)
  const warnings = remCounts.reduce((t, r) => t + r.warning, 0)
  const verdict = execFailed ? 'FAIL' : blockers || warnings ? 'NEEDS_WORK' : 'PASS'
  await io.write(manifestB, [
    'wave: B', `phase: ${n}`, `status: ${execFailed ? 'failed' : 'complete'}`, `timestamp: "${stamp}"`,
    'execution:', `  plans: ${yamlList(execB.map(p => p.id))}`, `  status: ${execFailed ? 'failed' : 'passed'}`,
    'remediation:', `  plans: ${yamlList(remB.map(p => p.id))}`, `  blockers: ${blockers}`, `  warnings: ${warnings}`,
    `verdict: ${verdict}`, 'gate: production', '',
  ].join('\n'))
  // Every plan done: the executor finalizes the phase (STATE, ROADMAP, commit).
  const done = /executed, pending review/.test((await loadProject(io)).state?.phaseNote ?? '')
  const fin = verdict !== 'FAIL' && !done ? await build(io, agents, { phase: n, only: [], log }) : undefined
  const text = [
    `Wave B complete — Phase ${n} (${today(io)})`, '', `Execution: ${execFailed ? 'FAILED' : 'passed'}`, exec.text,
    ...(remCounts.length ? ['', 'Remediation:', ...remCounts.map(r => `### ${r.label}: ${r.blocker} blocker(s), ${r.warning} warning(s)\n${r.text}`)] : []),
    '', `Production readiness verdict: ${verdict}`,
    verdict === 'PASS' ? `Next: /triad:review ${n}.` : verdict === 'FAIL' ? 'FAIL blocks phase completion: fix the failing execution plans and run build_phase with stage B again.' : 'NEEDS_WORK: ask the user to fix and re-run Wave B, or accept the risks and continue to /triad:review.',
    ...(fin && !/all plans executed/.test(fin.text) ? ['', `Phase not finalized: ${fin.text.split('\n')[0]}`] : []),
    `Manifests: ${manifestA}, ${manifestB}`,
  ].join('\n')
  return { ok: verdict !== 'FAIL', gate: 'production', text }
}
