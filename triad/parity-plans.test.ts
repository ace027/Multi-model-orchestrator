// Ported from Legion's plan-schema-conformance, validate-plan-frontmatter,
// migrate-plans, plan-critique-overlap, two-wave-detection, sequential-files,
// planning-count-caps, decision-complete-contract and dry-run-fixtures tests.
// Legion's tests grep its skill prose; these run the same rules through
// Triad's code against Legion's fixtures (bundled in tests/fixtures/index.ts).
import { describe, expect, test } from 'claude-code/testing'
import { FIXTURES } from './tests/fixtures/index.ts'
import { parsePlan, planWaves, runGroups, type Plan } from './hooks/legion/planning.ts'
import { critique } from './hooks/legion/critique.ts'
import { planBrief } from './hooks/legion/build.ts'
import { BY_ID } from './hooks/legion/registry.ts'
import { ROSTER } from './hooks/legion/registry.ts'
import { SCHEMAS, SETTINGS } from './hooks/legion/data.ts'
import { dryRunReport } from './hooks/legion/dryrun.ts'
import { planWrite, projectInit } from './hooks/legion/handlers.ts'
import { parseYaml } from './hooks/legion/yaml.ts'
import type { PlanInput } from './hooks/legion/render.ts'
import { memIo } from './testkit.ts'

const fixturePlan = (key: string, file = '01-01-PLAN.md') => parsePlan(file, FIXTURES[key]!, 1)
const rules = (ps: Plan[]) => critique(ps, 3, ROSTER).issues.map(i => `${i.severity} ${i.rule} ${i.message}`)

describe('parity: plan-schema-conformance', () => {
  test('the valid fixtures pass the plan schema', () => {
    for (const k of ['plan-validation/valid-current.md', 'plan-validation/valid-multi-agent.md']) {
      const p = fixturePlan(k)
      expect(p.schemaErrors).toEqual([])
      expect(p.normalizedErrors).toEqual([])
    }
    expect(fixturePlan('plan-validation/valid-multi-agent.md').fm.agents.length).toBeGreaterThan(1)
  })
  test('an unknown frontmatter block is rejected', () => {
    expect(fixturePlan('plan-validation/invalid-extra-field.md').normalizedErrors.join('\n')).toContain("additional property 'unknown_block'")
  })
  test('flat string expected_artifacts are rejected', () => {
    expect(fixturePlan('plan-validation/invalid-flat-artifacts.md').normalizedErrors.join('\n')).toContain('/expected_artifacts/0 must be object')
  })
  test('a singular agent: field is read as agents: and flagged as legacy', () => {
    const p = fixturePlan('plan-validation/invalid-singular-agent.md')
    expect(p.schemaErrors.length).toBeGreaterThan(0)
    expect(p.normalized.join('\n')).toContain('agent: read as agents:')
    expect(p.normalizedErrors).toEqual([])
    expect(rules([p]).some(r => r.startsWith('WARNING schema legacy frontmatter'))).toBe(true)
  })
  test('plans written by plan_write pass the schema and the critique', async () => {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build it', plans: 1 }] } as any)
    const plan: PlanInput = {
      plan: 1, title: 'Plan 1', wave: 1, agents: ['engineering-backend-architect'], depends_on: [], files_modified: ['src/a.ts'],
      files_forbidden: ['secrets/'], verification_commands: ['test -f src/a.ts'], expected_artifacts: [{ path: 'src/a.ts', provides: 'code', required: true }],
      truths: ['it works'], objective: 'Write src/a.ts.', tasks: [{ name: 'write', files: ['src/a.ts'], action: 'Create src/a.ts exporting run().', verification: ['test -f src/a.ts'], done: 'src/a.ts exists' }],
      success_criteria: ['src/a.ts exists'],
    }
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan] })
    const text = io.files.get('.planning/phases/01-core/01-01-PLAN.md')!
    const p = parsePlan('01-01-PLAN.md', text, 1)
    expect(p.schemaErrors).toEqual([])
    expect(critique([p], 3, ROSTER).verdict).toBe('PASS')
  })
  test('a vague task action is a decisions BLOCKER', () => {
    const p = fixturePlan('plan-validation/invalid-vague-action.md')
    expect(rules([p]).some(r => r.startsWith('BLOCKER decisions') && r.includes('as appropriate'))).toBe(true)
    expect(critique([p], 3, ROSTER).verdict).toBe('REWORK')
  })
})

