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

import { boardCompose, boardDecide, boardMeet, boardReview, compose, resolveVotes } from './hooks/legion/board.ts'
import type { Agents } from './hooks/legion/build.ts'

// Members answer by label; `votes` maps a member id to its final vote text.
function boardAgents(votes: Record<string, string>) {
  const spawned: string[] = []
  const agents: Agents & { spawned: string[] } = {
    maxParallel: 8, spawned,
    async run({ persona, label }) {
      spawned.push(label)
      if (label.endsWith('-board-assessment')) return { agentId: label, answer: `## Assessment: ${persona.name}\n### Verdict: CONCERNS\n### Score: 7\n### Red Flags: None\n### Concerns:\n- rollback plan is thin\n### Recommendations:\n- add a canary\n### Questions for Other Board Members: None` }
      if (/-board-round-\d$/.test(label)) return { agentId: label, answer: `### AGREE: ${persona.name} → Board\nThe canary matters.` }
      if (label.endsWith('-board-revote')) return { agentId: label, answer: 'still undecided' }
      return { agentId: label, answer: votes[persona.id] ?? `### Vote: ${persona.name}\n- Verdict: APPROVE\n- Confidence: 0.8\n- Conditions: None` }
    },
    followUp: async () => '',
    writesOf: () => ({ files: [], warnings: [] }),
    usageOf: () => '1 request',
  }
  return agents
}

describe('board', () => {
  test('resolution formula for N = 5, 4, 3, 2', () => {
    const t = (n: number) => Array.from({ length: n + 1 }, (_, a) => `${a}:${resolveVotes(a, n)}`).join(' ')
    expect(t(5)).toBe('0:REJECTED 1:REJECTED 2:REJECTED 3:APPROVED WITH CONDITIONS 4:APPROVED 5:APPROVED')
    expect(t(4)).toBe('0:REJECTED 1:REJECTED 2:ESCALATED 3:APPROVED 4:APPROVED')
    expect(t(3)).toBe('0:REJECTED 1:REJECTED 2:APPROVED 3:APPROVED')
    expect(t(2)).toBe('0:REJECTED 1:ESCALATED 2:APPROVED')
    expect(resolveVotes(0, 0)).toBe('ESCALATED')
  })

  test('composition: scored, max two per division', () => {
    const m = compose('database schema migration and API security review', 5)
    expect(m.length).toBeGreaterThanOrEqual(3)
    expect(m.length).toBeLessThanOrEqual(5)
    expect(m.every(x => x.score > 0)).toBe(true)
    const per = new Map<string, number>()
    for (const x of m) per.set(x.division, (per.get(x.division) ?? 0) + 1)
    expect([...per.values()].every(c => c <= 2)).toBe(true)
    expect(boardCompose('database schema migration', {})).toContain('| 1 |')
  })

  test('meet: assess, discuss, vote, resolve with conditions, persist and record', async () => {
    const io = await project()
    const ids = ['engineering-backend-architect', 'engineering-security-engineer', 'testing-api-tester', 'product-technical-writer', 'engineering-frontend-developer']
    const agents = boardAgents({
      'engineering-security-engineer': '### Vote: x\n- Verdict: APPROVE\n- Confidence: 0.6\n- Conditions: ship behind a feature flag',
      'testing-api-tester': '### Vote: x\n- Verdict: REJECT\n- Confidence: 0.7\n- Conditions: None',
      'product-technical-writer': 'no verdict here',
    })
    const out = await boardMeet(io, agents, { topic: 'Adopt Postgres for the API', members: ids })
    // 3 approve, 1 reject, 1 abstain (no verdict after a re-vote): N=4 → APPROVED.
    expect(out).toContain('Board APPROVED: Adopt Postgres for the API')
    expect(out).toContain('3 APPROVE — 1 REJECT — 1 ABSTAIN')
    expect(agents.spawned.filter(l => l.endsWith('-board-revote'))).toEqual(['product-technical-writer-board-revote'])
    expect(agents.spawned.filter(l => /round-\d$/.test(l)).length).toBe(10)
    const dir = [...io.files.keys()].find(k => k.endsWith('/MEETING.md'))!.replace('/MEETING.md', '')
    expect(dir).toMatch(/^\.planning\/board\/\d{4}-\d\d-\d\d-adopt-postgres-for-the-api$/)
    expect(io.files.get(`${dir}/resolution.md`)).toContain('ship behind a feature flag')
    expect(io.files.has(`${dir}/assessments/testing-api-tester.md`)).toBe(true)
    expect(io.files.get('.planning/memory/OUTCOMES.md')).toContain('board_decision')
    expect(await boardMeet(io, agents, { topic: 'x', members: ['nobody-at-all'] })).toContain('Unknown board members')
  })

  test('a tie escalates to the user, who decides', async () => {
    const io = await project()
    const ids = ['engineering-backend-architect', 'engineering-security-engineer', 'testing-api-tester', 'product-technical-writer']
    const no = '### Vote: x\n- Verdict: REJECT\n- Confidence: 0.9\n- Conditions: None'
    const out = await boardMeet(io, boardAgents({ 'testing-api-tester': no, 'product-technical-writer': no }), { topic: 'Rewrite in Rust', members: ids })
    expect(out).toContain('Board ESCALATED')
    const dir = out.match(/decide with dir (\S+)\./)![1]!
    expect(await boardDecide(io, { dir, decision: 'table' })).toBe('Recorded: TABLED (user decision).')
    expect(io.files.get(`${dir}/resolution.md`)).toContain('**Verdict**: TABLED (user decision)')
    expect(await boardDecide(io, { dir, decision: 'approve' })).toContain('has no ESCALATED resolution')
  })

  test('review: Phase 1 only, nothing persisted', async () => {
    const io = await project()
    const agents = boardAgents({})
    const out = await boardReview(io, agents, { topic: 'API security hardening and database performance' })
    expect(out).toContain('### Aggregate Score: 7.0/10')
    expect(out).toContain('- rollback plan is thin')
    expect(agents.spawned.every(l => l.endsWith('-board-assessment'))).toBe(true)
    expect([...io.files.keys()].some(k => k.startsWith('.planning/board/'))).toBe(false)
  })
})

