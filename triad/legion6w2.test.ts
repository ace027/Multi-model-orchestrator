import { describe, expect, test } from 'claude-code/testing'
import type { RunResult } from './hooks/legion/io.ts'
import { build } from './hooks/legion/build.ts'
import { planWrite, projectInit } from './hooks/legion/handlers.ts'
import { parsePlan, summaryStatus } from './hooks/legion/planning.ts'
import type { PlanInput } from './hooks/legion/render.ts'
import { renderSummary } from './hooks/legion/render.ts'
import { applyMode, escalationRows, escalationTool, loadProtocol, parseEscalations, DEFAULT_PROTOCOL } from './hooks/legion/escalation.ts'
import { AGENT_FILES, classifyFailure, hashText } from './hooks/legion/resilience.ts'
import { checkSummary, compactPhase, compactedCovers, summaryObject } from './hooks/legion/compact.ts'
import { boardReview } from './hooks/legion/board.ts'
import { PERSONAS } from './hooks/legion/personas.ts'
import { PERSONA_BODIES } from './hooks/legion/personasfull.ts'
import { fakeAgents, memIo, REPLY } from './testkit.ts'

const DIR = '.planning/phases/01-core'
const plan = (p: number, wave: number, file: string, extra: Partial<PlanInput> = {}): PlanInput => ({
  plan: p, title: `Plan ${p}`, wave, agents: ['engineering-backend-architect'], depends_on: [], files_modified: [file],
  files_forbidden: ['secrets/'], verification_commands: [`test -f ${file}`], requirements: [`REQ-0${p}`],
  expected_artifacts: [{ path: file, provides: 'code', required: true }], truths: ['it works'],
  objective: `Write ${file}.`, tasks: [{ name: 'write', files: [file], action: `Create ${file}.`, verification: [`test -f ${file}`], done: `${file} exists` }],
  success_criteria: [`${file} exists`], ...extra,
})

const ok = (stdout = ''): RunResult => ({ exitCode: 0, stdout, stderr: '' })

// memIo with a hook in front of run (fake git and command results), recording every argv.
async function project(settings?: object, hook: (argv: string[]) => RunResult | undefined = () => undefined) {
  const io = memIo()
  const base = io.run
  const calls: string[][] = []
  io.run = async (argv, o) => { calls.push(argv); return hook(argv) ?? base(argv, o) }
  await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build the core', plans: 3 }] } as any)
  if (settings) await io.write('settings.json', JSON.stringify({ control_mode: 'guarded', ...settings }))
  return Object.assign(io, { calls })
}

function capture(io: ReturnType<typeof memIo>, reply: (label: string) => string | undefined = () => undefined) {
  const a = fakeAgents(io)
  const briefs: Record<string, string> = {}
  const inputs: any[] = []
  const run = a.run
  a.run = async o => {
    briefs[o.label] = o.brief
    inputs.push(o)
    const r = await run(o)
    const ans = reply(o.label)
    return ans === undefined ? r : { ...r, answer: ans }
  }
  return Object.assign(a, { briefs, inputs })
}

describe('pre-build validation', () => {
  test('refuses a phase with a plan that fails the plan-frontmatter schema, listing each problem', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts')] })
    const f = `${DIR}/01-02-PLAN.md`
    io.files.set(f, io.files.get(f)!.replace('type: execute', 'type: execute\nowner: bob\nwave_count: 2'))
    const agents = capture(io)
    const r = await build(io, agents)
    expect(r.ok).toBe(false)
    expect(r.text).toContain('fail the plan-frontmatter schema')
    expect(r.text).toContain("01-02-PLAN.md: / must not have additional property 'owner'")
    expect(r.text).toContain("'wave_count'")
    expect(agents.inputs.length).toBe(0)
  })
  test('still builds a legacy plan that read-time normalization fixes', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    const f = `${DIR}/01-01-PLAN.md`
    io.files.set(f, io.files.get(f)!.replace('plan: "01-01"', 'plan: 1').replace(/agents:\n\s+- engineering-backend-architect/, 'agent: engineering-backend-architect'))
    const p = parsePlan('01-01-PLAN.md', io.files.get(f)!, 1)
    expect(p.schemaErrors.length).toBeGreaterThan(0)
    expect(p.normalizedErrors).toEqual([])
    expect((await build(io, capture(io))).ok).toBe(true)
  })
})