describe('parity: validate-plan-frontmatter and migrate-plans', () => {
  test('a legacy integer plan number is normalized without schema errors', () => {
    const p = fixturePlan('plan-valid-v6.md')
    expect(p.fm.plan).toMatch(/^\d\d-\d\d$/)
    expect(p.normalizedErrors).toEqual([])
  })
  test('a plan without verification_commands is a R1 BLOCKER', () => {
    expect(rules([fixturePlan('plan-missing-verification.md')]).some(r => r.startsWith('BLOCKER R1'))).toBe(true)
  })
  test('a file in both files_modified and files_forbidden is a R2 BLOCKER', () => {
    expect(rules([fixturePlan('plan-overlap-forbidden.md')]).some(r => r.startsWith('BLOCKER R2') && r.includes('skills/other-skill/SKILL.md'))).toBe(true)
  })
  test('the pre-migration plan is read in its legacy form; the migrated one is clean', () => {
    const before = fixturePlan('migration/before/sample-plan.md')
    expect(before.normalized.length).toBeGreaterThan(0)
    expect(fixturePlan('migration/after/sample-plan.md').schemaErrors).toEqual([])
  })
})

describe('parity: plan-critique-overlap and two-wave-detection', () => {
  const a = () => fixturePlan('plans-wave-overlap/wave1-plan-a.md', '01-01-PLAN.md')
  const b = () => fixturePlan('plans-wave-overlap/wave1-plan-b.md', '01-02-PLAN.md')
  const c = () => fixturePlan('plans-wave-overlap/wave1-plan-c-no-overlap.md', '01-03-PLAN.md')
  test('two wave-1 plans modifying the same file are an overlap BLOCKER; the third is not', () => {
    const r = critique([a(), b(), c()], 3, ROSTER).issues.filter(i => i.rule === 'overlap')
    expect(r.length).toBe(1)
    expect(r[0]!.plan).toBe('01-01+01-02')
    expect(planWaves([a(), b(), c()]).warnings.some(w => w.includes('01-01 and 01-02 both modify'))).toBe(true)
  })
  test('a dependency in the same wave is a wave error', () => {
    const p = a()
    const q = b()
    q.fm.depends_on = ['01-01']
    expect(planWaves([p, q]).errors.join('\n')).toContain('a dependency must be in an earlier wave')
  })
})

// Plans for runGroups: a plan id, files_modified and sequential_files.
const seqPlan = (n: number, files: string[], seq: string[] = [], wave = 1) => parsePlan(`01-0${n}-PLAN.md`, [
  '---', 'phase: 01-core', `plan: 01-0${n}`, 'type: execute', `wave: ${wave}`, 'depends_on: []',
  `files_modified: [${files.join(', ')}]`, `sequential_files: [${seq.join(', ')}]`, 'autonomous: true', 'agents: [engineering-backend-architect]', '---', 'body',
].join('\n'), 1)
const ids = (gs: Plan[][]) => gs.map(g => g.map(p => p.id))

describe('parity: sequential-files', () => {
  test('1-2. no or empty sequential_files: one parallel group', () => {
    expect(ids(runGroups([seqPlan(1, ['a.ts']), seqPlan(2, ['b.ts'])]))).toEqual([['01-01', '01-02']])
  })
  test('3. a single plan with sequential_files runs normally', () => {
    expect(ids(runGroups([seqPlan(1, ['a.ts'], ['package.json'])]))).toEqual([['01-01']])
  })
  test('4. two plans sharing a sequential file run one after the other, in plan order', () => {
    expect(ids(runGroups([seqPlan(1, ['a.ts'], ['package.json']), seqPlan(2, ['b.ts'], ['package.json'])]))).toEqual([['01-01'], ['01-02']])
  })
  test('5. two plans without overlap run in parallel', () => {
    expect(ids(runGroups([seqPlan(1, ['a.ts'], ['x.json']), seqPlan(2, ['b.ts'], ['y.json'])]))).toEqual([['01-01', '01-02']])
  })
  test('6. three plans, partial overlap: only the conflicting pair is split (Legion made the whole wave sequential)', () => {
    expect(ids(runGroups([seqPlan(1, ['a.ts'], ['package.json']), seqPlan(2, ['b.ts'], ['package.json']), seqPlan(3, ['c.ts'])]))).toEqual([['01-01', '01-03'], ['01-02']])
  })
  test('a sequential file that another plan modifies also serializes', () => {
    expect(ids(runGroups([seqPlan(1, ['a.ts'], ['package.json']), seqPlan(2, ['package.json'])]))).toEqual([['01-01'], ['01-02']])
  })
  test('7. the same sequential file in different waves is no constraint (groups are per wave)', () => {
    const w = planWaves([seqPlan(1, ['a.ts'], ['package.json']), seqPlan(2, ['b.ts'], ['package.json'], 2)])
    expect(w.waves.map(x => ids(runGroups(x.plans)))).toEqual([[['01-01']], [['01-02']]])
  })
  test('8. sequential_files must not overlap files_modified', () => {
    expect(planWaves([seqPlan(1, ['CHANGELOG.md', 'src/app.js'], ['CHANGELOG.md', 'settings.json'])]).errors)
      .toEqual(['01-01: CHANGELOG.md is in both sequential_files and files_modified'])
    expect(planWaves([seqPlan(1, ['src/app.js'], ['CHANGELOG.md'])]).errors).toEqual([])
    expect(planWaves([seqPlan(1, ['src/app.js'])]).errors).toEqual([])
  })
  test('a plan may write its sequential files', () => {
    const plan = seqPlan(1, ['src/a.ts'], ['package.json'])
    const b = planBrief({ persona: BY_ID.get('engineering-backend-architect')!, plan, planText: 'body', phase: 1, phaseName: 'Core', wave: 1, peers: [], handoffs: '', mode: 'guarded', haiku: false })
    expect(b).toContain('Files you may write: src/a.ts, package.json (shared with other plans, written one plan at a time: package.json)')
  })
})

