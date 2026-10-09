import { describe, expect, test } from 'claude-code/testing'
import type { Io, RunResult } from './hooks/legion/io.ts'
import type { Agents } from './hooks/legion/build.ts'
import { build, gitignoreLines } from './hooks/legion/build.ts'
import { calibrate, estimate, phaseShape, predicted, type StepRecord } from './hooks/legion/estimate.ts'
import { review } from './hooks/legion/reviewrun.ts'
import { planCheck, planWrite, processLine, projectInit, statusText, validateText } from './hooks/legion/handlers.ts'
import { getField, parsePlan, parseRoadmap, parseState, planWaves, progressBar, setField, setRoadmapRow, summaryStatus, updateState } from './hooks/legion/planning.ts'
import { critique } from './hooks/legion/critique.ts'
import { dedup, parseReport, triage } from './hooks/legion/review.ts'
import { checkWrite, loadSettings } from './hooks/legion/settings.ts'
import { ROSTER, composePanel } from './hooks/legion/registry.ts'
import { parseYaml } from './hooks/legion/yaml.ts'
import type { PlanInput } from './hooks/legion/render.ts'
import { fakeAgents, memIo, REPLY } from './testkit.ts'

const plan = (p: number, wave: number, file: string, extra: Partial<PlanInput> = {}): PlanInput => ({
  plan: p, title: `Plan ${p}`, wave, agents: ['engineering-backend-architect'], depends_on: [], files_modified: [file],
  files_forbidden: ['secrets/'], verification_commands: [`test -f ${file}`],
  expected_artifacts: [{ path: file, provides: 'code', required: true }], truths: ['it works'],
  objective: `Write ${file}.`, tasks: [{ name: 'write', files: [file], action: `Create ${file} exporting run().`, verification: [`test -f ${file}`], done: `${file} exists` }],
  success_criteria: [`${file} exists`], ...extra,
})

async function newProject() {
  const io = memIo()
  await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build the core API', plans: 2 }, { name: 'Polish', goal: 'Docs' }] } as any)
  return io
}

describe('planning files', () => {
  test('reads and edits both STATE field forms in place', () => {
    const bold = '# State\n\n- **Phase**: 2 of 5 (planned)\n- **Status**: Phase 2 planned\n'
    const plain = 'Phase: 3 of 4 (executing)\nStatus: busy\n'
    expect(parseState(bold)).toMatchObject({ phase: 2, total: 5, phaseNote: 'planned' })
    expect(parseState(plain)).toMatchObject({ phase: 3, total: 4 })
    expect(setField(bold, 'Status', 'done')).toBe('# State\n\n- **Phase**: 2 of 5 (planned)\n- **Status**: done\n')
    expect(getField(setField(plain, 'Status', 'x'), 'Status')).toBe('x')
    expect(updateState(bold, { progress: progressBar(1, 4) })).toContain('25%')
  })
  test('parses a roadmap table with a Reviewed column and "N — Name" cells, and edits a row', () => {
    const r = '| Phase | Plans | Completed | Status | Reviewed |\n|---|---|---|---|---|\n| 1 — Core | 2 | 0 | Planned | - |\n\n## Phases\n- [ ] Phase 1: Core\n'
    const rm = parseRoadmap(r)
    expect(rm.rows[0]).toMatchObject({ phase: 1, plans: 2, completed: 0, status: 'Planned' })
    const edited = setRoadmapRow(r, 1, { completed: 2, status: 'Executed' })
    expect(parseRoadmap(edited).rows[0]).toMatchObject({ completed: 2, status: 'Executed' })
    expect(edited).toContain('| - |')
  })
  test('normalizes a legacy integer plan number and accepts every summary status form', () => {
    const p = parsePlan('03-02-PLAN.md', '---\nphase: 03-api\nplan: 2\ntype: execute\nwave: 1\ndepends_on: []\nfiles_modified: [a.ts]\nautonomous: true\nagent: engineering-backend-architect\n---\nbody', 3)
    expect(p.fm.plan).toBe('03-02')
    expect(p.fm.agents).toEqual(['engineering-backend-architect'])
    expect(summaryStatus('**Status:** Complete')).toBe('Complete')
    expect(summaryStatus('## Status: Failed')).toBe('Failed')
    expect(summaryStatus('Status: Complete with Warnings')).toBe('Complete with Warnings')
  })
  test('YAML subset: flow lists, block scalars, quoted keys', () => {
    expect(parseYaml('a: [x, "y z"]\nb: |\n  line1\n  line2\nc:\n  - d: 1\n')).toEqual({ a: ['x', 'y z'], b: 'line1\nline2\n', c: [{ d: 1 }] })
  })
})

