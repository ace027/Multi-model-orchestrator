import { describe, expect, test } from 'claude-code/testing'
import { fakeAgents, memIo } from './testkit.ts'
import { planWrite, projectInit } from './hooks/legion/handlers.ts'
import { loadPhase, loadProject } from './hooks/legion/io.ts'
import { INTENT_TEAMS } from './hooks/legion/configdata.ts'
import { filterPlans, globMatch, parseIntentFlags, parseNaturalLanguage, validateFlagCombination, type IntentConfig } from './hooks/legion/intents.ts'
import { dryRunReport } from './hooks/legion/dryrun.ts'
import { detectTwoWave, twoWaveBuild } from './hooks/legion/twowave.ts'
import { buildRun } from './hooks/legion/buildrun.ts'
import type { PlanInput } from './hooks/legion/render.ts'

const config = INTENT_TEAMS as IntentConfig
const check = (flags: string, command = 'build') => validateFlagCombination(parseIntentFlags(flags, command), command, config)

const plan = (p: number, wave: number, file: string, over: Partial<PlanInput> = {}): PlanInput => ({
  plan: p, title: `Plan ${p}`, wave, agents: ['engineering-backend-architect'], depends_on: [], files_modified: [file],
  files_forbidden: ['secrets/'], verification_commands: [`test -f ${file}`],
  expected_artifacts: [{ path: file, provides: 'code', required: true }], truths: ['it works'],
  objective: `Write ${file}.`, tasks: [{ name: 'write', files: [file], action: `Create ${file} exporting run().`, verification: [`test -f ${file}`], done: `${file} exists` }],
  success_criteria: [`${file} exists`], ...over,
} as PlanInput)

async function project() {
  const io = memIo()
  await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Core', plans: 4 }] } as any)
  return io
}

describe('intent router', () => {
  test('flags: mutual exclusion, command context, typos and the escape hatch', () => {
    expect(check('--just-harden').valid).toBe(true)
    const both = check('--just-harden --just-document')
    expect(both.errors).toEqual(['Cannot use --just-harden and --just-document together. Choose one intent.'])
    expect(both.suggestions).toEqual(['Use only --just-harden for this operation'])
    expect(check('--skip-frontend --skip-backend').errors).toEqual(['Cannot skip both frontend and backend — nothing to build.'])
    const wrong = check('--just-harden', 'review')
    expect(wrong.errors).toEqual(['--just-harden is only valid for /triad:build (used with review)'])
    expect(wrong.suggestions).toEqual(['Use /triad:build instead'])
    expect(check('--just-security', 'review').valid).toBe(true)
    expect(check('--just-hardne').errors).toEqual(['Unknown flag: --just-hardne. Did you mean --just-harden?'])
    expect(check('--frobnicate').errors[0]).toContain('Valid flags for /triad:build')
    const unsafe = check('--frobnicate --unsafe-unknown-flags')
    expect(unsafe.valid).toBe(true)
    expect(unsafe.info).toEqual(['Ignoring unknown flag --frobnicate (--unsafe-unknown-flags)'])
    const f = parseIntentFlags('3 --phase=2 --two-wave --JUST-DOCUMENT', 'build')
    expect([f.positional, f.other, f.intents, f.primaryIntent]).toEqual([['3'], { '--phase': '2', '--two-wave': true }, ['document'], 'document'])
  })

  test('plan filters drop whole plans only, by agent, files or title', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'g' }, plans: [
      plan(1, 1, 'src/frontend/App.tsx', { agents: ['engineering-frontend-developer'] }),
      plan(2, 1, 'src/api/users.ts'),
      plan(3, 1, 'src/mixed/a.ts', { files_modified: ['src/mixed/a.ts', 'src/mixed/b.css'], agents: ['engineering-senior-developer'] }),
      plan(4, 1, 'docs/guide.md', { title: 'Write the API docs', agents: ['product-technical-writer'] }),
    ] })
    const p = await loadProject(io)
    const ph = await loadPhase(io, p, 1)
    const front = filterPlans(ph.plans, parseIntentFlags('--skip-frontend', 'build'), config)
    expect(front.keep).toEqual(['01-02', '01-03', '01-04'])
    expect(front.drop[0]!.reason).toContain('engineering-frontend-developer')
    expect(front.warnings[0]).toContain('01-03 kept')
    expect(filterPlans(ph.plans, parseIntentFlags('--just-document', 'build'), config).keep).toEqual(['01-04'])
    expect(filterPlans(ph.plans, parseIntentFlags('--skip-backend', 'build'), config).keep).toEqual(['01-01', '01-03', '01-04'])
    expect([globMatch('src/a.tsx', '*.tsx'), globMatch('src/frontend/x/y.ts', 'src/frontend/**'), globMatch('lib/a.ts', 'src/**')]).toEqual([true, true, false])
  })

  test('natural language routing tiers', () => {
    const r = (t: string) => { const x = parseNaturalLanguage(t, config); return `${x.tier} ${x.command ?? '-'} ${x.flags.join(' ')}`.trim() }
    expect(r('start')).toBe('HIGH /triad:start')
    expect(r('start a new project')).toBe('HIGH /triad:start')
    expect(r('build')).toBe('HIGH /triad:build')
    expect(r('run the build')).toBe('HIGH /triad:build')
    expect(r('harden the auth code')).toBe('HIGH /triad:build --just-harden')
    expect(r('review the code for security')).toBe('HIGH /triad:review --just-security')
    expect(r("what's the status")).toBe('HIGH /triad:status')
    expect(r('fix the tests')).toBe('HIGH /triad:review')
    expect(r('do the thing')).toBe('NONE -')
    expect(r('')).toBe('NONE -')
  })
})