describe('parity: planning-count-caps', () => {
  test('max_tasks_per_plan is a per-plan task cap, not a cap on plans', () => {
    expect(SCHEMAS.settings.properties.planning.properties.max_tasks_per_plan.description).toMatch(/Per-plan task cap/)
    expect(SETTINGS.planning.max_tasks_per_plan).toBeGreaterThan(0)
  })
  test('many plans in a phase pass; too many tasks in one plan is a size BLOCKER', () => {
    const many = Array.from({ length: 9 }, (_, i) => seqPlan(i + 1, [`f${i}.ts`]))
    expect(critique(many, 3, ROSTER).issues.some(i => i.rule === 'size' && i.severity === 'BLOCKER')).toBe(false)
    const big = seqPlan(1, ['a.ts'])
    big.body = '<task>1</task><task>2</task><task>3</task><task>4</task>'
    const size = critique([big], 3, ROSTER).issues.filter(i => i.rule === 'size')
    expect(size.map(i => i.severity)).toEqual(['BLOCKER'])
    expect(size[0]!.message).toContain('per plan')
  })
})

describe('parity: decision-complete-contract', () => {
  test('plans must carry the execution harness sections', () => {
    const p = seqPlan(1, ['a.ts'])
    expect(rules([p]).filter(r => r.startsWith('BLOCKER harness')).length).toBe(3)
    p.body = '<task>t</task>\n<execution_contract>read-before-write -> evidence-before-action -> minimal diff -> verify-before-report</execution_contract>\n<stop_gates>Return BLOCKED when unsure.</stop_gates>\n<recovery>revert</recovery>'
    expect(rules([p]).filter(r => / harness /.test(r))).toEqual([])
  })
  test('a decision left open is REWORK; deferring work is a warning', () => {
    const p = seqPlan(1, ['a.ts'])
    for (const body of ['Pick the storage engine: TBD.', 'The executor should decide the cache size.', 'Choose the format, decide later.', 'Add retries as needed.']) {
      p.body = body
      expect(rules([p]).some(r => r.startsWith('BLOCKER decisions'))).toBe(true)
    }
    p.body = 'Localization is left for a future phase.'
    expect(rules([p]).some(r => r.startsWith('WARNING decisions'))).toBe(true)
    expect(rules([p]).some(r => r.startsWith('BLOCKER decisions'))).toBe(false)
  })
})

const fixtureIo = (name: string) => {
  const pre = `dry-run/${name}/`
  return memIo(Object.fromEntries(Object.entries(FIXTURES).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [k.slice(pre.length), v])))
}

describe('parity: dry-run-fixtures', () => {
  const cases: [string, string, boolean][] = [
    ['plan', 'ok', true], ['plan', 'missing-roadmap', false],
    ['build', 'ok', true], ['build', 'missing-plans', false],
    ['review', 'ok', true], ['review', 'missing-summaries', false],
    ['status', 'ok', true], ['status', 'missing-project', false],
  ]
  for (const [command, fixture, success] of cases) {
    test(`${command} on ${fixture}: success ${success}, deterministic, no writes`, async () => {
      const io = fixtureIo(fixture)
      const before = JSON.stringify([...io.files])
      const first = await dryRunReport(io, command, 1)
      const second = await dryRunReport(io, command, 1)
      expect(first.success).toBe(success)
      expect(first).toEqual(second)
      expect(JSON.stringify([...io.files])).toBe(before)
      expect(io.dirty.size).toBe(0)
    })
  }
})

describe('parity: the Legion fixture YAML parses', () => {
  test('every bundled .yaml fixture parses to an object', () => {
    for (const [k, v] of Object.entries(FIXTURES)) if (k.endsWith('.yaml')) {
      const doc = parseYaml(v.replace(/^---\s*$/m, ''))
      expect(typeof doc).toBe('object')
    }
  })
})