describe('plans and critique', () => {
  test('plan_write writes schema-valid plans and a PASS critique, and updates STATE and ROADMAP', async () => {
    const io = await newProject()
    const out = await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 2, 'src/b.ts', { depends_on: ['01-01'] })] })
    expect(out).toContain('PASS')
    const text = io.files.get('.planning/phases/01-core/01-01-PLAN.md')!
    const p = parsePlan('01-01-PLAN.md', text, 1)
    expect(p.schemaErrors).toEqual([])
    expect(p.fm.plan).toBe('01-01')
    expect(parseState(io.files.get('.planning/STATE.md')!).phaseNote).toBe('planned')
    expect(parseRoadmap(io.files.get('.planning/ROADMAP.md')!).rows[0]).toMatchObject({ plans: 2, status: 'Planned' })
    expect(await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })).toContain('already has plans')
  })
  test('plan_write with only rewrites those plans and keeps CONTEXT.md', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core', decisions: ['keep me'] }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 2, 'src/b.ts', { depends_on: ['01-01'] })] })
    const ctx = io.files.get('.planning/phases/01-core/01-CONTEXT.md')!
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(2, 2, 'src/b.ts', { title: 'Better', depends_on: ['01-01'] })], only: [2] })
    expect(io.files.get('.planning/phases/01-core/01-CONTEXT.md')).toBe(ctx)
    expect(io.files.get('.planning/phases/01-core/01-02-PLAN.md')).toContain('Better')
    expect(io.files.has('.planning/phases/01-core/01-01-PLAN.md')).toBe(true)
  })
  test('a Python CLI phase gets no designer on its panel', () => {
    const panel = composePanel('restock orders from a JSON file, CLI subcommand invlib/cli.py tests/test_cli.py targets.json', ['Engineering', 'Testing'])
    expect(panel.every(p => p.division === 'Engineering' || p.division === 'Testing')).toBe(true)
  })
  test('critique blocks same-wave file overlap and a missing verification command', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/a.ts', { verification_commands: [] })] })
    const out = await planCheck(io, 1)
    expect(out).toContain('REWORK')
    const plans = [...io.files].filter(([k]) => k.endsWith('-PLAN.md')).map(([k, v]) => parsePlan(k.split('/').pop()!, v, 1))
    const c = critique(plans, 3, ROSTER)
    expect(c.issues.some(i => i.severity === 'BLOCKER' && i.rule === 'overlap')).toBe(true)
    expect(c.issues.some(i => i.rule === 'R1')).toBe(true)
  })
  test('waves order by dependency and reject an unknown agent', () => {
    const io = memIo()
    void io
    const a = parsePlan('01-01-PLAN.md', '---\nphase: 01-x\nplan: "01-01"\ntype: execute\nwave: 1\ndepends_on: []\nfiles_modified: [a]\nautonomous: true\nagents: [nobody-here]\n---\n', 1)
    expect(planWaves([a], ROSTER).errors.join()).toContain('nobody-here')
  })
})

describe('authority', () => {
  const scope = (mode: any) => ({ planId: '01-01', mode, files_modified: ['src/a.ts', 'src/lib/'], files_forbidden: ['secrets/'] })
  test('control modes: surgical denies, guarded and autonomous warn, advisory (read-only) denies', () => {
    expect(checkWrite('src/a.ts', scope('surgical')).action).toBe('allow')
    expect(checkWrite('src/lib/x.ts', scope('surgical')).action).toBe('allow')
    expect(checkWrite('src/b.ts', scope('surgical')).action).toBe('deny')
    expect(checkWrite('secrets/k', scope('guarded')).action).toBe('warn')
    expect(checkWrite('src/b.ts', scope('autonomous')).action).toBe('warn')
    expect(checkWrite('src/b.ts', scope('advisory')).action).toBe('deny')
    expect(checkWrite('.triad/out/x', scope('surgical')).action).toBe('allow')
  })
  test('settings: new projects get the triad prefix, Legion projects keep theirs, bad modes fall back', () => {
    expect(loadSettings(undefined).settings.execution.commit_prefix).toBe('triad')
    expect(loadSettings(JSON.stringify({ execution: { commit_prefix: 'legion' } })).settings.execution.commit_prefix).toBe('legion')
    expect(loadSettings(JSON.stringify({ control_mode: 'yolo' })).settings.control_mode).toBe('guarded')
  })
})

