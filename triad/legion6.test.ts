import { describe, expect, test } from 'claude-code/testing'
import { fakeAgents, memIo } from './testkit.ts'
import { build } from './hooks/legion/build.ts'
import { review } from './hooks/legion/reviewrun.ts'
import { planWrite, projectInit } from './hooks/legion/handlers.ts'
import { loadSettings } from './hooks/legion/settings.ts'
import { OUTCOMES, agentScores, decayScore, importanceOf, learnList, learnRecall, learnRecord, parseOutcomes, prune, recallOutcomes, storeKnowledge, storeOutcome } from './hooks/legion/memory.ts'
import { milestoneArchive, milestoneComplete, milestoneDefine, milestoneStatus, parseMilestones, validateMilestones } from './hooks/legion/milestone.ts'
import { retroGather, retroSave } from './hooks/legion/retro.ts'
import { runPersonas } from './hooks/legion/personarun.ts'
import { BY_ID, rank } from './hooks/legion/registry.ts'
import { CUSTOM_CATALOG, agentCreate, loadCustomPersonas, validateAgent, type AgentInput } from './hooks/legion/custom.ts'
import { GAP_REPORT, coverage, gapAnalysis, gapSummary, gaps, intentCheck, limitStatus, severityOf, type GapConfig } from './hooks/legion/gaps.ts'
import { REGISTRY, parseRegistry, portfolioAddDep, portfolioDashboard, portfolioRegister, portfolioUnregister } from './hooks/legion/portfolio.ts'
import { ARTIFACTS, freshness, mapBuild, mapNarrate, mapQuery } from './hooks/legion/map.ts'
import type { PlanInput } from './hooks/legion/render.ts'

const settings = loadSettings('{"control_mode":"guarded"}').settings
const row = (id: string, date: string, phase: number, imp: number, agent = 'engineering-backend-architect', outcome = 'success') =>
  `| ${id} | ${date} | main | ${phase} | 0${phase}-01 | ${agent} | implementation | ${outcome} | ${imp} | api | did ${id} |`
const outcomesFile = (...rows: string[]) => `# Memory — Outcome Log\n\n## Records\n\n| ID | Date | Branch | Phase | Plan | Agent | Task Type | Outcome | Importance | Tags | Summary |\n|----|------|--------|-------|------|-------|-----------|---------|------------|------|---------|\n${rows.join('\n')}\n`

const plan = (p: number, wave: number, file: string): PlanInput => ({
  plan: p, title: `Plan ${p}`, wave, agents: ['engineering-backend-architect'], depends_on: [], files_modified: [file],
  files_forbidden: ['secrets/'], verification_commands: [`test -f ${file}`],
  expected_artifacts: [{ path: file, provides: 'code', required: true }], truths: ['it works'],
  objective: `Write ${file}.`, tasks: [{ name: 'write', files: [file], action: `Create ${file} exporting run().`, verification: [`test -f ${file}`], done: `${file} exists` }],
  success_criteria: [`${file} exists`],
} as PlanInput)

async function project(phases = 2) {
  const io = memIo()
  await projectInit(io, { name: 'Demo', description: 'A demo.', phases: Array.from({ length: phases }, (_, i) => ({ name: `P${i + 1}`, goal: `Goal ${i + 1}`, plans: 1 })) } as any)
  return io
}

