// Phase 6 W3: review evaluators and coverage, finding validation, CRITIQUE.md
// and FIXES.md, memory validation and the Claude memory bridge, project and
// audit security reports, campaign REPORT.md, spec settings, dry runs, status
// suggestions and intent review.
import { describe, expect, test } from 'claude-code/testing'
import type { Agents } from './hooks/legion/build.ts'
import { build } from './hooks/legion/build.ts'
import { review } from './hooks/legion/reviewrun.ts'
import { planCheck, planWrite, projectInit, statusText } from './hooks/legion/handlers.ts'
import { findingErrors, intentFilter, type Finding } from './hooks/legion/review.ts'
import { EVALUATORS, evaluatorsFor } from './hooks/legion/evaluators.ts'
import { coverageChecks, parseCobertura, parseIstanbul, parseLcov, parsePytestCov, readCoverage } from './hooks/legion/coverage.ts'
import { claudeMemoryNote, storeOutcome } from './hooks/legion/memory.ts'
import { loadSettings } from './hooks/legion/settings.ts'
import { securitySave, securityScan } from './hooks/legion/security.ts'
import { campaignReport, setStatus, writeDoc } from './hooks/legion/domain.ts'
import { specTrigger } from './hooks/legion/spec.ts'
import { dryRunReport, renderDryRun } from './hooks/legion/dryrun.ts'
import { lifecyclePosition } from './hooks/legion/status.ts'
import { extendedTool } from './hooks/legion/extended.ts'
import { loadProject } from './hooks/legion/io.ts'
import type { PlanInput } from './hooks/legion/render.ts'
import { fakeAgents, memIo } from './testkit.ts'

const plan = (p: number, wave: number, file: string, extra: Partial<PlanInput> = {}): PlanInput => ({
  plan: p, title: `Plan ${p}`, wave, agents: ['engineering-backend-architect'], depends_on: [], files_modified: [file],
  files_forbidden: ['secrets/'], verification_commands: [`test -f ${file}`],
  expected_artifacts: [{ path: file, provides: 'code', required: true }], truths: ['it works'],
  objective: `Write ${file}.`, tasks: [{ name: 'write', files: [file], action: `Create ${file} exporting run().`, verification: [`test -f ${file}`], done: `${file} exists` }],
  success_criteria: [`${file} exists`], ...extra,
})

async function built(file = 'src/a.ts', settings?: object) {
  const io = memIo(settings ? { 'settings.json': JSON.stringify(settings) } : {})
  await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build the core API', plans: 1 }, { name: 'Polish', goal: 'Docs' }] } as any)
  await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, file)] })
  await build(io, fakeAgents(io))
  return io
}

const finding = (o: Partial<Record<string, string>> = {}) =>
  `### Finding 1\n- **File**: ${o.file ?? 'src/a.ts'}\n- **Lines**: 1-2\n- **Severity**: ${o.severity ?? 'major'}\n- **Category**: ${o.category ?? 'correctness'}\n- **Issue**: ${o.issue ?? 'no error handling'}\n${o.fix === '' ? '' : `- **Fix**: ${o.fix ?? 'add a try'}\n`}- **Confidence**: 90%\n\n**Verdict**: NEEDS WORK`

// fakeAgents plus scripted evaluator answers (label "evaluate <type>").
function withEvaluators(io: ReturnType<typeof memIo>, evals: Record<string, (n: number) => string>, review?: (c: number) => string) {
  const base = fakeAgents(io, review)
  const calls: Record<string, number> = {}
  const run = base.run.bind(base)
  const agents: Agents & { spawned: string[] } = Object.assign(base, {
    async run(o: Parameters<Agents['run']>[0]) {
      const t = o.label.match(/^evaluate (\S+)/)?.[1]
      if (t && evals[t]) { base.spawned.push(o.label); calls[t] = (calls[t] ?? 0) + 1; return { agentId: `e${calls[t]}`, answer: evals[t]!(calls[t]!) } }
      return run(o)
    },
  })
  return agents
}

