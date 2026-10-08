// Ported from Legion's lint-commands, cross-reference-validation,
// validate-command-spawn-truthfulness, context-budget,
// codebase-mapper-enrichment, observability-summary,
// observability-cycle-delta and intent-review tests. The release checks are
// pure functions (scripts/checks.ts); release-check.ts and
// spawn-truthfulness.ts run them over the real files in CI.
import { describe, expect, test } from 'claude-code/testing'
import { FIXTURES } from './tests/fixtures/index.ts'
import { BUDGETS, crossRefProblems, fixtureBundle, guideOf, lintCommand, releaseProblems, spawnCheck, spawnProblems } from './scripts/checks.ts'
import { LEGION_TOOLS } from './hooks/legion/tools.ts'
import { dependencyRisk, mapBuild, npmDependencyRisk, parseNpmOutdated, renderDepRisk } from './hooks/legion/map.ts'
import { build } from './hooks/legion/build.ts'
import { review } from './hooks/legion/reviewrun.ts'
import { planWrite, projectInit } from './hooks/legion/handlers.ts'
import type { PlanInput } from './hooks/legion/render.ts'
import { fakeAgents, memIo } from './testkit.ts'

const TOOLS = ['delegate_menial', ...LEGION_TOOLS.map(t => t.name)]
const cmd = (fm: string, body: string) => `---\n${fm}\n---\n${body}\n`

describe('parity: lint-commands', () => {
  test('a well-formed command passes', () => {
    expect(lintCommand('plan.md', cmd('description: Plan a phase\nargument-hint: "<phase>"', 'Plan $ARGUMENTS.\n<rules>\nx\n</rules>'))).toEqual([])
  })
  test('missing frontmatter, description, argument-hint and orphan closing tags are reported', () => {
    expect(lintCommand('a.md', 'no frontmatter')[0]).toContain('no YAML frontmatter')
    expect(lintCommand('a.md', cmd('argument-hint: x', 'body'))).toEqual(['a.md: no description'])
    expect(lintCommand('a.md', cmd('description: d', 'Run $ARGUMENTS'))).toEqual(['a.md: uses $ARGUMENTS but has no argument-hint'])
    expect(lintCommand('a.md', cmd('description: d', 'text </step> <step>'))).toEqual(['a.md: </step> has no <step> before it'])
  })
})

describe('parity: cross-reference-validation', () => {
  test('tools and commands a command names must exist', () => {
    const commands = {
      'plan.md': cmd('description: d', 'Call mcp__triad__plan_write, then run /triad:build.'),
      'build.md': cmd('description: d', 'Call mcp__triad__build_phase.'),
      'bad.md': cmd('description: d', 'Call mcp__triad__no_such_tool and /triad:nowhere.'),
    }
    expect(crossRefProblems(commands, TOOLS)).toEqual(['bad.md: mcp__triad__no_such_tool is not a Triad tool', 'bad.md: /triad:nowhere is not a command'])
  })
  test('the Legion tools the commands rely on are registered', () => {
    for (const t of ['plan_write', 'build_phase', 'review_phase', 'persona_run', 'board']) expect(TOOLS).toContain(t)
  })
})