// Legion's tests/fixtures/dry-run projects.
const FIX = {
  project: '# Demo Project\n',
  roadmap: '# Demo Roadmap\n\n### Phase 1: Foundation\nGoal: Establish baseline.\n',
  state: '# State\n\nPhase: 1 of 1\nStatus: planned\n\n## GitHub\n- enabled in fixture\n',
}
const fixture = (name: 'ok' | 'missing-roadmap' | 'missing-plans' | 'missing-project' | 'missing-summaries') => {
  const f: Record<string, string> = {}
  if (name !== 'missing-project') f['.planning/PROJECT.md'] = FIX.project
  if (name !== 'missing-roadmap') f['.planning/ROADMAP.md'] = FIX.roadmap
  f['.planning/STATE.md'] = FIX.state
  if (name === 'ok' || name === 'missing-summaries') f['.planning/phases/01-foundation/01-01-PLAN.md'] = '---\nphase: 01-foundation\nplan: 01-01\nwave: 1\n---\n'
  if (name === 'ok') {
    f['.planning/phases/01-foundation/01-01-SUMMARY.md'] = '# Summary\n'
    f['.planning/memory/OUTCOMES.md'] = '# Outcomes\n'
  }
  return memIo(f)
}

describe('dry run', () => {
  test("Legion's fixture suite: success and failure prerequisites, deterministic, no writes", async () => {
    const cases: [string, Parameters<typeof fixture>[0], boolean][] = [
      ['plan', 'ok', true], ['plan', 'missing-roadmap', false], ['build', 'ok', true], ['build', 'missing-plans', false],
      ['review', 'ok', true], ['review', 'missing-summaries', false], ['status', 'ok', true], ['status', 'missing-project', false],
    ]
    for (const [command, name, ok] of cases) {
      const io = fixture(name)
      const before = JSON.stringify([...io.files])
      const a = await dryRunReport(io, command, 1)
      const b = await dryRunReport(io, command, 1)
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      expect(JSON.stringify([...io.files])).toBe(before)
      expect(`${command} ${name} ${a.success} ${a.exitCode}`).toBe(`${command} ${name} ${ok} ${ok ? 0 : 2}`)
    }
    const ok = await dryRunReport(fixture('ok'), 'plan', 1)
    expect(ok.features).toEqual(['github sync', 'memory'])
    expect((await dryRunReport(fixture('ok'), 'deploy')).exitCode).toBe(1)
    expect((await dryRunReport(fixture('ok'), 'ship', 1)).checks.find(c => c.label === 'Review passed')!.ok).toBe(false)
  })
})