describe('review triage', () => {
  const report = (agent: string, sev: string, conf: number, lines = '10-12') => `### Finding 1\n- **Severity**: ${sev}\n- **File**: src/a.ts\n- **Lines**: ${lines}\n- **Issue**: bad\n- **Confidence**: ${conf}%\n\n**Verdict**: NEEDS WORK`
  test('parses findings, dedups overlapping lines keeping the highest severity, buckets by confidence', () => {
    const a = parseReport('r1', report('r1', 'major', 90), 1)
    const b = parseReport('r2', report('r2', 'critical', 85, '11-13'), 1)
    expect(dedup([...a.findings, ...b.findings]).length).toBe(1)
    const t = triage([a, b])
    expect(t.mustFix.length).toBe(1)
    expect(t.mustFix[0]!.severity).toBe('critical')
    expect(triage([parseReport('r', report('r', 'major', 60), 1)]).deferred.length).toBe(1)
    expect(triage([parseReport('r', report('r', 'major', 40), 1)]).dropped).toBe(1)
  })
  test('a panel always includes a Testing reviewer and scales with divisions', () => {
    const one = composePanel('REST API with a database', 1)
    const three = composePanel('REST API, React UI and deploy pipeline', 3)
    expect(one.length).toBe(2)
    expect(three.length).toBe(4)
    expect(three.some(p => /testing/i.test(p.division))).toBe(true)
  })
})