describe('parity: validate-command-spawn-truthfulness', () => {
  const fx = (n: string) => FIXTURES[`command-spawn/${n}.md`]!
  test('spawn-with-agent-call passes', () => expect(spawnCheck(fx('spawn-with-agent-call')).valid).toBe(true))
  test('spawn-without-agent-call fails, naming the fix', () => {
    const r = spawnCheck(fx('spawn-without-agent-call'))
    expect(r.valid).toBe(false)
    expect(r.reason).toMatch(/Agent\(|inline-persona/)
  })
  test('inline-persona-mode passes', () => expect(spawnCheck(fx('inline-persona-mode')).valid).toBe(true))
  test('no-spawn-no-inline passes as exempt', () => expect(spawnCheck(fx('no-spawn-no-inline'))).toMatchObject({ valid: true, exempt: true }))
  test('the directory check aggregates: 1 of 4 fails', () => {
    const files = Object.fromEntries(Object.entries(FIXTURES).filter(([k]) => k.startsWith('command-spawn/')))
    expect(Object.keys(files).length).toBe(4)
    expect(spawnProblems(files).length).toBe(1)
  })
  test('Triad spawning tools count as the means', () => {
    expect(spawnCheck(cmd('description: d', 'Spawn the reviewers with mcp__triad__review_phase.')).valid).toBe(true)
    expect(spawnCheck(cmd('description: d', 'Spawn a helper with delegate_menial.')).valid).toBe(true)
  })
})

describe('parity: context-budget and release-check', () => {
  const register = (guide: string) => `const x = 1\nconst ORCHESTRATOR_GUIDE = \`${guide}\`\n`
  const good = () => ({
    pluginJson: JSON.stringify({ name: 'triad', version: '1.2.3' }), readme: '# Triad 1.2.3', registerTs: register('# guide'),
    commands: { 'plan.md': cmd('description: d', 'Run /triad:plan with mcp__triad__plan_write.') }, tools: TOOLS,
  })
  test('a clean release passes', () => expect(releaseProblems(good())).toEqual([]))
  test('the guide and each command stay under their byte budgets', () => {
    expect(guideOf(register('abc'))).toBe('abc')
    expect(releaseProblems({ ...good(), registerTs: register('x'.repeat(BUDGETS.guide + 1)) }).join('\n')).toContain(`the budget is ${BUDGETS.guide}`)
    expect(releaseProblems({ ...good(), commands: { 'big.md': cmd('description: d', 'x'.repeat(BUDGETS.command)) } }).join('\n')).toContain(`the budget is ${BUDGETS.command}`)
    expect(BUDGETS.guide).toBeLessThan(BUDGETS.command)
  })
  test('version problems are reported', () => {
    expect(releaseProblems({ ...good(), readme: '# Triad' })).toEqual(['README.md does not mention version 1.2.3'])
    expect(releaseProblems({ ...good(), pluginJson: '{"version":"1.2"}', readme: '1.2' })).toEqual(['plugin.json version 1.2 is not semver'])
    expect(releaseProblems({ ...good(), registerTs: 'nothing' })).toEqual(['register.ts has no ORCHESTRATOR_GUIDE template literal'])
  })
  test('the fixture bundle is a sorted, generated module', () => {
    const b = fixtureBundle({ 'b.md': 'B', 'a.md': 'A' })
    expect(b.startsWith('// Generated by triad/scripts/bundle-fixtures.ts')).toBe(true)
    expect(b.indexOf('"a.md"')).toBeLessThan(b.indexOf('"b.md"'))
    expect(FIXTURES['recommendation/cases.json']).toBeDefined()
  })
})

describe('parity: codebase-mapper-enrichment (dependency risk)', () => {
  const sample = FIXTURES['codebase-mapper/sample-npm-outdated.json']!
  test('npm outdated JSON is parsed and sorted by severity', () => {
    const o = parseNpmOutdated(sample)!
    const sev = Object.fromEntries(o.map(x => [x.name, x.severity]))
    expect(sev).toMatchObject({ express: 'major', webpack: 'major', chalk: 'major', lodash: 'patch', debug: 'patch' })
    expect(o.map(x => x.severity)).toEqual([...o.map(x => x.severity)].sort((a, b) => ['major', 'minor', 'patch'].indexOf(a) - ['major', 'minor', 'patch'].indexOf(b)))
    expect(o.find(x => x.name === 'express')!.majorGap).toBe(1)
    expect(parseNpmOutdated('not json')).toBeUndefined()
    expect(parseNpmOutdated('')).toEqual([])
  })
  test('risk is relative to the direct dependency count', () => {
    const o = parseNpmOutdated(sample)!
    expect(dependencyRisk(o, 5).level).toBe('HIGH')
    expect(dependencyRisk(o.slice(0, 1), 4).level).toBe('MEDIUM')
    expect(dependencyRisk(o.slice(0, 1), 10).level).toBe('LOW')
    expect(dependencyRisk([], 10).level).toBe('LOW')
  })
  test('the CODEBASE.md section has the Outdated Packages and summary tables', () => {
    const md = renderDepRisk(dependencyRisk(parseNpmOutdated(sample)!, 5))
    expect(md).toContain('**Ecosystem**: Node.js (npm)')
    expect(md).toContain('| Package | Current | Latest | Severity |')
    expect(md).toContain('### Dependency Risk Summary')
    expect(md).toMatch(/\| express \| 4\.\d+\.\d+ \| 5\.\d+\.\d+ \| major/)
  })
  test('without npm the check degrades gracefully', async () => {
    const io = memIo()
    io.run = async () => ({ exitCode: 127, stdout: '', stderr: 'npm: not found' })
    const r = await npmDependencyRisk(io, 3)
    expect(r.skipped).toContain('Dependency currency check skipped')
    expect(renderDepRisk(r)).toContain('skipped')
  })
  test('map build runs npm outdated (exit 1 with JSON is a result) and reports majors', async () => {
    const io = memIo({ 'package.json': JSON.stringify({ name: 'x', dependencies: { express: '^4', lodash: '4' }, devDependencies: { webpack: '4' } }), 'src/a.ts': 'export const a = 1\n' })
    const run = io.run
    const seen: string[][] = []
    io.run = async (argv, o) => { if (argv[0] === 'npm') { seen.push(argv); return { exitCode: 1, stdout: sample, stderr: '' } } return run(argv, o) }
    const out = await mapBuild(io)
    expect(seen).toEqual([['npm', 'outdated', '--json']])
    expect(out).toContain('3 package(s) a major version behind')
    expect(io.files.get('.planning/CODEBASE.md')).toContain('### Outdated Packages')
  })
  // Legion's heavy-dependency and unmaintained-package checks and its
  // pip/bundle/cargo/go ecosystems are not ported: the section says "not
  // checked" for the first two, and only npm is run.
})

const plan = (file: string): PlanInput => ({
  plan: 1, title: 'Plan 1', wave: 1, agents: ['engineering-backend-architect'], depends_on: [], files_modified: [file],
  files_forbidden: ['secrets/'], verification_commands: [`test -f ${file}`], expected_artifacts: [{ path: file, provides: 'code', required: true }],
  truths: ['it works'], objective: `Write ${file}.`, tasks: [{ name: 'write', files: [file], action: `Create ${file}.`, verification: [`test -f ${file}`], done: `${file} exists` }],
  success_criteria: [`${file} exists`],
})
async function builtProject() {
  const io = memIo()
  await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build it', plans: 1 }] } as any)
  await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan('src/a.ts')] })
  await build(io, fakeAgents(io))
  return io
}