describe('review evaluators (multi-pass)', () => {
  test('UI/UX joins only when the phase touches frontend files', () => {
    expect(evaluatorsFor(['src/a.ts']).map(e => e.type)).toEqual(['code-quality', 'integration', 'business-logic'])
    expect(evaluatorsFor(['src/App.tsx', 'src/a.css']).map(e => e.type)).toContain('ui-ux')
    expect(EVALUATORS.find(e => e.type === 'ui-ux')!.passes.length).toBe(7)
  })
  test('an evaluator finding goes through triage, gets fixed and re-checked; single keeps today\'s panel', async () => {
    const io = await built()
    const agents = withEvaluators(io, { 'code-quality': n => n === 1 ? finding({ category: 'evaluator:code-quality:pass:4' }) : '**Verdict**: PASS' })
    const r = await review(io, agents)
    expect(r.result).toBe('PASSED')
    expect(r.cycles).toBe(2)
    expect(agents.spawned.filter(s => s.startsWith('evaluate code-quality')).length).toBe(2)
    expect(agents.spawned.some(s => s.startsWith('evaluate integration'))).toBe(true)
    expect(agents.spawned.some(s => s.startsWith('evaluate ui-ux'))).toBe(false)
    expect(agents.spawned.some(s => s.startsWith('fix '))).toBe(true)
    expect(r.text).toContain('Evaluators: code-quality, integration, business-logic')
    const single = await built('src/a.ts', { review: { evaluator_depth: 'single' } })
    const s = fakeAgents(single)
    await review(single, s)
    expect(s.spawned.some(x => x.startsWith('evaluate'))).toBe(false)
  })
})

describe('coverage thresholds', () => {
  test('istanbul, lcov, cobertura and pytest-cov parse to an overall and per-file count', () => {
    expect(parseIstanbul(JSON.stringify({ total: { lines: { pct: 81.5 } }, 'src/services/a.ts': { lines: { total: 10, covered: 8, pct: 80 } } }))).toMatchObject({ overall: 81.5, files: { 'src/services/a.ts': { covered: 8, total: 10 } } })
    expect(parseLcov('SF:src/api/x.ts\nLF:10\nLH:5\nend_of_record\nSF:src/b.ts\nLF:10\nLH:10\nend_of_record\n')).toMatchObject({ overall: 75 })
    expect(parseCobertura('<coverage line-rate="0.6"><packages><package><classes><class name="a" filename="app/routes/a.py"><lines><line number="1" hits="1"/><line number="2" hits="0"/></lines></class></classes></package></packages></coverage>')).toMatchObject({ overall: 60, files: { 'app/routes/a.py': { covered: 1, total: 2 } } })
    expect(parsePytestCov('Name    Stmts   Miss  Cover\n-----\napp/core/x.py   20   2   90%\nTOTAL   20   2   90%\n')).toMatchObject({ overall: 90, files: { 'app/core/x.py': { covered: 18, total: 20 } } })
  })
  test('business logic and API routes are classed by path and rated against the thresholds', () => {
    const c = { source: 'lcov.info', overall: 72, files: { 'src/services/pay.ts': { covered: 7, total: 10 }, 'src/routes/u.ts': { covered: 75, total: 100 }, 'src/x.ts': { covered: 9, total: 10 } } }
    const k = coverageChecks(c, { overall: 70, business_logic: 90, api_routes: 80 })
    expect(k.map(x => [x.metric, x.rating])).toEqual([['overall', 'PASS'], ['business_logic', 'FAIL'], ['api_routes', 'NEEDS WORK']])
  })
  test('low coverage becomes a non-blocking finding; no data is an advisory note', async () => {
    const io = await built()
    io.files.set('coverage/lcov.info', 'SF:/repo/src/services/a.ts\nLF:10\nLH:4\nend_of_record\n')
    expect((await readCoverage(io))!.files['src/services/a.ts']).toEqual({ covered: 4, total: 10 })
    const r = await review(io, fakeAgents(io))
    expect(r.result).toBe('PASSED')
    const doc = io.files.get('.planning/phases/01-core/01-REVIEW.md')!
    expect(doc).toContain('## Coverage')
    expect(doc).toMatch(/Business logic line coverage 40% is below the 90% threshold/)
    const none = await built()
    await review(none, fakeAgents(none))
    expect(none.files.get('.planning/phases/01-core/01-REVIEW.md')).toContain('No coverage data found')
  })
})

