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
import { GATE_DIR, GATE_SCRIPT, renderCanary, shipCheck, shipPublish } from './hooks/legion/ship.ts'
import { ghClosePhase, ghMode, ghPhaseIssue, ghTickPlan, setGhMode } from './hooks/legion/github.ts'
import { secretScan, securitySave, securityScan, securityTrigger, verdictOf } from './hooks/legion/security.ts'
import { polishRun, polishScope } from './hooks/legion/polish.ts'
import { CRITICAL_AUDIT, preBuildCheck, preShipAudit } from './hooks/legion/gates.ts'
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

// Wrap an io's run: `fake` answers first; undefined falls through.
function withRun(io: ReturnType<typeof memIo>, fake: (argv: string[]) => { exitCode: number; stdout: string; stderr?: string } | undefined) {
  const orig = io.run
  const calls: string[][] = []
  io.run = async (argv, o) => { calls.push(argv); const r = fake(argv); return r ? { stderr: '', ...r } : orig(argv, o) }
  return calls
}

// What `bash .triad/ship-gate/run.sh` does, through the io: each command's exit code and output.
async function runGate(io: ReturnType<typeof memIo>, code?: (cmd: string) => number) {
  const meta = JSON.parse(io.files.get(`${GATE_DIR}/meta.json`)!)
  for (const [i, c] of meta.commands.entries()) {
    const r = await io.run(['bash', '-c', c.command])
    io.files.set(`${GATE_DIR}/out/${i + 1}.exit`, `${code ? code(c.command) : r.exitCode}\n`)
    io.files.set(`${GATE_DIR}/out/${i + 1}.log`, `ran ${c.command}\n`)
  }
  return meta.commands.map((c: any) => c.command)
}

async function shippable() {
  const io = await project(1)
  await planWrite(io, { phase: 1, context: { goal: 'g' }, plans: [plan(1, 1, 'src/a.ts')] })
  await build(io, fakeAgents(io), {})
  return io
}