describe('BLOCKER / ENVIRONMENT classification', () => {
  test('classifies by pattern, with business-logic signs winning', () => {
    expect(classifyFailure("Error: Cannot find module 'lodash'").kind).toBe('ENVIRONMENT')
    expect(classifyFailure('bash: pytest: command not found').kind).toBe('ENVIRONMENT')
    expect(classifyFailure('listen EADDRINUSE: address already in use :::3000').kind).toBe('ENVIRONMENT')
    expect(classifyFailure('connect ECONNREFUSED 127.0.0.1:5432').kind).toBe('ENVIRONMENT')
    expect(classifyFailure('EACCES: permission denied, open /var/x').kind).toBe('ENVIRONMENT')
    expect(classifyFailure('did not finish: timed out').kind).toBe('ENVIRONMENT')
    expect(classifyFailure("Cannot find module './util'").kind).toBe('BLOCKER')
    expect(classifyFailure('AssertionError: expected 1 to equal 2\n  ECONNREFUSED in a fixture').kind).toBe('BLOCKER')
    expect(classifyFailure('npm ERR! ERESOLVE unable to resolve dependency tree').kind).toBe('BLOCKER')
    expect(classifyFailure('').kind).toBe('BLOCKER')
  })
  const npmPlan = () => plan(1, 1, 'src/a.ts', { verification_commands: ['npm test'] })
  test('an ENVIRONMENT failure gets exactly one automatic retry and is recorded as remediated', async () => {
    let fixed = false
    const io = await project(undefined, argv => (argv[0] === 'bash' && argv[2] === 'npm test' ? (fixed ? ok('pass') : { exitCode: 1, stdout: '', stderr: "Error: Cannot find module 'lodash'" }) : undefined))
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [npmPlan()] })
    const agents = capture(io)
    let follow = 0
    agents.followUp = async (_id, text) => { follow++; expect(text).toContain('ENVIRONMENT ISSUE'); fixed = true; return REPLY }
    const r = await build(io, agents)
    expect(follow).toBe(1)
    expect(r.ok).toBe(true)
    expect(r.plans[0]!.failure).toMatchObject({ kind: 'ENVIRONMENT', remediated: true })
    expect(r.text).toContain('[ENVIRONMENT, auto-remediated')
    expect(io.files.get(`${DIR}/01-01-SUMMARY.md`)).toContain('**Failure Class**: ENVIRONMENT (auto-remediated')
  })
  test('an ENVIRONMENT failure that persists after the one retry becomes a BLOCKER', async () => {
    const io = await project(undefined, argv => (argv[0] === 'bash' && argv[2] === 'npm test' ? { exitCode: 1, stdout: '', stderr: 'getaddrinfo ENOTFOUND registry.npmjs.org' } : undefined))
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [npmPlan()] })
    const agents = capture(io)
    let follow = 0
    agents.followUp = async () => { follow++; return REPLY }
    const r = await build(io, agents)
    expect(follow).toBe(1)
    expect(r.plans[0]!.failure).toMatchObject({ kind: 'BLOCKER', retried: true })
    expect(io.files.get(`${DIR}/01-01-SUMMARY.md`)).toContain('ENVIRONMENT issue persisted after one automatic retry')
  })
  test('a BLOCKER is not retried: it escalates as a pending blocker in the SUMMARY and the report', async () => {
    const io = await project(undefined, argv => (argv[0] === 'bash' && argv[2] === 'npm test' ? { exitCode: 1, stdout: 'AssertionError: expected 200 to equal 404', stderr: '' } : undefined))
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [npmPlan()] })
    const agents = capture(io)
    let follow = 0
    agents.followUp = async () => { follow++; return REPLY }
    const r = await build(io, agents)
    expect(follow).toBe(0)
    expect(r.ok).toBe(false)
    const s = io.files.get(`${DIR}/01-01-SUMMARY.md`)!
    expect(summaryStatus(s)).toBe('Failed')
    expect(s).toContain('**Failure Class**: BLOCKER')
    expect(escalationRows(s)[0]).toMatchObject({ severity: 'blocker', type: 'quality', status: 'pending' })
    expect(r.text).toContain('[BLOCKER: AssertionError')
    expect(r.text).toContain('[ESCALATION BLOCKER] 01-01')
  })
  test('a blocked agent is classified too', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    const r = await build(io, capture(io, () => 'status: blocked\nsummary: stuck\nblocked_reason: the plan needs a new /users endpoint contract that is not specified'))
    expect(r.plans[0]!.status).toBe('BLOCKED')
    expect(r.plans[0]!.failure?.kind).toBe('BLOCKER')
    expect(escalationRows(io.files.get(`${DIR}/01-01-SUMMARY.md`)!)[0]!.type).toBe('api')
  })
})