describe('parity: observability-summary', () => {
  test('each plan SUMMARY reports the agent token usage', async () => {
    const io = await builtProject()
    const s = io.files.get('.planning/phases/01-core/01-01-SUMMARY.md')!
    expect(s).toContain('## Token Usage')
    expect(s).toContain('1 request')
  })
  test('SUMMARY carries the Agent Selection Rationale; the report the Phase Decision Summary', async () => {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build it', plans: 1 }] } as any)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan('src/a.ts')] })
    const r = await build(io, fakeAgents(io))
    const s = io.files.get('.planning/phases/01-core/01-01-SUMMARY.md')!
    expect(s).toContain('## Agent Selection Rationale')
    expect(s).toContain('| Candidate | Semantic | Heuristic | Memory | Total | Source |')
    for (const f of ['Task type detected', 'Confidence', 'Adapter**: claude-code', 'Model tier**: sonnet']) expect(s).toContain(f)
    expect(r.text).toContain('## Phase Decision Summary')
    expect(r.text).toContain('| Plan | Agent | Confidence | Adapter | Model Tier | Escalations |')
  })
  test('the rationale is omitted for autonomous plans', async () => {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build it', plans: 1 }] } as any)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan('src/a.ts')] })
    const f = '.planning/phases/01-core/01-01-PLAN.md'
    io.files.set(f, io.files.get(f)!.replace('autonomous: false', 'autonomous: true'))
    const r = await build(io, fakeAgents(io))
    expect(io.files.get('.planning/phases/01-core/01-01-SUMMARY.md')!).not.toContain('Agent Selection Rationale')
    expect(r.text).toContain('| Autonomous |')
  })
})

describe('parity: observability-cycle-delta', () => {
  const finding = '### Finding 1\n- **Severity**: major\n- **File**: src/a.ts\n- **Lines**: 1-2\n- **Issue**: no error handling\n- **Confidence**: 90%\n\n**Verdict**: NEEDS WORK'
  test('a two-cycle review records the Cycle Delta', async () => {
    const io = await builtProject()
    const r = await review(io, fakeAgents(io, c => c === 1 ? finding : '**Verdict**: PASS'))
    expect(r.cycles).toBe(2)
    const doc = io.files.get('.planning/phases/01-core/01-REVIEW.md')!
    expect(doc).toContain('## Cycle Delta')
    const delta = doc.slice(doc.indexOf('## Cycle Delta'))
    expect(delta).toContain('- cycle 1: 1 must-fix')
    expect(delta).toContain('- cycle 2: 0 must-fix (resolved 1, new 0, unchanged 0)')
  })
  // Departure: Legion also classed findings as downgraded or upgraded;
  // Triad keeps the re-raised finding's id and takes its new severity.
  test('a single-cycle review omits it', async () => {
    const io = await builtProject()
    await review(io, fakeAgents(io))
    expect(io.files.get('.planning/phases/01-core/01-REVIEW.md')).not.toContain('## Cycle Delta')
  })
})

// intent-review: covered in legion6w3.test.ts (intentFilter and review_phase with an intent).
