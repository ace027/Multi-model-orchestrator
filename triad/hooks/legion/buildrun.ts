// build_phase with its flags: intent validation and plan filters, the harden
// team, two-wave detection, and --dry-run. All decided in code.
import { loadPhase, loadProject, type Io } from './io.ts'
import { build, type Agents } from './build.ts'
import { filterPlans, loadIntentConfig, parseIntentFlags, renderValidation, resolveTeam, validateFlagCombination } from './intents.ts'
import { detectTwoWave, twoWaveBuild } from './twowave.ts'
import { dryRunReport, renderDryRun } from './dryrun.ts'

export type BuildRunInput = { phase?: number; wave?: number; rerun?: boolean; flags?: string; stage?: 'A' | 'B' }

export async function buildRun(io: Io, agents: Agents, input: BuildRunInput, log: (s: string) => void): Promise<string> {
  const { config, warnings } = await loadIntentConfig(io)
  const f = parseIntentFlags(input.flags ?? '', 'build')
  const v = validateFlagCombination(f, 'build', config)
  if (!v.valid) return renderValidation(v)
  const num = (x: string | true | undefined) => (typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : undefined)
  const phase = input.phase ?? num(f.other['--phase']) ?? num(f.positional.find(x => /^\d+$/.test(x)))
  const wave = input.wave ?? num(f.other['--wave'])
  const notes = [...warnings, ...v.info]
  const head = (s: string) => [...notes.map(x => `Note: ${x}`), s].join('\n')
  if (f.other['--dry-run']) {
    const r = await dryRunReport(io, 'build', phase)
    const p = await loadProject(io)
    const n = phase ?? p.state?.phase
    let extra = ''
    if (r.success && n) {
      const ph = await loadPhase(io, p, n)
      const ctx = ph.rel ? await io.read(`${ph.rel}/CONTEXT.md`) : undefined
      const d = detectTwoWave(ph.plans, ctx, { twoWave: !!f.other['--two-wave'], singleWave: !!f.other['--single-wave'] })
      const fl = f.intents.length ? filterPlans(ph.plans, f, config) : undefined
      extra = `\nExecution mode: ${d.twoWave ? 'two-wave' : 'single-wave'} (${d.reason})${fl ? `\nIntent filter: run ${fl.keep.join(', ') || 'nothing'}; skip ${fl.drop.map(x => `${x.id} (${x.reason})`).join(', ') || 'nothing'}` : ''}`
    }
    return head(renderDryRun(r) + extra)
  }
  const p = await loadProject(io)
  const n = phase ?? p.state?.phase
  const ph = n ? await loadPhase(io, p, n) : undefined

  // --just-harden: an ad-hoc team, run by the command through persona_run.
  if (f.primaryIntent === 'harden') {
    const t = resolveTeam(config, 'harden')!
    const files = [...new Set(ph?.plans.flatMap(x => x.fm.files_modified) ?? [])]
    return head([
      `Intent --just-harden (ad_hoc): ${t.description}. No plans are executed.`,
      `Team: primary ${t.agents.primary.join(', ')}; secondary ${t.agents.secondary.join(', ')}. Domains: ${t.domains.join(', ')}.`,
      `Phase ${n ?? '?'} files: ${files.join(', ') || '(none recorded; harden the whole project)'}`,
      'Next: call persona_run once with one run per team member (read_only false, writable = those files), each briefed on its domains: find and fix security weaknesses in those files, then report findings (severity, file:line, fix) and the changes made. Then run the project tests and report.',
    ].join('\n'))
  }
  if (!ph?.plans.length) return head((await build(io, agents, { phase, wave, rerun: !!input.rerun, log })).text)

  // filter_plans intents (--just-document, --skip-frontend, --skip-backend).
  let only: string[] | undefined
  let filterText = ''
  if (f.intents.some(i => resolveTeam(config, i)?.mode === 'filter_plans')) {
    const fl = filterPlans(ph.plans, f, config)
    filterText = [`Intent filter ${f.rawFlags.join(' ')}: running ${fl.keep.join(', ') || 'no plans'}.`, ...fl.drop.map(d => `- skipped ${d.id}: ${d.reason}`), ...fl.warnings.map(w => `- ${w}`)].join('\n')
    if (!fl.keep.length) return head(`${filterText}\nNo plans remain after the filter; nothing to build.`)
    only = fl.keep
  }
  const ctx = ph.rel ? await io.read(`${ph.rel}/CONTEXT.md`) : undefined
  const d = detectTwoWave(ph.plans, ctx, { twoWave: !!f.other['--two-wave'], singleWave: !!f.other['--single-wave'] })
  if ((d.twoWave || input.stage) && !only && wave === undefined) {
    log(`two-wave mode: ${d.reason}`)
    const r = await twoWaveBuild(io, agents, { phase: n, stage: input.stage, skipGates: !!f.other['--skip-gates'], skipArchitecture: !!f.other['--skip-architecture'], skipSecurity: !!f.other['--skip-security'], log })
    return head(`Two-wave mode (${d.reason}).\n\n${r.text}`)
  }
  const r = await build(io, agents, { phase: n, wave, rerun: !!input.rerun, only, log })
  return head([filterText, d.twoWave && only ? 'Two-wave mode is off while an intent filter is active.' : '', r.text].filter(Boolean).join('\n\n'))
}