describe('manual-edit detection', () => {
  const diff = (argv: string[]) => (argv[0] === 'git' && argv[1] === 'diff' && argv.includes('-U0') ? ok('--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-// plan 01-01\n+// tidied by hand\n') : undefined)
  test('records agent-file hashes after the commit and stores a corrective preference for a user edit', async () => {
    const io = await project(undefined, diff)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    await build(io, capture(io))
    const rec = JSON.parse(io.files.get(AGENT_FILES)!)
    expect(rec['src/a.ts']).toMatchObject({ hash: hashText(io.files.get('src/a.ts')!), plan: '01-01', agent: 'engineering-backend-architect', phase: 1 })
    expect(AGENT_FILES.startsWith('.triad/')).toBe(true)
    const again = await build(io, capture(io), { phase: 1 })
    expect(again.text).not.toContain('Manual edits')
    io.files.set('src/a.ts', '// tidied by hand\n')
    const r = await build(io, capture(io), { phase: 1 })
    const prefs = io.files.get('.planning/memory/PREFERENCES.md')!
    expect(prefs).toContain('| manual-edit | Phase 1, post-build manual edit to src/a.ts |')
    expect(prefs).toContain('| corrective | engineering-backend-architect | manual-edit, ts, engineering |')
    expect(prefs).toContain('+1/-1 lines: -// plan 01-01 / +// tidied by hand')
    expect(r.text).toContain('Manual edits since the last build')
    // Recorded once: the user's version is the new baseline.
    await build(io, capture(io), { phase: 1 })
    expect(io.files.get('.planning/memory/PREFERENCES.md')!.match(/manual-edit \|/g)!.length).toBe(1)
  })
  test('skipped when memory is disabled', async () => {
    const io = await project({ memory: { enabled: false } }, diff)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    await build(io, capture(io))
    io.files.set('src/a.ts', '// tidied by hand\n')
    const r = await build(io, capture(io), { phase: 1 })
    expect(io.files.has('.planning/memory/PREFERENCES.md')).toBe(false)
    expect(r.text).not.toContain('Manual edits')
  })
})

describe('compaction', () => {
  const longReply = (label: string) => `status: done\nsummary: did ${label}\ndecisions: chose a repository layer\nhandoff:\n${Array.from({ length: 40 }, (_, i) => `- convention ${i} for ${label}: ${'x'.repeat(80)}`).join('\n')}\nverify: ok`
  test('writes NN-COMPACTED.md once handoffs outgrow the budget, and later waves use it', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts'), plan(3, 2, 'src/c.ts', { depends_on: ['01-01', '01-02'] })] })
    const agents = capture(io, label => (label === 'plan 01-03' ? undefined : longReply(label)))
    const r = await build(io, agents)
    expect(r.ok).toBe(true)
    const c = io.files.get(`${DIR}/01-COMPACTED.md`)!
    expect(c).toContain('# Phase 1: Core — Compacted Summary')
    for (const h of ['## Deliverables', '## Decisions', '## Files Modified', '## Verification', '## Agents']) expect(c).toContain(h)
    for (const x of ['REQ-01', 'REQ-02', 'REQ-03', 'src/a.ts', 'src/c.ts']) expect(c).toContain(x)
    expect(compactedCovers(c)).toEqual(['01-01', '01-02', '01-03'])
    const brief = agents.briefs['plan 01-03']!
    expect(brief).toContain('(from 01-COMPACTED.md, in place of the dependency summaries)')
    expect(brief).not.toContain('convention 39')
  })
  test('without long handoffs the brief keeps the dependency handoff text; the phase is still compacted at completion', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 2, 'src/b.ts', { depends_on: ['01-01'] })] })
    const agents = capture(io)
    await build(io, agents)
    expect(agents.briefs['plan 01-02']).toContain('### From Plan 01-01')
    expect(io.files.has(`${DIR}/01-COMPACTED.md`)).toBe(true)
  })
  test('compactPhase keeps requirements and files and is under half the original length', () => {
    const p = parsePlan('01-01-PLAN.md', '---\nphase: 01-core\nplan: "01-01"\nwave: 1\nagents: [engineering-backend-architect]\nfiles_modified: [src/a.ts]\nrequirements: [REQ-07]\n---\nbody', 1)
    const s = renderSummary({ planId: '01-01', title: 'A', wave: 1, agent: 'engineering-backend-architect', status: 'Complete', date: '2026-10-08', tasks: [{ name: 'write', status: 'done' }], files: ['src/a.ts'], verification: [{ command: 'npm test', exitCode: 0, passed: true, output: 'x'.repeat(3000) }], decisions: ['d1'], issues: [], escalations: [], handoff: { keyOutputs: ['src/a.ts'], decisions: [], openQuestions: [], conventions: [] }, requirements: ['REQ-07'] })
    const c = compactPhase({ n: 1, dir: '01-core', name: 'Core', date: '2026-10-08', plans: [p], summaries: { '01-01': s + 'y'.repeat(1500) } })!
    expect(c.text).toContain('requirements_satisfied: [REQ-07]')
    expect(c.missing).toEqual([])
    expect(c.ratio).toBeLessThan(0.5)
  })
})