describe('ship', () => {
  test('refuses an unreviewed phase; the gate names what fails', async () => {
    const io = await shippable()
    expect(await shipCheck(io, {})).toContain('Phase 1 has not passed review yet')
    const g = await shipCheck(io, { phase: 1 })
    expect(g).toContain('| Review passed | FAIL |')
    expect(g).toContain('GATE FAIL: No review found. Run /triad:review before shipping.')
    expect(g).toContain('| Verification commands | Not run |')
    expect(g).toContain('**Result**: 4 of 6 gates passed')
    expect(g).toContain('The verification commands and tests did not run: the gates above fail first.')
    expect(g).toContain('Ship blocked — resolve the above issues and re-run /triad:ship.')
  })

  test('dry run writes nothing; check writes the report; publish marks shipped and commits', async () => {
    const io = await shippable()
    await review(io, fakeAgents(io), {})
    io.files.set('package.json', JSON.stringify({ scripts: { test: 'vitest run' } })) // detected as `npm test`
    io.dirty.clear()
    const origRun = io.run
    // The gate's commands run in a script the session starts with Bash, never inside the tool call.
    const first = await shipCheck(io, { dry_run: true })
    expect(first).toContain('GATE RUN NEEDED: run `bash .triad/ship-gate/run.sh` with the Bash tool and run_in_background true')
    expect(first).toContain('1. `test -f src/a.ts` (plan 01-01)')
    expect(first).toContain('2. `npm test` (test suite)')
    expect(io.files.get(GATE_SCRIPT)).toContain('bash "$D/cmd/$i.sh" > "$D/out/$i.log" 2>&1; code=$?')
    expect(io.files.get(`${GATE_DIR}/cmd/2.sh`)).toBe('npm test\n')
    // Still running: check waits for it and leaves its files alone.
    io.files.set(`${GATE_DIR}/out/running`, '4242\n')
    io.files.set(`${GATE_DIR}/out/1.exit`, '0\n')
    const live = withRun(io, a => (a[2] === 'kill -0 4242' ? { exitCode: 0, stdout: '' } : undefined))
    expect(await shipCheck(io, { dry_run: true })).toContain('GATE RUN IN PROGRESS: 1 of 2 command(s) finished.')
    expect(live).toContainEqual(['bash', '-c', 'kill -0 4242'])
    expect(io.files.get(`${GATE_DIR}/out/1.exit`)).toBe('0\n')
    // Cut short (a restart: the pid is gone): the first command recorded, the suite not; check asks for the run again.
    live.length = 0
    io.run = (async (argv: string[], o: any) => (argv[2] === 'kill -0 4242' ? { exitCode: 1, stdout: '', stderr: 'no such process' } : origRun(argv, o))) as any
    expect(await shipCheck(io, { dry_run: true })).toContain('The gate commands did not finish on this commit (the run was cut short)')
    // The suite fails: the gate says so with its output.
    await runGate(io, c => (c === 'npm test' ? 1 : 0))
    const red = await shipCheck(io, { dry_run: true })
    expect(red).toContain('| Tests pass | FAIL |')
    expect(red).toContain('ran npm test')
    await runGate(io)
    const dry = await shipCheck(io, { dry_run: true })
    expect(dry).toContain('DRY RUN — ship checks will run but no PRs, pushes, or state changes will be made')
    expect(dry).toContain('**Result**: 6 of 6 gates passed')
    expect([...io.files.keys()].some(k => k.endsWith('SHIP-REPORT.md'))).toBe(false)
    expect(await shipCheck(io, {})).toContain('Wrote .planning/phases/01-p1/SHIP-REPORT.md')
    const rep = io.files.get('.planning/phases/01-p1/SHIP-REPORT.md')!
    expect(rep).toContain('gate_result: PASSED')
    expect(rep).toContain('| 01-01 | engineering-backend-architect | Completed | 1 |')
    // Publish reuses the runs on this commit: nothing runs again.
    const calls = withRun(io, () => undefined)
    const out = await shipPublish(io, { method: 'mark' })
    expect(calls.filter(a => a[0] === 'bash')).toEqual([])
    expect(out).toContain('Phase 1: P1 — Shipped!')
    expect(io.files.get('.planning/phases/01-p1/SHIP-REPORT.md')).toContain('- **Command**: `npm test` — passed')
    expect(io.files.get('.planning/ROADMAP.md')).toMatch(/\|\s*1\s*\|.*Shipped/)
    expect(io.commits.at(-1)).toMatch(/^chore\(triad\): ship phase 1 — P1\n\nAll quality gates passed\. 1 plans shipped\.\nPR: N\/A/)
  })

  test('publish as a PR: branch, push, labels, gh pr create with the body file, PR recorded', async () => {
    const io = await shippable()
    await review(io, fakeAgents(io), {})
    await shipCheck(io, {})
    await runGate(io)
    let open = ''
    const calls = withRun(io, a => {
      if (a[0] === 'gh' && a[1] === 'pr' && a[2] === 'list') return { exitCode: 0, stdout: open }
      if (a[0] === 'gh' && a[1] === 'auth') return { exitCode: 0, stdout: '' }
      if (a[0] === 'git' && a[1] === 'remote') return { exitCode: 0, stdout: 'git@x:o/r.git' }
      if (a[0] === 'gh' && a[1] === 'repo') return { exitCode: 0, stdout: 'o/r main\n' }
      if (a[0] === 'git' && a[1] === 'branch') return { exitCode: 0, stdout: 'main\n' }
      if (a[0] === 'gh' && a[1] === 'pr') return { exitCode: 0, stdout: 'https://github.com/o/r/pull/7\n' }
      return a[0] === 'gh' || (a[0] === 'git' && ['push', 'checkout'].includes(a[1]!)) ? { exitCode: 0, stdout: '' } : undefined
    })
    const out = await shipPublish(io, { method: 'pr' })
    expect(out).toContain('Created branch triad/phase-01-p1.')
    expect(out).toContain('PR: https://github.com/o/r/pull/7')
    const pr = calls.find(a => a[0] === 'gh' && a[1] === 'pr' && a[2] === 'create')!
    expect(pr).toEqual(['gh', 'pr', 'create', '--title', 'Phase 01: P1', '--body-file', '.triad/pr-body.md', '--base', 'main', '--head', 'triad/phase-01-p1', '--label', 'triad-ship', '--label', 'phase-01', '--assignee', '@me'])
    expect(io.files.get('.triad/pr-body.md')).toContain('*Created by Triad*')
    expect(calls.some(a => a.join(' ') === 'git push --force')).toBe(false)
    expect(io.files.get('.planning/STATE.md')).toContain('| Phase 1: P1 | — | #7 | Open |')
    // Run again after a restart: the open PR is found, not created twice.
    open = 'https://github.com/o/r/pull/7\n'
    const again = await shipPublish(io, { method: 'pr' })
    expect(again).toContain('PR already open: https://github.com/o/r/pull/7')
    expect(calls.filter(a => a[0] === 'gh' && a[1] === 'pr' && a[2] === 'create').length).toBe(1)
  })

  test('canary statuses', () => {
    expect(renderCanary('5 min', { status: 'REGRESSION', passed: 1, total: 2, regressions: ['npm test'] }, 'abc123')).toContain('Run `git revert abc123` to roll back. Automatic rollback disabled for safety.')
    expect(renderCanary('1 min', { status: 'HEALTHY', passed: 2, total: 2, regressions: [] }, 'abc')).toContain('**Verification**: 2/2 commands passed')
  })
})