describe('build and review', () => {
  test('builds a phase wave by wave with a SUMMARY and a commit per plan, then resumes as a no-op', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts'), plan(3, 2, 'src/c.ts', { depends_on: ['01-01'] })] })
    const agents = fakeAgents(io)
    const r = await build(io, agents)
    expect(r.ok).toBe(true)
    expect(io.files.has('.planning/phases/01-core/01-03-SUMMARY.md')).toBe(true)
    expect(io.commits[0]).toBe('docs(triad): plan phase 1 — Core\n\n3 plans across 2 waves.')
    expect(io.commits.filter(c => c.startsWith('feat(triad): execute plan')).length).toBe(3)
    expect(io.commits).toContain('chore(triad): complete phase 1 execution — Core')
    expect(parseState(io.files.get('.planning/STATE.md')!).phaseNote).toBe('executed, pending review')
    expect(parseRoadmap(io.files.get('.planning/ROADMAP.md')!).rows[0]).toMatchObject({ completed: 3, status: 'Executed' })
    const again = await build(io, agents, { phase: 1 })
    expect(again.plans.every(p => p.skipped)).toBe(true)
  })
  test('runs a plan marked model: opus on the Opus coder and the rest at the persona tier', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/ai.ts', { model: 'opus' })] })
    expect(io.files.get('.planning/phases/01-core/01-02-PLAN.md')).toMatch(/^model: opus$/m)
    expect(parsePlan('01-02-PLAN.md', io.files.get('.planning/phases/01-core/01-02-PLAN.md')!, 1).schemaErrors).toEqual([])
    const agents = fakeAgents(io)
    expect((await build(io, agents)).ok).toBe(true)
    expect(agents.spawned).toContain('plan 01-02 @opus')
    expect(agents.spawned).toContain('plan 01-01 @sonnet')
  })
  test('a failed verification stops the build after its wave', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts', { verification_commands: ['test -f src/never.ts'] }), plan(2, 2, 'src/b.ts', { depends_on: ['01-01'] })] })
    const r = await build(io, fakeAgents(io))
    expect(r.ok).toBe(false)
    expect(r.stoppedAfterWave).toBe(1)
    expect(io.files.has('.planning/phases/01-core/01-02-SUMMARY.md')).toBe(false)
    expect(summaryStatus(io.files.get('.planning/phases/01-core/01-01-SUMMARY.md')!)).toBe('Failed')
  })
  test('review: a major finding is fixed in cycle 1 and the phase passes in cycle 2', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    await build(io, fakeAgents(io))
    const reviewAgents = fakeAgents(io, cycle => cycle === 1 ? `### Finding 1\n- **Severity**: major\n- **File**: src/a.ts\n- **Lines**: 1-2\n- **Issue**: no error handling\n- **Confidence**: 90%\n\n**Verdict**: NEEDS WORK` : '**Verdict**: PASS')
    const r = await review(io, reviewAgents)
    expect(r.result).toBe('PASSED')
    expect(r.cycles).toBe(2)
    expect(reviewAgents.spawned.some(s => s.startsWith('fix '))).toBe(true)
    const doc = io.files.get('.planning/phases/01-core/01-REVIEW.md')!
    expect(doc).toContain('PASSED')
    expect(io.commits).toContain('chore(triad): phase 1 review passed — Core')
    expect(io.files.get('.planning/ROADMAP.md')).toContain('[x] Phase 1')
  })
  test('light process: a small phase gets two reviewers, no evaluators, at most two cycles; a review mode asked for wins', async () => {
    const setup = async () => {
      const io = await newProject()
      await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
      await build(io, fakeAgents(io))
      return io
    }
    const reviewers = (spawned: string[]) => spawned.filter(s => s.startsWith('review '))
    const io = await setup()
    const a = fakeAgents(io, () => '**Verdict**: PASS')
    expect((await review(io, a, { lightPlans: 2 })).result).toBe('PASSED')
    expect(reviewers(a.spawned).length).toBe(2)
    expect(a.spawned.some(s => s.startsWith('evaluate '))).toBe(false)
    const io2 = await setup()
    const stuck = fakeAgents(io2, () => '### Finding 1\n- **Severity**: major\n- **File**: src/a.ts\n- **Lines**: 1\n- **Issue**: still wrong\n- **Confidence**: 90%\n\n**Verdict**: NEEDS WORK')
    expect((await review(io2, stuck, { lightPlans: 2 })).cycles).toBeLessThanOrEqual(2)
    const io3 = await setup()
    const full = fakeAgents(io3, () => '**Verdict**: PASS')
    await review(io3, full, { lightPlans: 2, mode: 'panel' })
    const io4 = await setup()
    const off = fakeAgents(io4, () => '**Verdict**: PASS')
    await review(io4, off, { lightPlans: 0 })
    expect(reviewers(off.spawned)).toEqual(reviewers(full.spawned))
    expect(off.spawned.some(s => s.startsWith('evaluate '))).toBe(true)
  })
  test('fixMinor: after a pass, one round fixes the minor findings and commits once the checks pass', async () => {
    const minorReply = () => '### Finding 1\n- **Severity**: minor\n- **File**: src/a.ts\n- **Lines**: 1\n- **Issue**: name is unclear\n- **Confidence**: 90%\n\n**Verdict**: PASS'
    const setup = async () => {
      const io = await newProject()
      await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
      await build(io, fakeAgents(io))
      return io
    }
    const io = await setup()
    const a = fakeAgents(io, minorReply)
    const r = await review(io, a, { lightPlans: 2, fixMinor: true })
    expect(r.result).toBe('PASSED')
    expect(a.spawned.filter(s => s.startsWith('minor fixes ')).length).toBe(1)
    expect(r.text).toMatch(/minor findings: .*checks 1\/1 passed, 1 file\(s\) changed/)
    expect(io.commits).toContain('refactor(triad): minor review fixes for phase 1\n\nPhase 1: Core\nFindings addressed: F-001')
    const io2 = await setup()
    const off = fakeAgents(io2, minorReply)
    await review(io2, off, { lightPlans: 2, fixMinor: false })
    expect(off.spawned.some(s => s.startsWith('minor fixes '))).toBe(false)
  })
  test('the plan commit adds .gitignore lines for the languages the phase writes', async () => {
    const io = await newProject()
    io.files.set('.gitignore', 'node_modules\n')
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'conv.py'), plan(2, 1, 'web/app.ts')] })
    await build(io, fakeAgents(io))
    expect(io.files.get('.gitignore')).toBe('node_modules\n__pycache__/\n*.pyc\n.pytest_cache/\n.venv/\ndist/\ncoverage/\n')
    expect(gitignoreLines(['a.py'], io.files.get('.gitignore')!)).toEqual([])
  })
  test('estimate: per phase from the plan counts, the process and Opus plans; finished steps cost nothing', async () => {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build the core API', plans: 2 }, { name: 'Game', goal: 'The game', plans: 4 }] } as any)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts', { model: 'opus' } as any)] })
    const e = await estimate(io, { lightPlans: 2 })
    const [p1, p2] = e.phases
    expect(p1).toMatchObject({ plans: 2, planned: true, opusPlans: 1, light: true, plan: 0 })
    expect(Math.abs(p1!.build - (0.2 + 1.2))).toBeLessThan(1e-9)
    expect(Math.abs(p1!.review - (0.1 + 0.05 * 2))).toBeLessThan(1e-9)
    expect(p2).toMatchObject({ plans: 4, planned: false, light: false })
    expect(Math.abs(p2!.plan - (0.45 + 0.4))).toBeLessThan(1e-9)
    expect(Math.abs(p2!.review - (0.35 + 0.6 + 0.1))).toBeLessThan(1e-9)
    expect(e.text).toMatch(/\| 1\. Core \| 2, 1 on Opus \| light \| done \|/)
    expect(e.text).toMatch(/maxProjectSpend/)
    await build(io, fakeAgents(io))
    expect((await estimate(io, { lightPlans: 2 })).phases[0]!.build).toBe(0)
    expect((await estimate(memIo(), { lightPlans: 2 })).text).toMatch(/No Legion project/)
  })
  test('estimate: calibrated from the measured cost of past steps', async () => {
    const rec = (project: string, step: StepRecord['step'], usd: number, plans = 2): StepRecord => ({ project, session: 's', phase: 1, step, plans, opusPlans: 0, light: false, usd, at: '' })
    expect(calibrate(undefined)).toEqual({ plan: 1, build: 1, review: 1, n: 0 })
    // Builds cost twice the rate on three projects: median 2, pulled to 1 + 1 * 3/5.
    const twice = predicted('build', { plans: 2, opusPlans: 0, light: false }) * 2
    const c = calibrate([rec('a', 'build', twice), rec('b', 'build', twice), rec('c', 'build', twice / 2), rec('c', 'build', twice / 2), rec('d', 'plan', 0)])
    expect(Math.abs(c.build - 1.6)).toBeLessThan(1e-9)
    expect(c.plan).toBe(1)
    expect(c.n).toBe(3)
    // One wild run moves little and never past 3x.
    expect(calibrate(Array.from({ length: 20 }, (_, i) => rec(String(i), 'review', 100))).review).toBe(3)
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build the core API', plans: 2 }] } as any)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts')] })
    expect(await phaseShape(io, 1, 2)).toEqual({ phase: 1, plans: 2, opusPlans: 0, light: true })
    const plain = await estimate(io, { lightPlans: 2 })
    const cal = await estimate(io, { lightPlans: 2, history: [rec('a', 'build', twice), rec('b', 'build', twice), rec('c', 'build', twice)] })
    expect(Math.abs(cal.phases[0]!.build - plain.phases[0]!.build * 1.6)).toBeLessThan(1e-9)
    expect(cal.text).toMatch(/calibrated from 3 past steps of your own runs \(plan x1\.00, build x1\.60/)
    expect(plain.text).toMatch(/your own runs calibrate them/)
  })
  test('planning_status names the light and full phases', async () => {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build the core API', plans: 2 }, { name: 'Game', goal: 'The game', plans: 4 }] } as any)
    expect(await processLine(io, 2)).toBe('Process: light for phase 1; full for phase 2 (light: at most 2 plans).')
    expect(await processLine(io, 0)).toBe('Process: full for every phase (lightPlans 0).')
  })
  test('review: a reviewer that returns nothing is never a pass', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    await build(io, fakeAgents(io))
    const r = await review(io, fakeAgents(io, () => ''))
    expect(r.result === 'PASSED').toBe(false)
    expect(io.commits.some(c => c.includes('review passed'))).toBe(false)
  })
  test('status and validate on the built project', async () => {
    const io = await newProject()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    await build(io, fakeAgents(io))
    expect(await statusText(io)).toContain('/triad:review')
    const v = await validateText(io, '--ci')
    expect(v.exitCode === 0 || v.exitCode === 1).toBe(true)
    expect(await statusText(memIo())).toContain('No Legion project')
  })
})