describe('worktrees', () => {
  const settings = { execution: { use_worktrees: true } }
  function fakeGit(io: () => ReturnType<typeof memIo>, conflictOn?: string) {
    return (argv: string[]): RunResult | undefined => {
      if (argv[0] !== 'git') return undefined
      if (argv[1] === 'worktree') return ok()
      if (argv[1] === '-C' && argv[3] === 'status') {
        const pre = argv[2]! + '/'
        return ok([...io().files.keys()].filter(k => k.startsWith(pre)).map(k => `?? ${k.slice(pre.length)}`).join('\n'))
      }
      if (argv[1] === '-C') return ok()
      if (argv[1] === 'merge' && argv[2] === '--no-ff') return conflictOn && argv.at(-1)!.includes(conflictOn) ? { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in src/a.ts', stderr: '' } : ok()
      if (argv[1] === 'diff' && argv.includes('--diff-filter=U')) return ok('src/a.ts\n')
      return undefined
    }
  }
  test('each plan runs in its own worktree, verified there, merged back, and removed', async () => {
    let ref: any
    const io = await project(settings, fakeGit(() => ref))
    ref = io
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts')] })
    const agents = capture(io)
    const r = await build(io, agents)
    expect(r.ok).toBe(true)
    const cmd = (s: string) => io.calls.filter(a => a.join(' ').includes(s))
    expect(cmd('worktree add .triad/worktrees/01-01 -b triad-wt-01-01-').length).toBe(1)
    expect(agents.briefs['plan 01-02']).toContain('Working directory: /repo/.triad/worktrees/01-02')
    expect(agents.inputs[0].scope.files_modified[0]).toMatch(/^\.triad\/worktrees\/01-0\d\/src\//)
    expect(cmd("cd '.triad/worktrees/01-01' && test -f src/a.ts").length).toBeGreaterThan(0)
    expect(cmd('merge --no-ff -m triad: merge plan 01-01 triad-wt-01-01-').length).toBe(1)
    expect(cmd('worktree remove --force .triad/worktrees/01-02').length).toBe(1)
    expect(io.files.get(`${DIR}/01-01-SUMMARY.md`)).toContain('`src/a.ts`')
  })
  test('a merge conflict aborts, fails the plan with a conflict escalation, and keeps the worktree', async () => {
    let ref: any
    const io = await project(settings, fakeGit(() => ref, 'triad-wt-01-01'))
    ref = io
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    const r = await build(io, capture(io))
    expect(r.ok).toBe(false)
    expect(r.plans[0]!.status).toBe('Failed')
    expect(io.calls.some(a => a.join(' ') === 'git merge --abort')).toBe(true)
    expect(io.calls.some(a => a.join(' ').startsWith('git worktree remove'))).toBe(false)
    const s = io.files.get(`${DIR}/01-01-SUMMARY.md`)!
    expect(s).toContain('Merge conflict')
    expect(escalationRows(s)[0]!.decision).toContain('Resolve the merge conflict of plan 01-01 in src/a.ts')
    expect(r.text).toContain('worktree kept at .triad/worktrees/01-01')
  })
  test('off by default: no worktree commands', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    const agents = capture(io)
    await build(io, agents)
    expect(io.calls.some(a => a.includes('worktree'))).toBe(false)
    expect(agents.briefs['plan 01-01']).not.toContain('Working directory')
  })
})

describe('SUMMARY validation', () => {
  test('a rendered SUMMARY passes the schema and the export standard; a build reports no SUMMARY warnings', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
    const r = await build(io, capture(io))
    const s = io.files.get(`${DIR}/01-01-SUMMARY.md`)!
    expect(checkSummary(s, { verificationDeclared: true })).toEqual([])
    expect(summaryObject(s)).toMatchObject({ plan_id: '01-01', outcome: 'success', files_modified: ['src/a.ts'] })
    expect(r.warnings.filter(w => w.startsWith('SUMMARY'))).toEqual([])
  })
  test('flags schema errors, missing required sections and unmet conditional sections', () => {
    const bad = '# Plan 1-1 Summary: x\n\n## Result\n**Status**: Complete\n\n## Completed Tasks\n- [ ] Task 1: a (failed)\n\n## Verification Results\nnone\n'
    const errs = checkSummary(bad, { verificationDeclared: true, escalations: 1, decisions: 2 })
    expect(errs.some(e => e.includes('/plan_id must match'))).toBe(true)
    expect(errs.some(e => e.includes("required property 'agent'"))).toBe(true)
    expect(errs).toContain('gate: outcome success with a failed task')
    expect(errs).toContain('gate: the plan declares verification commands but no results are recorded')
    expect(errs).toContain('missing required section "## Files Modified"')
    expect(errs).toContain('missing required section "## Handoff Context"')
    expect(errs.some(e => e.includes('"## Escalations" table has 0'))).toBe(true)
    expect(errs.some(e => e.includes('"## Decisions Made"'))).toBe(true)
  })
})