describe('finding validation', () => {
  const f: Finding = { id: 'F-001', severity: 'major', category: 'correctness', description: 'x', file: 'a.ts', line_range: [1, 2], confidence: 90, agent: 'qa', cycle: 1, status: 'open', reviewers: ['qa'] }
  test('the schema record validates; a blocker without a fix does not', () => {
    expect(findingErrors(f)).toEqual([])
    expect(findingErrors({ ...f, severity: 'blocker' }).join()).toContain('suggested_fix')
  })
  test('invalid findings are flagged in REVIEW.md, not dropped', async () => {
    const io = await built()
    const r = await review(io, fakeAgents(io, c => c === 1 ? finding({ severity: 'critical', fix: '' }) : '**Verdict**: PASS'))
    const doc = io.files.get('.planning/phases/01-core/01-REVIEW.md')!
    expect(doc).toContain('## Invalid Findings')
    expect(doc).toMatch(/- F-001: .*suggested_fix/)
    expect(doc).toContain('| F-001 | critical |')
    expect(r.text).toContain('Invalid findings (schema): F-001')
  })
})

describe('CRITIQUE.md and FIXES.md', () => {
  test('plan_check writes CRITIQUE.md with schema conformance and per-plan verdicts', async () => {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'core' }] } as any)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 1, 'src/a.ts'), plan(2, 1, 'src/a.ts', { verification_commands: [] })] })
    expect(await planCheck(io, 1)).toContain('Wrote .planning/phases/01-core/CRITIQUE.md')
    const c = io.files.get('.planning/phases/01-core/CRITIQUE.md')!
    expect(c).toContain('## Plan Critique Summary — Phase 1: Core')
    expect(c).toContain('**Verdict**: REWORK')
    expect(c).toContain('| 01-02 | WARNING | PASS | PASS | REWORK |')
    expect(c).toMatch(/\| 01-01 \| REWORK \| overlap: /)
    expect(c).toContain('### Recommended Actions')
  })
  test('the review fix loop writes FIXES.md per cycle', async () => {
    const io = await built()
    await review(io, fakeAgents(io, c => c === 1 ? finding() : '**Verdict**: PASS'))
    const fx = io.files.get('.planning/phases/01-core/FIXES.md')!
    expect(fx).toContain('# Phase 1: Core — Review Fixes')
    expect(fx).toContain('## Cycle 1')
    expect(fx).toMatch(/\| F-001 \| major \| `src\/a.ts` \| engineering-backend-architect \| fix applied \|/)
  })
})

describe('memory', () => {
  const settings = loadSettings(undefined).settings
  test('storeOutcome validates against the outcomes schema and rejects with a message', async () => {
    const io = memIo()
    await expect(storeOutcome(io, settings, { phase: 1, plan: 'one', agent: 'x', task_type: 'y', outcome: 'success', summary: '' })).rejects.toThrow(/plan "one" must match/)
    expect(io.files.has('.planning/memory/OUTCOMES.md')).toBe(false)
    expect(await storeOutcome(io, settings, { phase: 1, plan: 'board', agent: 'board', task_type: 'board_decision', outcome: 'partial', summary: 'tie' })).toBeDefined()
    await expect(storeOutcome(io, settings, { phase: 1, plan: '01-01', agent: 'x', task_type: 'y', outcome: 'meh' as any, summary: '' })).rejects.toThrow(/outcome must be one of/)
  })
  test('Claude Code memory is read as an advisory note, only while memory is enabled', async () => {
    const home = Object.assign(memIo({ '.claude/projects/-repo/memory/MEMORY.md': 'Prefers small PRs.\n' }), { root: '/home/u' })
    expect(await claudeMemoryNote(settings, home, '/repo')).toContain('Claude Code memory suggests (advisory, read only):\n> Prefers small PRs.')
    const off = loadSettings(JSON.stringify({ execution: {}, memory: { enabled: false } })).settings
    expect(await claudeMemoryNote(off, home, '/repo')).toBeUndefined()
    expect(await claudeMemoryNote(settings, Object.assign(memIo(), { root: '/home/u' }), '/repo')).toBeUndefined()
    const io = memIo({ '.planning/memory/PATTERNS.md': '' })
    const ctx = { agents: () => fakeAgents(io), ioAt: () => home, registry: async () => Object.assign(memIo(), { root: '/home/u/.claude/legion' }) }
    expect(await extendedTool(io, ctx, 'memory', { action: 'recall', topic: 'prs' })).toContain('Prefers small PRs.')
    expect([...home.dirty]).toEqual([])
  })
})