describe('github sync', () => {
  test('issue, checklist tick, close; STATE ## GitHub stays last', async () => {
    const io = await shippable()
    let body = ''
    const calls = withRun(io, a => {
      if (a[0] === 'gh' && a[1] === 'auth') return { exitCode: 0, stdout: '' }
      if (a[0] === 'git' && a[1] === 'remote') return { exitCode: 0, stdout: 'x' }
      if (a[0] === 'gh' && a[1] === 'repo') return { exitCode: 0, stdout: 'o/r main' }
      if (a[0] === 'gh' && a[1] === 'issue' && a[2] === 'create') { body = a[a.indexOf('--body') + 1]!; return { exitCode: 0, stdout: 'https://github.com/o/r/issues/12\n' } }
      if (a[0] === 'gh' && a[1] === 'issue' && a[2] === 'view') return { exitCode: 0, stdout: body }
      if (a[0] === 'gh' && a[1] === 'issue' && a[2] === 'edit') { body = a[a.indexOf('--body') + 1]!; return { exitCode: 0, stdout: '' } }
      return a[0] === 'gh' ? { exitCode: 0, stdout: '' } : undefined
    })
    expect(await ghPhaseIssue(io, 1)).toContain('Created issue #12 for Phase 1')
    expect(body).toContain('- [ ] Plan 01-01:')
    expect(body).toContain('*Created by Triad*')
    expect(calls.some(a => a.join(' ').startsWith('gh label create triad --description Created by Triad --color 7B68EE'))).toBe(true)
    expect(await ghTickPlan(io, 1, '01-01')).toBe('Ticked Plan 01-01 on #12')
    expect(body).toContain('- [x] Plan 01-01:')
    expect(await ghClosePhase(io, 1, { plans: 1, requirements: '', result: 'pass' })).toContain('Closed #12')
    const state = io.files.get('.planning/STATE.md')!
    expect(state).toContain('| Phase 1: P1 | #12 | — | Closed |')
    expect(state.trimEnd().split('\n').slice(-1)[0]).toBe('| Phase 1: P1 | #12 | — | Closed |')
    expect(await ghPhaseIssue(io, 1)).toBe('Phase 1 already has issue #12.')
  })

  test('without gh it skips quietly; the mode lives in settings.json', async () => {
    const io = await shippable()
    withRun(io, a => (a[0] === 'gh' ? { exitCode: 1, stdout: '', stderr: 'not logged in' } : undefined))
    expect(await ghPhaseIssue(io, 1)).toBe('GitHub sync skipped: Run `gh auth login` to enable GitHub integration.')
    expect(await ghMode(io)).toBe('prompt')
    await setGhMode(io, 'enabled')
    expect(await ghMode(io)).toBe('enabled')
  })
})

describe('security review', () => {
  test('secrets are redacted, the verdict fails on a critical, and ship is blocked', async () => {
    const io = await shippable()
    io.files.set('src/a.ts', "const k = 'AKIAABCDEFGHIJKLMNOP'\nconst host = '10.1.2.3:8080'\n")
    const s = await secretScan(io, ['src/a.ts'])
    expect(s.map(x => `${x.severity} ${x.files} ${x.finding}`)).toEqual(['CRITICAL src/a.ts:1 AWS access key: AKIAABCD…MNOP', 'LOW src/a.ts:2 IP:port: 10.1.2.3…8080'])
    expect(securityTrigger(['src/auth/session.ts', 'docs/readme.md'], {})).toEqual(['src/auth/session.ts: security-sensitive path'])
    await review(io, fakeAgents(io), {})
    expect(await securityScan(io, {})).toContain('Secrets: 2 match(es)')
    const out = await securitySave(io, { owasp: '- A1 Injection: PASS', findings: [{ severity: 'HIGH', category: 'A7:XSS', finding: 'unescaped html', files: 'src/a.ts:9', remediation: 'escape' }], false_positives: ['src/a.ts:2'] })
    expect(out).toContain('verdict FAIL')
    expect(out).toContain('[VERDICT-OVERRIDE] critical secret')
    const doc = io.files.get('.planning/phases/01-p1/SECURITY-REVIEW.md')!
    expect(doc).toContain('| SEC-001 | Secret | CRITICAL |')
    expect(doc).toContain('| SEC-002 | A7:XSS | HIGH | unescaped html |')
    expect(doc).not.toContain('10.1.2.3')
    expect(io.files.get('.planning/phases/01-p1/01-REVIEW.md')).toContain('## Security Review')
    expect(await shipCheck(io, { phase: 1 })).toContain('GATE FAIL: 2 unresolved blockers in review.')
    expect(verdictOf([{ severity: 'HIGH', category: 'x', finding: 'y', files: 'z', remediation: 'r' }]).verdict).toBe('CAUTION')
  })
})