describe('escalations', () => {
  const block = (body: string) => `<escalation>\n${body}\n</escalation>`
  test('validates blocks against escalation_format and flags invalid ones without defaulting', () => {
    const es = parseEscalations([
      block('severity: blocker\ntype: dependency\ndecision: Add lodash\ncontext: Needs deep merge.\naffected_files:\n  - package.json'),
      block('severity: urgent\ntype: vibes\ndecision: Do a thing'),
    ].join('\n'))
    expect(es[0]).toMatchObject({ severity: 'blocker', type: 'dependency', context: 'Needs deep merge.', affected_files: ['package.json'], status: 'pending' })
    expect(es[0]!.problems).toBeUndefined()
    expect(es[1]!.severity).toBe('urgent')
    expect(es[1]!.problems).toEqual(['missing context', 'severity "urgent" is not one of info, warning, blocker', 'type "vibes" is not one of architecture, dependency, scope, schema, api, deletion, infrastructure, quality'])
  })
  test('control_mode_behaviors: autonomous and advisory log as info, surgical floors at warning, guarded keeps', () => {
    const e = { severity: 'blocker', type: 'api', decision: 'x', context: 'y', status: 'pending' }
    expect(applyMode(e, 'autonomous')).toMatchObject({ severity: 'info', declared: 'blocker' })
    expect(applyMode(e, 'advisory').severity).toBe('info')
    expect(applyMode(e, 'guarded')).toBe(e)
    expect(applyMode({ ...e, severity: 'info' }, 'surgical')).toMatchObject({ severity: 'warning', declared: 'info' })
    expect(DEFAULT_PROTOCOL.modes.surgical!.fileScope).toBe(true)
  })
  test("the project's escalation-protocol.yaml wins over the bundled defaults", async () => {
    const io = memIo({ '.planning/config/escalation-protocol.yaml': 'escalation_types:\n  security:\n    default_severity: blocker\nresolution:\n  statuses:\n    - pending\n    - approved\n    - waived\n' })
    const { protocol } = await loadProtocol(io)
    expect(Object.keys(protocol.types)).toEqual(['security'])
    expect(protocol.statuses).toContain('waived')
    expect(protocol.required).toEqual(['severity', 'type', 'decision', 'context'])
    expect(parseEscalations(block('severity: warning\ntype: security\ndecision: d\ncontext: c'), protocol)[0]!.problems).toBeUndefined()
  })
  const blocker = block('severity: blocker\ntype: dependency\ndecision: Add lodash\ncontext: Needs deep merge.')
  test('a blocker holds the plan at Partial under guarded but is logged as info under autonomous', async () => {
    for (const [mode, status] of [['guarded', 'Partial'], ['autonomous', 'Complete']] as const) {
      const io = await project({ control_mode: mode })
      await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
      const r = await build(io, capture(io, () => `${REPLY}\n${blocker}`))
      expect(r.plans[0]!.status).toBe(status)
      expect(escalationRows(io.files.get(`${DIR}/01-01-SUMMARY.md`)!)[0]!.severity).toBe(mode === 'guarded' ? 'blocker' : 'info')
    }
  })
  test('the escalation tool lists open escalations across a phase and resolves one in its SUMMARY.md', async () => {
    const io = await project()
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts')] })
    await build(io, capture(io, l => (l === 'plan 01-02' ? `${REPLY}\n${blocker}\n${block('severity: odd\ntype: scope\ndecision: d')}` : undefined)))
    const list = await escalationTool(io, { action: 'list', phase: 1 })
    expect(list).toContain('| 01-02 | 1 | blocker | dependency | Add lodash | pending |')
    expect(list).toContain('| 01-02 | 2 | odd | scope |')
    expect(await escalationTool(io, { action: 'resolve', phase: 1, plan: '01-02', number: 1, status: 'maybe' })).toContain('status must be one of pending, approved, rejected, deferred')
    const res = await escalationTool(io, { action: 'resolve', phase: 1, plan: '01-02', number: 1, status: 'approved', resolution: 'Human approved, added to dependencies' })
    expect(res).toContain('is now approved')
    const row = escalationRows(io.files.get(`${DIR}/01-02-SUMMARY.md`)!)[0]!
    expect(row).toMatchObject({ status: 'approved', resolution: 'Human approved, added to dependencies' })
    expect(await escalationTool(io, { action: 'list', phase: 1 })).not.toContain('Add lodash')
    expect(await escalationTool(io, { action: 'list', phase: 1, all: true })).toContain('Add lodash')
    expect(io.files.get(`${DIR}/01-02-SUMMARY.md`)).toContain('INVALID: missing context')
  })
})