describe('memory', () => {
  test('stores outcomes with sequential ids, importance and branch', async () => {
    const io = memIo()
    const a = await storeOutcome(io, settings, { phase: 1, plan: '01-01', agent: 'engineering-backend-architect', task_type: 'implementation', outcome: 'success', summary: 'ok' })
    const b = await storeOutcome(io, settings, { phase: 1, plan: '01-02', agent: 'engineering-backend-architect', task_type: 'implementation', outcome: 'failed', summary: 'a | pipe' })
    expect(a!.id).toBe('O-001')
    expect(a!.importance).toBe(3) // success 2 + first time on this task type
    expect(b!.importance).toBe(5)
    const rows = parseOutcomes(io.files.get(OUTCOMES)!)
    expect(rows.map(r => r.id)).toEqual(['O-001', 'O-002'])
    expect(rows[0]!.branch).toBe('main')
    expect(rows[1]!.summary).toBe('a / pipe')
  })

  test('memory.enabled false stores and recalls nothing', async () => {
    const io = memIo()
    const off = loadSettings('{"control_mode":"guarded","memory":{"enabled":false}}').settings
    expect(await storeOutcome(io, off, { phase: 1, plan: '01-01', agent: 'x', task_type: 'y', outcome: 'success', summary: '' })).toBeUndefined()
    expect(io.files.has(OUTCOMES)).toBe(false)
  })

  test('importance rules', () => {
    expect(importanceOf({ outcome: 'success' })).toBe(2)
    expect(importanceOf({ outcome: 'success', cycles: 2 })).toBe(3)
    expect(importanceOf({ outcome: 'partial', escalated: true, blockers: 4, crossDivision: true })).toBe(5)
  })

  test('decay recall excludes faded records and ranks by decay', async () => {
    const io = memIo({ [OUTCOMES]: outcomesFile(row('O-001', '2026-10-05', 1, 2), row('O-002', '2026-01-01', 1, 1), row('O-003', '2026-09-20', 1, 5)) })
    const now = io.now()
    expect(Math.round(decayScore(parseOutcomes(io.files.get(OUTCOMES)!)[1]!, now) * 100)).toBe(10)
    const r = await recallOutcomes(io, settings)
    expect(r.records.map(o => o.id)).toEqual(['O-003', 'O-001']) // 5*0.7=3.5, 2*1=2; O-002 below 0.2
  })

  test('agent scores need two records', async () => {
    const io = memIo({ [OUTCOMES]: outcomesFile(row('O-001', '2026-10-05', 1, 2), row('O-002', '2026-10-06', 1, 2), row('O-003', '2026-10-06', 1, 2, 'testing-api-tester')) })
    const s = await agentScores(io, settings, ['implementation'])
    expect(Object.keys(s)).toEqual(['engineering-backend-architect'])
    expect(s['engineering-backend-architect']).toBe(4) // (1*3 + 2*0.5) * 1
  })

  test('prune archives old low-importance rows outside the current phase, keeps the rest', async () => {
    const io = memIo({
      '.planning/STATE.md': '- **Phase**: 3 of 4\n',
      [OUTCOMES]: outcomesFile(row('O-001', '2026-01-01', 1, 2), row('O-002', '2026-01-01', 1, 4), row('O-003', '2026-01-01', 3, 1), row('O-004', '2026-10-01', 2, 1)),
    })
    const r = await prune(io, settings)
    expect(r).toContain('Pruned 1 records')
    expect(parseOutcomes(io.files.get(OUTCOMES)!).map(o => o.id)).toEqual(['O-002', 'O-003', 'O-004'])
    expect(parseOutcomes(io.files.get('.planning/memory/ARCHIVE.md')!).map(o => o.id)).toEqual(['O-001'])
    expect(await prune(io, settings)).toContain('No records eligible')
  })

  test('learn record, recall and list; ids never reused; tables and entries coexist', async () => {
    const io = memIo()
    expect(await learnRecall(io, settings, 'x')).toContain('No memory directory')
    await learnRecord(io, { type: 'pitfall', summary: 'Never run migrations outside a transaction', tags: ['migrations', 'database'], text: 'Wrap migrations in BEGIN/COMMIT.' })
    await learnRecord(io, { type: 'pitfall', summary: 'Avoid global state', tags: ['state'], text: 'Use DI.' })
    await storeKnowledge(io, settings, 'error', ['ImportError: cycle', 'move the import', 'engineering-backend-architect', 'false', 'python'])
    const errors = io.files.get('.planning/memory/ERRORS.md')!
    expect(errors).toContain('## PIT-001: Never run migrations')
    expect(errors).toContain('## PIT-002: Avoid global state')
    expect(errors).toMatch(/\| E-001 \| 2026-10-08 \| main \| ImportError: cycle/)
    // An unresolved error with the same signature is resolved in place.
    expect(await storeKnowledge(io, settings, 'error', ['ImportError: cycle', 'lazy import', 'x', 'true', 'python'])).toBe('E-001')
    expect(io.files.get('.planning/memory/ERRORS.md')).toMatch(/E-001 .*lazy import .*\| true \|/)
    const recall = await learnRecall(io, settings, 'migrations')
    expect(recall).toContain('**PIT-001** (pitfall)')
    expect(recall).not.toContain('PIT-002')
    const list = await learnList(io)
    expect(list).toContain('## Pitfalls (2)')
    expect(list).toContain('**Total**: 2 learnings recorded')
  })
})