import { inferCategory, specAssess, specCheck, specGather, specPath, specTrigger } from './hooks/legion/spec.ts'

const SPEC = (over: { reqs?: string; oq?: string; api?: string } = {}) => `# Spec: Phase 1 — Auth

## Overview
Login and sessions.

## Requirements
| ID | Description | Priority | Acceptance Criteria |
|----|-------------|----------|-------------------|
${over.reqs ?? '| REQ-01 | Login | Must | curl /login returns 200 |\n| REQ-02 | Sessions | Must | cookie set |'}

## Architecture
Express routes over a session store.

### Key Decisions
| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|----------------------|
| Store | Redis | Shared across instances, already deployed | Memory |

## API and Type Contracts
${over.api ?? 'POST /login {user, pass} -> 200 {token}'}

## File Placement
| Artifact | Path | Placement Rationale | Existing Pattern |
|----------|------|---------------------|------------------|
| Login route | src/routes/login.ts | routes live here | src/routes/health.ts |

## Data and Control Flow
Request -> route -> store.

## Compatibility Constraints
- None

## Failure Modes
| Failure Mode | Expected Behavior | Verification |
|--------------|-------------------|--------------|
| Store down | 503 | test |

## Acceptance Checks
| Check | Command or Evidence | Required |
|-------|---------------------|----------|
| tests | npm test | true |

## Deliverables

### Login route
- **Path:** src/utils/login.ts
- **Purpose:** API endpoint for login
- **Dependencies:** none

### Session store
- **Path:** src/services/session.ts
- **Purpose:** session service
- **Dependencies:** Login route

## Open Questions
| # | Question | Impact | Default Chosen by Spec | Planning Effect |
|---|----------|--------|------------------------|-----------------|
${over.oq ?? '| 1 | Token TTL? | Non-blocking | 1 hour | use default |'}

## Complexity Assessment
`

describe('spec pipeline', () => {
  async function specProject() {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', requirements: ['REQ-01: Users can log in', 'REQ-02: Sessions persist'], constraints: ['Node 20'],
      phases: [{ name: 'Auth', goal: 'Log in', requirements: ['REQ-01', 'REQ-02'], success_criteria: ['login works'], plans: 2 }] } as any)
    return io
  }

  test('gather, trigger and the spec path', async () => {
    const io = await specProject()
    expect(specPath(1, 'Auth')).toBe('.planning/specs/01-auth-spec.md')
    const g = await specGather(io, 1)
    expect(g).toContain('## Requirements Summary — Phase 1: Auth')
    expect(g).toContain('| REQ-01 |')
    expect(g).toContain('Users can log in')
    expect((await specTrigger(io, 1, true)).action).toBe('run')
    expect((await specTrigger(io, 1)).action).toBe('skip')
    expect(await specGather(io, 9)).toContain('not in ROADMAP.md')
  })

  test('check: verdicts, blocking questions, defaults and path validation', async () => {
    const io = await specProject()
    io.files.set('.planning/specs/01-auth-spec.md', SPEC())
    let c = await specCheck(io, 1)
    expect(typeof c !== 'string' && c.verdict).toBe('PASS')
    io.files.set('.planning/config/directory-mappings.yaml', 'enforcement:\n  strictness: warn\nmappings:\n  routes:\n    paths: [src/routes]\n')
    c = await specCheck(io, 1)
    expect(typeof c !== 'string' && [c.verdict, c.findings.join()]).toEqual(['CAUTION', 'Path warnings: src/utils/login.ts (routes: not in src/routes; suggested src/routes/login.ts)'])
    io.files.set('.planning/specs/01-auth-spec.md', SPEC({ reqs: '| REQ-01 | Login | Must | ok |', oq: '| 1 | Which IdP? | Blocking | — | halt |\n| 2 | TTL? | Non-blocking | | use default |', api: '' }))
    c = await specCheck(io, 1)
    if (typeof c === 'string') throw new Error(c)
    expect(c.verdict).toBe('REWORK')
    expect(c.blocking).toEqual(['Which IdP?'])
    expect(c.checklist.filter(x => !x.ok).map(x => x.item)).toEqual(['Every phase requirement is in the Requirements table', 'API/type contracts explicit or explicitly none', 'No Blocking open questions; every Non-blocking one has a default'])
    expect([inferCategory('a/b.test.ts'), inferCategory('src/components/x.tsx'), inferCategory('lib/x.ts', 'business logic')]).toEqual(['tests', 'components', 'services'])
  })

  test('assess writes the complexity section', async () => {
    const io = await specProject()
    io.files.set('.planning/specs/01-auth-spec.md', SPEC())
    const out = await specAssess(io, 1)
    expect(out).toContain('**Rating:** Medium')
    const doc = io.files.get('.planning/specs/01-auth-spec.md')!
    expect(doc).toContain('| Estimated waves | 2 |')
    expect(doc).toContain('| Deliverables | 2 (new: 2, modify: 0, config: 0) |')
    expect(doc).toContain('**Critique verdict:** PASS')
    expect(doc.match(/## Complexity Assessment/g)!.length).toBe(1)
  })
})