describe('security reports', () => {
  test('a project scan (no phase) and save write .planning/security-review-{timestamp}.md', async () => {
    const io = memIo({ '.planning/PROJECT.md': '# P\n', 'src/auth.ts': 'const k = "AKIAABCDEFGHIJKLMNOP"\n' })
    const scan = await securityScan(io, {})
    expect(scan).toContain('Project security review scan')
    expect(JSON.parse(io.files.get('.triad/security-scan.json')!).mode).toBe('project')
    const out = await securitySave(io, { findings: [{ severity: 'HIGH', category: 'A2:Broken Auth', finding: 'no rate limit', files: 'src/auth.ts:1', remediation: 'limit' }] })
    expect(out).toContain('.planning/security-review-2026-10-08T12-00-00.md')
    const doc = io.files.get('.planning/security-review-2026-10-08T12-00-00.md')!
    expect(doc).toContain('# Security Review Report')
    expect(doc).toContain('**Mode:** --just-security')
    expect(doc).toContain('- Critical (BLOCKER): 1')
    expect(doc).toContain('## STRIDE Threats Identified')
    expect(doc).toMatch(/## Remediation Priority\n1\. \[BLOCKER\]/)
  })
  test('audit mode writes .planning/security-audit-{timestamp}.md', async () => {
    const io = memIo({ '.planning/PROJECT.md': '# P\n', 'src/a.ts': 'x\n' })
    await securityScan(io, { mode: 'audit' })
    expect(await securitySave(io, {})).toContain('security-audit-2026-10-08T12-00-00.md')
    const doc = io.files.get('.planning/security-audit-2026-10-08T12-00-00.md')!
    expect(doc).toContain('# Security Audit Report')
    expect(doc).toContain('## Summary Statistics')
    expect(doc).toContain('## Remediation Guide')
  })
})

describe('campaign report', () => {
  test('REPORT.md goes in the phase slug folder; Complete waits for the window and the checklist', async () => {
    const io = await built()
    await writeDoc(io, { kind: 'campaign', name: 'Launch', fields: { metrics: [['Signups', '100', 'form']] } })
    const path = '.planning/campaigns/launch.md'
    await setStatus(io, path, 'active')
    expect(await setStatus(io, path, 'complete')).toContain('domain action `report`')
    await setStatus(io, path, 'measuring')
    expect(io.files.get(path)).toContain('**Measuring since:** 2026-10-08')
    expect(await campaignReport(io, { phase: 1, metrics: [['Signups', '100', '120']] })).toContain('measuring window not elapsed (14 day(s) left)')
    const rep = io.files.get('.planning/campaigns/01-core/REPORT.md')!
    expect(rep).toContain('# Campaign Report: Launch')
    expect(rep).toContain('| Signups | 100 | 120 | MET |')
    expect(rep).toContain('- [ ] Campaign hashtags are defined')
    io.files.set(path, io.files.get(path)!.replace('**Measuring since:** 2026-10-08', '**Measuring since:** 2026-09-01'))
    expect(await campaignReport(io, { phase: 1, checklist: [true, true, true, true, true, true, 'no visual channels'] })).toContain('campaign marked Complete')
    expect(io.files.get(path)).toContain('**Status:** Complete')
    expect(io.files.get('.planning/campaigns/01-core/REPORT.md')).toContain('waived: no visual channels')
    expect(io.files.get('.planning/campaigns/01-core/REPORT.md')).toContain('| Signups | 100 | not measured | — |')
  })
})

describe('spec trigger settings', () => {
  const at = async (planning: object) => {
    const io = memIo({ 'settings.json': JSON.stringify({ execution: {}, planning }) })
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'core' }] } as any)
    return io
  }
  test('always runs, never skips unless --spec, prompt keeps the activation rules; proposals follow their default', async () => {
    expect(await specTrigger(await at({ spec_pipeline_default: 'always', architecture_proposals_default: 'always' }), 1)).toMatchObject({ action: 'run', proposals: 'run' })
    const never = await at({ spec_pipeline_default: 'never', architecture_proposals_default: 'never' })
    expect(await specTrigger(never, 1)).toMatchObject({ action: 'skip', proposals: 'skip' })
    expect((await specTrigger(never, 1, true)).action).toBe('run')
    expect(await specTrigger(await at({}), 1)).toMatchObject({ action: 'skip', proposals: 'offer' })
  })
})