describe('agent_personality_verbosity', () => {
  test('the shipped core is condensed: shorter than the full Legion body for every persona', () => {
    for (const p of PERSONAS) expect(p.core.length).toBeLessThan(PERSONA_BODIES[p.id]!.length)
  })
  test('full puts the whole persona body in the brief; condensed (the default) keeps the core', async () => {
    const id = 'engineering-backend-architect'
    const fullOnly = PERSONA_BODIES[id]!.split('\n').reverse().find(l => l.trim().length > 30 && !PERSONAS.find(p => p.id === id)!.core.includes(l.trim()))!.trim()
    for (const [v, has] of [['full', true], ['condensed', false], [undefined, false]] as const) {
      const io = await project(v ? { execution: { agent_personality_verbosity: v } } : undefined)
      await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts')] })
      const agents = capture(io)
      await build(io, agents)
      expect(agents.briefs['plan 01-01']!.includes(fullOnly)).toBe(has)
    }
  })
})

describe('board timeout', () => {
  test('member runs carry board.assessment_timeout_ms; a member that times out has no assessment', async () => {
    const io = await project({ board: { default_size: 3, assessment_timeout_ms: 1234 } })
    const seen: (number | undefined)[] = []
    let first = true
    const agents = fakeAgents(io)
    agents.run = async o => {
      seen.push(o.timeoutMs)
      if (first) { first = false; return { agentId: 'slow', deny: 'no answer within 1234 ms (timed out)' } }
      return { agentId: 'x', answer: '### Verdict: APPROVE\n### Score: 8\n### Concerns\nNone' }
    }
    const out = await boardReview(io, agents, { topic: 'REST API backend architecture and database schema' })
    expect(seen.length).toBe(3)
    expect(seen.every(t => t === 1234)).toBe(true)
    expect(out).toContain('**Assessments**: 2/3 completed')
    expect(out).toContain('| no answer |')
  })
})