describe('milestones', () => {
  test('validation catches gaps, overlaps and out-of-range phases', () => {
    const m = (n: number, start: number, end: number) => ({ n, name: `M${n}`, start, end, goal: '', status: 'Pending' })
    expect(validateMilestones([m(1, 1, 2), m(2, 3, 4)], 4)).toEqual([])
    expect(validateMilestones([m(1, 1, 1), m(2, 3, 4)], 4)[0]).toContain('Phases 2-2 are not covered')
    expect(validateMilestones([m(1, 1, 3), m(2, 3, 4)], 4)[0]).toContain('Phase 3 is covered by both Milestone 1 and Milestone 2')
    expect(validateMilestones([m(1, 1, 5)], 4)[0]).toContain('only Phases 1-4 exist')
  })

  test('define, complete and archive a milestone', async () => {
    const io = await project(2)
    expect(await milestoneStatus(io)).toContain('No milestones defined yet')
    expect(await milestoneDefine(io, [{ name: 'MVP', start: 1, end: 1, goal: 'Core' }])).toContain('not covered')
    expect(await milestoneDefine(io, [{ name: 'MVP', start: 1, end: 1, goal: 'Core' }, { name: 'Launch', start: 2, end: 2, goal: 'Ship' }])).toContain('2 milestones')
    const roadmap = io.files.get('.planning/ROADMAP.md')!
    expect(roadmap.indexOf('## Milestones')).toBeLessThan(roadmap.indexOf('## Progress'))
    expect(parseMilestones(roadmap).map(m => m.status)).toEqual(['Pending', 'Pending'])
    expect(await milestoneComplete(io, 1, {})).toContain('Cannot complete Milestone 1')
    // Finish phase 1.
    await planWrite(io, { phase: 1, context: { goal: 'g' }, plans: [plan(1, 1, 'src/a.ts')] })
    await build(io, fakeAgents(io), {})
    await review(io, fakeAgents(io), {})
    expect(await milestoneStatus(io)).toMatch(/\| 1 \| MVP \| 1-1 \| \[##########\] 100% \| Complete \(2026-10-08\) \|/)
    const done = await milestoneComplete(io, 1, { deliverables: { 1: 'the core' }, decisions: ['use TS'] })
    expect(done).toContain('Complete!')
    const summary = io.files.get('.planning/milestones/MILESTONE-1.md')!
    expect(summary).toContain('| 1 | P1 | 1/1 | the core |')
    expect(summary).toContain('- src/a.ts')
    expect(io.files.get('.planning/STATE.md')).toContain('- Milestone 1: MVP — Complete (2026-10-08)')
    expect(io.commits.at(-1)).toMatch(/^chore\(triad\): complete milestone 1 — MVP/)
    const arch = await milestoneArchive(io, 1)
    expect(arch).toContain('Archived!')
    expect([...io.files.keys()].some(k => k.startsWith('.planning/archive/milestone-1/01-p1/'))).toBe(true)
    expect([...io.files.keys()].some(k => k.startsWith('.planning/phases/01-'))).toBe(false)
    expect(io.files.get('.planning/ROADMAP.md')).toContain('Complete (Archived)')
    expect(io.files.get('.planning/STATE.md')).toContain('— Archived (2026-10-08)')
    expect(await milestoneArchive(io, 1)).toContain('already archived')
  })
})

describe('build and review write memory; retro reads it', () => {
  test('outcomes from build and review, a first-pass pattern, then a retro', async () => {
    const io = await project(1)
    await planWrite(io, { phase: 1, context: { goal: 'g' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/b.ts')] })
    expect(await retroGather(io, {})).toContain('No completed phase yet')
    await build(io, fakeAgents(io), {})
    const afterBuild = parseOutcomes(io.files.get(OUTCOMES)!)
    expect(afterBuild.map(o => [o.plan, o.outcome, o.task_type])).toEqual([['01-01', 'success', 'implementation'], ['01-02', 'success', 'implementation']])
    await review(io, fakeAgents(io), {})
    const all = parseOutcomes(io.files.get(OUTCOMES)!)
    expect(all.filter(o => o.task_type === 'quality-review').length).toBeGreaterThan(0)
    expect(io.files.get('.planning/memory/PATTERNS.md')).toContain('passed review in one cycle')
    expect(io.files.get('.planning/memory/PREFERENCES.md')).toMatch(/review-verdict .* positive/)
    const g = await retroGather(io, {})
    expect(g).toContain('Scope: Phase 1')
    expect(g).toContain('- Plans completed: 2')
    expect(g).toContain('- Review pass rate: 1/1 (100%)')
    expect(await retroSave(io, { scope: 'Phase 1: P1', findings: 'went well', action_items: '| 1 | keep | High | 01-01 |', metrics: '- Plans completed: 2' })).toContain('RETRO.md')
    expect(io.files.get('.planning/memory/RETRO.md')).toContain('## Phase 1: P1 — 2026-10-08')
  })
})

describe('persona_run', () => {
  test('runs personas read-only by default, reports unknown ones', async () => {
    const io = memIo()
    const seen: any[] = []
    const agents = { ...fakeAgents(io), async run(o: any) { seen.push(o); return { agentId: 'x', answer: 'advice' } } }
    const r = await runPersonas(io, agents as any, { runs: [{ agent: 'engineering-security-engineer', brief: 'Is this safe?' }, { agent: 'nobody-here', brief: 'x' }] })
    expect(r[0]!.answer).toBe('advice')
    expect(r[1]!.error).toContain('unknown persona')
    expect(seen[0].scope).toMatchObject({ mode: 'surgical', files_modified: [] })
    expect(seen[0].brief).toContain('read-only')
    const w = await runPersonas(io, agents as any, { read_only: false, runs: [{ agent: 'product-technical-writer', brief: 'docs', writable: ['README.md'] }] })
    expect(w[0]!.error).toBeUndefined()
    expect(seen[1].scope.files_modified).toEqual(['README.md'])
  })
})

describe('map', () => {
  const src = () => memIo({
    'package.json': JSON.stringify({ name: 'shop', main: 'src/index.ts', dependencies: { express: '^4' }, devDependencies: { vitest: '^1' } }),
    'src/index.ts': "import { orders } from './orders'\nimport express from 'express'\nconst app = express()\napp.get('/orders', orders)\nexport function start() { return process.env.API_TOKEN }\n",
    'src/orders.ts': "// TODO: paginate\nexport function orders() { return [] }\nexport class OrderStore {}\n",
    'src/orders.test.ts': "import { orders } from './orders'\n",
    'README.md': '# shop\n',
  })

  test('build writes every artifact and query ranks by path and symbol', async () => {
    const io = src()
    const out = await mapBuild(io)
    expect(out).toContain('Codebase map generated')
    for (const a of ARTIFACTS) expect(io.files.has(a)).toBe(true)
    const cb = io.files.get('.planning/CODEBASE.md')!
    expect(cb).toContain('**Map Schema Version:** 2.0')
    expect(cb).toContain('API_TOKEN')
    expect(cb).toContain('_Pending:')
    const q = await mapQuery(io, 'OrderStore')
    expect(q).toContain('src/orders.ts')
    expect((await freshness(io)).status).toBe('fresh')
  })

  test('narrate fills sections and a refresh keeps them; changed source goes stale', async () => {
    const io = src()
    await mapBuild(io)
    const n = await mapNarrate(io, { 'Architecture Overview': 'An express app.', Confidence: 'HIGH' })
    expect(n).toContain('Wrote Architecture Overview, Confidence')
    io.files.set('src/orders.ts', io.files.get('src/orders.ts')! + 'export const x = 1\n')
    expect((await freshness(io)).status).toBe('stale')
    const out = await mapBuild(io)
    expect(out).toContain('refreshed')
    expect(io.files.get('.planning/CODEBASE.md')).toContain('An express app.')
  })

  test('no source code means no map; bad scope is refused', async () => {
    expect(await mapBuild(memIo({ 'notes.txt': 'hi' }))).toContain('No source code detected')
    expect(await mapBuild(src(), { scope: '../x' })).toContain('--scope must be a path inside the project')
  })
})

const agentBody = (name: string) => [
  `# ${name} Agent Personality`, '', `You are **${name}**, a specialist in data pipelines.`, '',
  ...['Your Identity & Memory', 'Your Core Mission', 'Critical Rules You Must Follow', 'Your Technical Deliverables', 'Your Workflow Process', 'Your Communication Style', 'Learning & Memory', 'Your Success Metrics', 'Anti-Patterns', 'Done Criteria']
    .flatMap(h => [`## ${h}`, ...Array.from({ length: 7 }, (_, i) => `- ${h} point ${i + 1}: specific guidance for pipeline work.`), '']),
].join('\n')
const agentIn = (over: Partial<AgentInput> = {}): AgentInput => ({
  id: 'engineering-pipeline-specialist', name: 'Pipeline Specialist', description: 'Builds and hardens ETL data pipelines', division: 'Engineering', color: 'blue',
  languages: ['python', 'sql'], frameworks: ['airflow'], artifact_types: ['code', 'dags'], review_strengths: ['data-quality'], tags: ['etl', 'data-pipelines', 'scheduling'], body: agentBody('Pipeline Specialist'), ...over,
})

describe('custom agents', () => {
  test('validation lists every failure and writes nothing', async () => {
    const io = await project(1)
    const bad = agentIn({ id: 'engineering-senior-developer', color: 'teal', division: 'Ops', description: 'short', body: '# x\nno sections', languages: [] })
    const errs = await validateAgent(io, bad)
    for (const k of ['1 name', '3 description', '4 color', '5 division', '6 body length', '8 name in body', 'contract: missing a ## Identity', 'contract: languages']) expect(errs.some(e => e.startsWith(k))).toBe(true)
    expect(await validateAgent(io, agentIn({ id: 'Bad_Name' }))).toContain("2 name format: 'Bad_Name' must match ^[a-z][a-z0-9-]+$ (kebab-case, starting with a letter).")
    expect(await agentCreate(io, bad)).toContain('Validation failed (nothing was written)')
    expect([...io.files.keys()].some(k => k.startsWith('.planning/agents/'))).toBe(false)
  })

  test('create writes the persona and catalog, registers it, records and commits', async () => {
    const io = await project(1)
    const out = await agentCreate(io, agentIn())
    expect(out).toContain("Your new agent 'engineering-pipeline-specialist' is ready")
    expect(io.files.get('.planning/agents/engineering-pipeline-specialist.md')).toContain('division: "Engineering"')
    expect(io.files.get(CUSTOM_CATALOG)).toContain('| engineering-pipeline-specialist | `.planning/agents/engineering-pipeline-specialist.md` | Engineering |')
    expect(io.files.get('.planning/STATE.md')).toContain('Added custom agent engineering-pipeline-specialist')
    expect(io.commits.at(-1)).toContain('feat(triad): add custom agent engineering-pipeline-specialist')
    expect(BY_ID.get('engineering-pipeline-specialist')?.tier).toBe('sonnet')
    expect(rank('etl data-pipelines airflow')[0]!.persona.id).toBe('engineering-pipeline-specialist')
    expect((await validateAgent(io, agentIn()))[0]).toContain('already taken by `.planning/agents/engineering-pipeline-specialist.md`')
    expect(await loadCustomPersonas(io)).toEqual(['engineering-pipeline-specialist'])
    expect(await agentCreate(io, agentIn({ id: 'engineering-other' }), { limit: { count: 50, limit: 50, suggestions: ['remove x'] } })).toContain('The roster is at its agent limit (50 of 50)')
  })
})

describe('roster gaps', () => {
  const cfg = (): GapConfig => ({
    agent_limit: 3,
    role_categories: {
      sec: { priority: 'critical', roles: { security_engineer: { required_capabilities: ['owasp_top_10', 'threat_modeling'], coverage_indicators: ['engineering-security-engineer'] } } },
      fun: { priority: 'nice_to_have', roles: { mascot_designer: { required_capabilities: ['zzz_mascots', 'qqq_plushies'] } } },
    },
    scoring: { full_coverage: 1, partial_coverage: 0.5, minimal_coverage: 0.2, no_coverage: 0, weight_by_role_count: { single_agent: 1, two_agents: 1.2, three_or_more: 1.3 } },
    severity: { critical: { min_gap_score: 0.8 }, high: { min_gap_score: 0.5 }, medium: { min_gap_score: 0.3 }, low: { min_gap_score: 0 } },
    intent_teams_to_check: { harden: { required_agents: ['nobody-here', 'engineering-security-engineer'] } },
    replacement_candidates: { overlapping: [{ agent_id: 'b', reason: 'dup', replacement_difficulty: 'medium' }], low_usage: [{ agent_id: 'a', reason: 'niche', replacement_difficulty: 'low' }] },
  })
  const P = (id: string, extra: string[]) => ({ id, name: id, description: '', division: 'Engineering', tier: 'sonnet', languages: [], frameworks: [], artifact_types: extra, review_strengths: [], core: '' }) as any

  test('coverage, weights, severity with priority shift, recommendations', () => {
    const cov = coverage(cfg(), [P('engineering-security-engineer', ['owasp-top-10']), P('x-threat', ['threat-modeling', 'owasp-top-10'])])
    const sec = cov.find(c => c.role === 'security_engineer')!
    expect(sec.agents.map(a => `${a.id}:${a.strength}`)).toEqual(['x-threat:full', 'engineering-security-engineer:partial'])
    expect(sec.pct).toBe(100) // (1 + 0.5) * 1.2, capped
    const g = gaps(cfg(), cov)
    expect(g.map(x => `${x.role} ${x.severity} ${x.recommendation}`)).toEqual(['mascot_designer high create_agent']) // critical lowered one level
    expect(severityOf(0.6, 'critical', cfg())).toBe('critical')
    expect(severityOf(0.1, 'important', cfg())).toBe('low')
  })

  test('intents, limit status and suggestions', () => {
    const i = intentCheck(cfg(), new Set(['engineering-security-engineer']))
    expect(i.invalid[0]).toEqual({ intent: 'harden', missing: ['nobody-here'], impact: 'CRITICAL: primary agent missing' })
    expect(limitStatus(cfg(), 3).status).toBe('AT_LIMIT')
    const over = limitStatus(cfg(), 5)
    expect([over.status, over.overage, over.level]).toEqual(['EXCEEDED', 2, 'warning'])
    expect(over.suggestions).toEqual(['remove a (niche; effort low)', 'consolidate b (dup; effort medium)'])
  })

  test('gapAnalysis writes the report with the bundled config and asks before overwriting', async () => {
    const io = await project(1)
    const out = await gapAnalysis(io)
    expect(out).toContain('Wrote .planning/gap-report.md')
    expect(io.files.get(GAP_REPORT)).toContain('# Roster Gap Analysis Report')
    expect(await gapAnalysis(io)).toContain('already exists')
    expect(await gapSummary(io)).toContain('Roster gaps (2026-10-08)')
  })
})

describe('portfolio', () => {
  const projectAt = async (root: string, name: string, done: number) => {
    const io = memIo()
    ;(io as any).root = root
    await projectInit(io, { name, description: `${name} app.`, phases: [{ name: 'A', goal: 'g', plans: 2 }, { name: 'B', goal: 'g', plans: 2 }] } as any)
    if (done) io.files.set('.planning/ROADMAP.md', io.files.get('.planning/ROADMAP.md')!.replace(/\| 1 \| (.*?)\| 0\/2 \|.*$/m, m => m.replace('0/2', '2/2')).replace(/^(\|\s*1\s*\|.*)\|\s*Not started\s*\|/m, '$1| Complete |'))
    io.files.set('.planning/phases/01-a/CONTEXT.md', 'Agents: engineering-backend-architect, testing-qa-verification-specialist')
    return io
  }

  test('register, dashboard with dependencies and allocation, stale projects, unregister', async () => {
    const reg = memIo()
    const a = await projectAt('/p/alpha', 'Alpha', 1)
    const b = await projectAt('/p/beta', 'Beta', 0)
    const at = (root: string) => (root === '/p/alpha' ? a : root === '/p/beta' ? b : memIo())
    expect(await portfolioDashboard(reg, at)).toContain('No portfolio registry found')
    expect(await portfolioRegister(reg, a)).toContain('Registered Alpha')
    await portfolioRegister(reg, b)
    const r = parseRegistry(reg.files.get(REGISTRY)!)
    expect(r.projects.map(p => p.name)).toEqual(['Alpha', 'Beta'])
    expect(await portfolioRegister(reg, await projectAt('/p/alpha-v2', 'Alpha', 0))).toContain('Registered Alpha (alpha-v2)')
    await portfolioUnregister(reg, '/p/alpha-v2')
    expect(await portfolioAddDep(reg, at, { from: 'Alpha', from_phase: 9, to: 'Beta', to_phase: 1, type: 'blocks' })).toBe('Alpha has no Phase 9 in its ROADMAP.md.')
    expect(await portfolioAddDep(reg, at, { from: 'Beta', from_phase: 1, to: 'Alpha', to_phase: 2, type: 'blocks' })).toBe('Dependency DEP-01 added: Beta:Phase 1 blocks Alpha:Phase 2')
    const d = await portfolioDashboard(reg, at)
    expect(d).toContain('**2 active projects** | 2 registered')
    expect(d).toContain('| DEP-01 | Beta:Phase 1 | Alpha:Phase 2 | Blocking | Alpha Phase 2 is waiting on Beta Phase 1 |')
    expect(d).toContain('| engineering-backend-architect | Engineering | Alpha, Beta |')
    reg.files.set(REGISTRY, reg.files.get(REGISTRY)!.replace('/p/beta', '/p/gone'))
    const d2 = await portfolioDashboard(reg, at)
    expect(d2).toContain('Project directory not found at /p/gone')
    expect(reg.files.get(REGISTRY)).toContain('- **Status**: Stale')
    expect(await portfolioUnregister(reg, 'Beta')).toBe('Unregistered Beta; removed 1 dependency row(s).')
  })
})