describe('polish', () => {
  const polishAgents = (io: ReturnType<typeof memIo>, edits: Record<string, string>): any => ({
    maxParallel: 2,
    async run({ scope }: any) {
      for (const f of scope.files_modified) if (edits[f] !== undefined) await io.write(f, edits[f]!)
      return { agentId: 'p1', answer: 'PASS1 | src/a.ts:1 | CLEAN | "// set x" | restates-code\nPASS2 | src/b.ts:1-3 | FLAG | "extract" | extract-function\n\n## Flagged\nEXTRACT | src/b.ts | 1-3 | long fn | extract-function | split it\n\n## Files Modified\n- src/a.ts' }
    },
    followUp: async () => '', writesOf: () => ({ files: [], warnings: [] }), usageOf: () => '',
  })

  test('scope adds one level of importers and excludes generated files', async () => {
    const io = memIo({ 'src/alpha.ts': 'export const a = 1\n', 'src/beta.ts': "import { a } from './alpha'\n", 'src/gamma.ts': "import { b } from './beta'\n", 'dist/alpha.js': '' })
    const sc = await polishScope(io, { target: 'src/alpha.ts' })
    expect(sc.files).toEqual(['src/alpha.ts', 'src/beta.ts'])
    expect((await polishScope(io, { target: 'src/alpha.ts', scope: 'changed' })).files).toEqual(['src/alpha.ts'])
    expect((await polishScope(io, {})).error).toContain('Cannot auto-detect scope')
  })

  test('a regression reverts the culprit file only; the rest is committed', async () => {
    const io = memIo({ 'settings.json': JSON.stringify({ execution: { auto_commit: true }, polish: { test_command: 'check' } }), 'src/a.ts': '// set x\nexport const a = 1\n', 'src/b.ts': 'export const b = 2\n' })
    withRun(io, a => (a[0] === 'bash' && a[2] === 'check' ? { exitCode: (io.files.get('src/b.ts') ?? '').includes('BROKEN') ? 1 : 0, stdout: '' } : undefined))
    const r: any = await polishRun(io, polishAgents(io, { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'BROKEN\n' }), { files: ['src/a.ts', 'src/b.ts'], target: 'src', save: true })
    expect(r.reverted).toEqual(['src/b.ts'])
    expect(r.changed).toEqual(['src/a.ts'])
    expect(io.files.get('src/b.ts')).toBe('export const b = 2\n')
    expect(r.text).toContain('| PASS | not run (no command) | src/b.ts |')
    expect(io.commits.at(-1)).toMatch(/^refactor: polish src\n\nPolish applied 1 changes across 1 files\./)
    expect(r.flagged).toEqual(['EXTRACT | src/b.ts | 1-3 | long fn | extract-function | split it'])
    expect(io.files.get('.planning/POLISH.md')).toContain('| src/a.ts | 1 | "// set x" | restates-code |')
  })

  test('dry run is read-only', async () => {
    const io = memIo({ 'src/a.ts': 'x\n' })
    const r: any = await polishRun(io, polishAgents(io, {}), { files: ['src/a.ts'], dry_run: true })
    expect(r.text).toContain('**No files were modified.** Run without --dry-run to apply changes.')
  })
})

describe('gates (Legion hooks)', () => {
  test('malformed STATE blocks agents; gh pr create waits on npm audit', async () => {
    const io = memIo({ '.planning/STATE.md': '# State\n' })
    expect(await preBuildCheck(io)).toContain('STATE.md malformed')
    expect(await preBuildCheck(memIo())).toBe(undefined)
    const io2 = memIo({ 'package-lock.json': '{}' })
    withRun(io2, a => (a[0] === 'bash' && /npm audit/.test(a[2]!) ? { exitCode: 1, stdout: '1 critical severity vulnerability' } : a[0] === 'bash' && /command -v npm/.test(a[2]!) ? { exitCode: 0, stdout: '' } : undefined))
    expect(await preShipAudit(io2, 'gh pr create --title x')).toBe(CRITICAL_AUDIT)
    expect(await preShipAudit(io2, 'git push')).toBe(undefined)
    expect(await preShipAudit(memIo(), 'gh pr create')).toBe(undefined)
  })
})
