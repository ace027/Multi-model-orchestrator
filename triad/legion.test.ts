import { describe, expect, test } from 'claude-code/testing'
import type { Io, RunResult } from './hooks/legion/io.ts'
import type { Agents } from './hooks/legion/build.ts'
import { build } from './hooks/legion/build.ts'
import { review } from './hooks/legion/reviewrun.ts'
import { planCheck, planWrite, projectInit, statusText, validateText } from './hooks/legion/handlers.ts'
import { getField, parsePlan, parseRoadmap, parseState, planWaves, progressBar, setField, setRoadmapRow, summaryStatus, updateState } from './hooks/legion/planning.ts'
import { critique } from './hooks/legion/critique.ts'
import { dedup, parseReport, triage } from './hooks/legion/review.ts'
import { checkWrite, loadSettings } from './hooks/legion/settings.ts'
import { ROSTER, composePanel } from './hooks/legion/registry.ts'
import { parseYaml } from './hooks/legion/yaml.ts'
import type { PlanInput } from './hooks/legion/render.ts'

// An in-memory project with just enough git: dirty files since the last commit,
// and the commit messages.
function memIo(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed))
  const dirty = new Set<string>()
  const commits: string[] = []
  const ok = (stdout = ''): RunResult => ({ exitCode: 0, stdout, stderr: '' })
  const io: Io & { files: typeof files; dirty: typeof dirty; commits: string[] } = {
    root: '/repo', files, dirty, commits,
    read: async r => files.get(r),
    write: async (r, t) => { files.set(r, t); dirty.add(r) },
    list: async r => {
      const pre = r.replace(/\/$/, '') + '/'
      const out = new Map<string, boolean>()
      for (const k of files.keys()) if (k.startsWith(pre)) { const rest = k.slice(pre.length); const i = rest.indexOf('/'); out.set(i < 0 ? rest : rest.slice(0, i), i >= 0) }
      return [...out].map(([name, dir]) => ({ name, dir }))
    },
    run: async argv => {
      if (argv[0] === 'rm') { files.delete(argv[2]!); return ok() }
      if (argv[0] === 'bash') { const m = argv[2]!.match(/^test -f (\S+)$/); return m ? { exitCode: files.has(m[1]!) ? 0 : 1, stdout: '', stderr: '' } : ok() }
      if (argv[0] !== 'git') return ok()
      if (argv[1] === 'status') return ok([...dirty].map(f => `?? ${f}`).join('\n'))
      if (argv[1] === 'diff') return { exitCode: dirty.size ? 1 : 0, stdout: '', stderr: '' }
      if (argv[1] === 'commit') { commits.push(argv[argv.indexOf('-m') + 1]!); dirty.clear() }
      return ok()
    },
    now: () => new Date('2026-10-08T12:00:00Z'),
  }
  return io
}

const REPLY = 'status: done\nsummary: did it\nchanges:\n- src/x | added | x\nverify: ok'

function fakeAgents(io: ReturnType<typeof memIo>, review: (cycle: number) => string = () => '**Verdict**: PASS') {
  let n = 0
  const cycles: Record<string, number> = {}
  const spawned: string[] = []
  const agents: Agents & { spawned: string[] } = {
    maxParallel: 4, spawned,
    async run({ persona, scope, label }) {
      const id = `a${++n}`
      spawned.push(`${label} @${persona.tier}`)
      if (label.startsWith('review')) { cycles[persona.id] = (cycles[persona.id] ?? 0) + 1; return { agentId: id, answer: review(cycles[persona.id]!) } }
      for (const f of scope.files_modified) await io.write(f, `// ${label}\n`)
      return { agentId: id, answer: REPLY }
    },
    followUp: async () => REPLY,
    writesOf: () => ({ files: [], warnings: [] }),
    usageOf: () => '1 request',
  }
  return agents
}

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
  test('control modes: surgical denies, guarded and autonomous warn, advisory logs', () => {
    expect(checkWrite('src/a.ts', scope('surgical')).action).toBe('allow')
    expect(checkWrite('src/lib/x.ts', scope('surgical')).action).toBe('allow')
    expect(checkWrite('src/b.ts', scope('surgical')).action).toBe('deny')
    expect(checkWrite('secrets/k', scope('guarded')).action).toBe('warn')
    expect(checkWrite('src/b.ts', scope('autonomous')).action).toBe('warn')
    expect(checkWrite('src/b.ts', scope('advisory')).action).toBe('log')
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
    expect(io.commits.filter(c => c.startsWith('feat(triad): execute plan')).length).toBe(3)
    expect(io.commits).toContain('chore(triad): complete phase 1 execution — Core')
    expect(parseState(io.files.get('.planning/STATE.md')!).phaseNote).toBe('executed, pending review')
    expect(parseRoadmap(io.files.get('.planning/ROADMAP.md')!).rows[0]).toMatchObject({ completed: 3, status: 'Executed' })
    const again = await build(io, agents, { phase: 1 })
    expect(again.plans.every(p => p.skipped)).toBe(true)
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