describe('dry runs', () => {
  test('status prints inputs and the routing preview; /triad status --dry-run renders it', async () => {
    const io = await built()
    const r = await dryRunReport(io, 'status')
    expect(r.routing).toContain('/triad:review')
    expect(r.inputs).toContain('.planning/STATE.md')
    const t = await statusText(io, { dryRun: true })
    expect(t).toContain('Dry run: /triad:status')
    expect(t).toContain('Routing preview: /triad:review')
    expect(t).not.toContain('## Suggested Next Actions')
  })
  test('retro needs a completed phase; polish needs an existing target', async () => {
    const io = await built()
    expect((await dryRunReport(io, 'retro', 1)).checks.find(c => c.label === 'Phase 1 complete')!.ok).toBe(false)
    await review(io, fakeAgents(io))
    const done = await dryRunReport(io, 'retro')
    expect(done.phase).toBe(1)
    expect(done.success).toBe(true)
    expect((await dryRunReport(io, 'polish', undefined, 'src/nope.ts')).success).toBe(false)
    expect((await dryRunReport(io, 'polish', undefined, 'src/')).success).toBe(true)
    expect(renderDryRun(await dryRunReport(io, 'ship', 1))).toContain('Review passed | PASS')
  })
})

describe('status suggestions', () => {
  test('context_rules for the lifecycle position, from the bundled intent teams', async () => {
    const io = await built()
    const t = await statusText(io)
    expect(t).toContain('## Suggested Next Actions')
    expect(t).toContain('1. **`/triad:review`** — Review Phase 1 output')
    expect(t).toContain('**`/triad status`**')
    expect(lifecyclePosition(await loadProject(memIo()), () => false)).toBe('no_project')
    await review(io, fakeAgents(io))
    expect(await statusText(io)).toContain('**`/triad:plan 2`** — Plan Phase 2: Polish')
  })
  test('a project intent-teams.yaml overrides the rules', async () => {
    const io = await built()
    io.files.set('.planning/config/intent-teams.yaml', 'context_rules:\n  needs_review:\n    suggestions:\n      - command: "/legion:review --phase {phase}"\n        description: "Custom review of {phase}"\n        reason: "house rule"\n')
    expect(await statusText(io)).toContain('1. **`/triad:review --phase 1`** — Custom review of 1\n   _house rule_')
  })
})

describe('intent review', () => {
  test('the filter keeps only the intent\'s domains', () => {
    const f = (category: string): Finding => ({ id: '', severity: 'major', category, description: 'x', file: 'a', confidence: 90, agent: 'a', cycle: 1, status: 'open', reviewers: ['a'] })
    const kept = intentFilter([f('security'), f('A3:Injection'), f('maintainability'), f('docs'), f('owasp-top-10')], 'security-only').map(x => x.category)
    expect(kept).toEqual(['security', 'A3:Injection', 'owasp-top-10'])
    expect(intentFilter([f('documentation'), f('security')], 'document').map(x => x.category)).toEqual(['documentation'])
  })
  test('--just-security composes only the intent team and drops out-of-domain findings', async () => {
    const io = await built()
    const agents = fakeAgents(io, () => finding({ category: 'maintainability' }))
    const r = await review(io, agents, { intent: 'security-only' })
    const reviewers = agents.spawned.filter(s => s.startsWith('review ')).map(s => s.split(' ')[1])
    expect(new Set(reviewers)).toEqual(new Set(['engineering-security-engineer', 'testing-api-tester']))
    expect(agents.spawned.some(s => s.startsWith('evaluate'))).toBe(false)
    expect(r.result).toBe('PASSED')
    expect(io.files.get('.planning/phases/01-core/01-REVIEW.md')).toContain('**Intent**: security-only')
    expect((await review(await built(), fakeAgents(io), { intent: 'nope' })).error).toContain('unknown intent')
  })
})