describe('two-wave', () => {
  async function twoWaveProject() {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'g' }, plans: [
      plan(1, 1, 'src/frontend/app.ts', { wave_role: 'build' }),
      plan(2, 1, 'src/backend/api.ts', { wave_role: 'build' }),
      plan(3, 2, 'docs/analysis.md', { wave_role: 'analysis', title: 'Analyze the architecture', agents: ['engineering-security-engineer'], depends_on: ['01-01', '01-02'] }),
      plan(4, 2, 'tests/api.test.ts', { wave_role: 'execution', title: 'Run API tests', agents: ['testing-api-tester'], depends_on: ['01-02'] }),
    ] })
    return io
  }

  test('detection: flags, CONTEXT.md, then 4+ plans across service groups', async () => {
    const io = await twoWaveProject()
    const ph = await loadPhase(io, await loadProject(io), 1)
    expect(ph.plans.every(p => !p.schemaErrors.length)).toBe(true)
    const d = detectTwoWave(ph.plans, undefined, {})
    expect([d.twoWave, d.groups, d.analysis]).toEqual([true, ['backend', 'default', 'frontend'], ['01-03']])
    expect(detectTwoWave(ph.plans, undefined, { singleWave: true }).twoWave).toBe(false)
    expect(detectTwoWave(ph.plans, '---\ntwo_wave: false\n---', {}).reason).toBe('CONTEXT.md two_wave: false')
    expect(detectTwoWave(ph.plans.slice(0, 3), undefined, {}).twoWave).toBe(false)
  })

  test('Wave A stops at the architecture gate; Wave B gives the verdict and finalizes the phase', async () => {
    const io = await twoWaveProject()
    const agents = fakeAgents(io)
    const a = await twoWaveBuild(io, agents, { phase: 1 })
    expect(a.gate).toBe('architecture')
    const mA = io.files.get('.planning/phases/01-core/WAVE-A-MANIFEST.yaml')!
    expect(mA).toContain('status: complete')
    expect(mA).toContain('gate_status: pending')
    expect(io.files.has('.planning/phases/01-core/01-03-SUMMARY.md')).toBe(true)
    expect(io.files.has('.planning/phases/01-core/01-04-SUMMARY.md')).toBe(false)
    const b = await twoWaveBuild(io, agents, { phase: 1, stage: 'B' })
    expect(b.text).toContain('Production readiness verdict: PASS')
    expect(io.files.get('.planning/phases/01-core/WAVE-B-MANIFEST.yaml')).toContain('verdict: PASS')
    expect((await loadProject(io)).state!.phaseNote).toContain('executed, pending review')
  })

  test('Wave B refuses without a complete Wave A; build flags are validated in code', async () => {
    const io = await twoWaveProject()
    expect((await twoWaveBuild(io, fakeAgents(io), { phase: 1, stage: 'B' })).text).toContain('Wave A incomplete or manifest missing')
    expect(await buildRun(io, fakeAgents(io), { flags: '--just-harden --just-document' }, () => {})).toContain('❌ Intent Validation Failed')
    const dry = await buildRun(io, fakeAgents(io), { flags: '--dry-run --skip-frontend' }, () => {})
    expect(dry).toContain('Execution mode: two-wave')
    expect(dry).toContain('Intent filter: run 01-02, 01-03, 01-04; skip 01-01')
    expect(io.files.has('.planning/phases/01-core/01-01-SUMMARY.md')).toBe(false)
  })
})
