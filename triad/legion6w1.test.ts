import { describe, expect, mock, test } from 'claude-code/testing'
import { fakeAgents, memIo } from './testkit.ts'
import { planWrite, projectInit } from './hooks/legion/handlers.ts'
import { checkWrite, controlMode, controlModeLine, profileOf, resolveProfile, type Scope } from './hooks/legion/settings.ts'
import {
  BUILT_IN_DOMAIN_KEYWORDS, MATRIX_PATH, NOT_SPAWNED, authoritySection, checkMapping, detectDomain, filterFindings, filterReview, knowledgeIndex,
  loadKnowledgeIndex, logDecision, logPath, ownersOf, parseMatrix, prepareRun, specificity,
} from './hooks/legion/authority.ts'
import { runPersonas, renderPersonaRuns } from './hooks/legion/personarun.ts'
import { BY_ID } from './hooks/legion/registry.ts'
import { runValidate } from './hooks/legion/validate.ts'
import type { Finding, ReviewerReport } from './hooks/legion/review.ts'
import type { PlanInput } from './hooks/legion/render.ts'

const MATRIX = `version: "1.0"
agents:
  engineering-security-engineer:
    name: "Security Engineer"
    division: "engineering"
    exclusive_domains:
      - "security"
      - "owasp"
  engineering-backend-architect:
    name: "Backend Architect"
    division: "engineering"
    exclusive_domains:
      - "backend-architecture"
      - "database-design"
      - "api-design"
  testing-performance-benchmarker:
    name: "Performance Benchmarker"
    division: "testing"
    exclusive_domains:
      - "performance"
  testing-qa-verification-specialist:
    name: "QA Verification Specialist"
    division: "testing"
    exclusive_domains:
      - "verification"
conflict_resolution:
  severity_override:
    rule: "BLOCKER from any agent overrides WARNING from domain owner"
specificity_hierarchy:
  - level: 1
    pattern: "specific-tool-framework"
    examples: ["laravel", "react"]
  - level: 3
    pattern: "broad-domain"
    examples: ["security", "performance"]
`

const finding = (agent: string, severity: Finding['severity'], description: string, category = 'general'): Finding =>
  ({ id: '', severity, category, description, file: 'src/a.ts', confidence: 90, agent, cycle: 1, status: 'open', reviewers: [agent] })

const scope = (mode: any, over: Partial<Scope> = {}): Scope => ({ planId: '01-01', mode, files_modified: ['src/a.ts'], files_forbidden: ['secrets/'], ...over })

const plan = (p: number, wave: number, file: string, agent: string): PlanInput => ({
  plan: p, title: `Plan ${p}`, wave, agents: [agent], depends_on: [], files_modified: [file], files_forbidden: [], verification_commands: [`test -f ${file}`],
  expected_artifacts: [{ path: file, provides: 'code', required: true }], truths: ['it works'], objective: `Write ${file}.`,
  tasks: [{ name: 'write', files: [file], action: `Create ${file}.`, verification: [`test -f ${file}`], done: `${file} exists` }], success_criteria: [`${file} exists`],
})

describe('control-mode profiles', () => {
  test('shipped profiles, a partial yaml profile merged over guarded, an unknown mode is guarded', () => {
    expect(profileOf('advisory')).toEqual({ authority_enforcement: false, domain_filtering: false, human_approval_required: false, file_scope_restriction: false, read_only: true })
    const partial = resolveProfile('surgical', 'profiles:\n  surgical:\n    file_scope_restriction: true\n    domain_filtering: false\n')
    expect(partial.profile).toEqual({ authority_enforcement: true, domain_filtering: false, human_approval_required: true, file_scope_restriction: true, read_only: false })
    expect(partial.warnings[0]).toContain('missing flags: authority_enforcement, human_approval_required, read_only')
    const missing = resolveProfile('advisory', 'profiles:\n  guarded:\n    read_only: false\n')
    expect(missing.profile.read_only).toBe(false)
    expect(missing.warnings[0]).toContain("'advisory' not defined")
  })
  test('controlMode: gates are off only in autonomous mode', async () => {
    const auto = await controlMode(memIo({ 'settings.json': JSON.stringify({ control_mode: 'autonomous' }) }))
    expect(auto.gates).toBe(false)
    expect(controlModeLine(auto)).toContain('confirmation gates off')
    const adv = await controlMode(memIo({ 'settings.json': JSON.stringify({ control_mode: 'advisory' }) }))
    expect(adv).toMatchObject({ mode: 'advisory', gates: true })
    expect(controlModeLine(adv)).toContain('read-only on')
    expect((await controlMode(memIo())).mode).toBe('guarded')
  })
  test('each flag decides a write', () => {
    expect(checkWrite('src/a.ts', scope('guarded')).action).toBe('allow')
    expect(checkWrite('src/b.ts', scope('guarded')).action).toBe('warn')
    // file_scope_restriction denies out-of-scope writes only
    const fsr = { ...profileOf('guarded'), file_scope_restriction: true }
    expect(checkWrite('src/b.ts', scope('guarded', { profile: fsr })).action).toBe('deny')
    expect(checkWrite('src/a.ts', scope('guarded', { profile: fsr })).action).toBe('allow')
    // read_only denies every write, even inside the plan
    expect(checkWrite('src/a.ts', scope('advisory')).action).toBe('deny')
    expect(checkWrite('src/a.ts', scope('advisory')).reason).toContain('suggestion')
    // advisory without read_only: out-of-scope writes are logged
    expect(checkWrite('src/b.ts', scope('advisory', { profile: profileOf('autonomous') })).action).toBe('log')
    // autonomous: warned, never blocked, whatever the flags say
    expect(checkWrite('src/b.ts', scope('autonomous', { profile: { ...fsr, read_only: true } })).action).toBe('warn')
    expect(checkWrite('.triad/x', scope('advisory')).action).toBe('allow')
  })
})

describe('authority matrix', () => {
  test('loads the matrix, and falls back to the shipped domains and keywords with a warning', () => {
    const m = parseMatrix(MATRIX)
    expect(m.source).toBe('matrix')
    expect(m.agents['engineering-backend-architect']!.domains).toContain('api-design')
    expect(m.keywords).toBe(BUILT_IN_DOMAIN_KEYWORDS) // no domains: keywords in the matrix
    expect(m.conflict_resolution.severity_override?.rule).toContain('BLOCKER')
    expect(m.errors).toEqual([])
    for (const text of [undefined, ': : not yaml [']) {
      const f = parseMatrix(text)
      expect(f.source).toBe('builtin')
      expect(f.warnings[0]).toContain('built-in')
      expect(f.agents['engineering-security-engineer']!.domains).toContain('owasp')
    }
    const kw = parseMatrix(MATRIX + 'domains:\n  billing:\n    keywords: ["invoice", "refund"]\n')
    expect(detectDomain('refund flow drops the invoice id', kw)).toBe('billing')
  })
  test('integrity: no exclusive domain may belong to two agents', () => {
    const m = parseMatrix(MATRIX.replace('      - "performance"', '      - "performance"\n      - "owasp"'))
    expect(m.errors).toEqual(["Domain conflict: 'owasp' assigned to both engineering-security-engineer and testing-performance-benchmarker"])
    expect(parseMatrix(MATRIX.replace('engineering-security-engineer:', 'nobody-real:')).errors).toEqual(['Unknown agent: nobody-real'])
  })
  test('/triad validate warns on a domain owned by two agents', async () => {
    const io = memIo({ '.planning/config/authority-matrix.yaml': MATRIX.replace('      - "performance"', '      - "performance"\n      - "owasp"') })
    const { checks } = await runValidate(io)
    expect(checks.some(c => c.level === 'WARN' && c.message.startsWith("Domain conflict: 'owasp'"))).toBe(true)
  })
  test('detectDomain: highest keyword score, first declared on a tie, word boundaries, else general', () => {
    const m = parseMatrix(MATRIX)
    expect(detectDomain('SQL injection lets an attacker read the password hash', m)).toBe('security')
    expect(detectDomain('p99 latency regressed on the hot path', m)).toBe('performance')
    expect(detectDomain('the decision is unclear', m)).toBe('general') // "ci" is not in "decision"
    expect(detectDomain('typo in a comment', m)).toBe('general')
  })
  test('owners: exact beats partial, then specificity; ties share ownership', () => {
    const m = parseMatrix(MATRIX)
    const all = Object.keys(m.agents)
    expect(ownersOf(m, 'security', all)).toEqual(['engineering-security-engineer'])
    expect(ownersOf(m, 'api-design', all)).toEqual(['engineering-backend-architect'])
    expect(ownersOf(m, 'database', all)).toEqual(['engineering-backend-architect']) // part of database-design
    expect(ownersOf(m, 'security', ['engineering-backend-architect'])).toEqual([])
    expect(ownersOf(m, 'general', all)).toEqual([])
    expect(specificity('react', m)).toBe(1)
    expect(specificity('security', m)).toBe(3)
    expect(specificity('database-design', m)).toBe(2)
  })
  test('injection: own and co-agent domains when authority enforcement is on, mode constraints', () => {
    const m = parseMatrix(MATRIX)
    const s = authoritySection(m, 'engineering-security-engineer', ['engineering-security-engineer', 'engineering-backend-architect'], profileOf('guarded'), 'guarded')
    expect(s).toContain('## Authority')
    expect(s).toContain('EXCLUSIVE AUTHORITY over: security, owasp')
    expect(s).toContain('- Backend Architect (engineering-backend-architect): backend-architecture, database-design, api-design')
    expect(s).toContain('<escalation>')
    expect(authoritySection(m, 'engineering-security-engineer', ['engineering-backend-architect'], profileOf('autonomous'), 'autonomous')).toBe('')
    const adv = authoritySection(m, 'engineering-security-engineer', [], profileOf('advisory'), 'advisory')
    expect(adv).not.toContain('## Authority')
    expect(adv).toContain('read-only')
    expect(authoritySection(m, 'engineering-security-engineer', [], profileOf('surgical'), 'surgical')).toContain('File Scope Restriction')
  })
  test('plan and reviewer briefs get the section; persona runs do not; agents-orchestrator is refused', async () => {
    const io = memIo({ [MATRIX_PATH]: MATRIX })
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Core', plans: 2 }] } as any)
    await planWrite(io, { phase: 1, context: { goal: 'Core' }, plans: [plan(1, 1, 'src/a.ts', 'engineering-security-engineer'), plan(2, 1, 'src/b.ts', 'engineering-backend-architect')] } as any)
    const sec = BY_ID.get('engineering-security-engineer')!
    const p = await prepareRun(io, sec, 'BRIEF', scope('guarded'))
    expect('brief' in p && p.brief).toMatch(/^## Authority[\s\S]*Backend Architect[\s\S]*---\n\nBRIEF$/)
    expect('scope' in p && p.scope.profile).toEqual(profileOf('guarded'))
    const r = await prepareRun(io, sec, 'R', { planId: 'review-01', mode: 'surgical', files_modified: [], files_forbidden: [], active: ['engineering-security-engineer', 'testing-qa-verification-specialist'] })
    expect('brief' in r && r.brief).toContain('QA Verification Specialist (testing-qa-verification-specialist): verification')
    expect(await prepareRun(io, sec, 'P', { planId: 'advice', mode: 'surgical', files_modified: [], files_forbidden: [] })).toMatchObject({ brief: 'P' })
    expect(await prepareRun(io, BY_ID.get(NOT_SPAWNED)!, 'x', scope('guarded'))).toMatchObject({ deny: expect.stringContaining('never spawned') })
  })
})

describe('finding filtering', () => {
  const active = ['engineering-security-engineer', 'engineering-backend-architect', 'testing-qa-verification-specialist']
  test('drops out-of-domain findings from non-owners; a blocker overrides with a note', () => {
    const m = parseMatrix(MATRIX)
    const fs = [
      finding('engineering-backend-architect', 'major', 'XSS: user input is not sanitized'),
      finding('engineering-security-engineer', 'major', 'XSS: user input is not sanitized'),
      finding('testing-qa-verification-specialist', 'blocker', 'the JWT secret is committed'),
      finding('engineering-backend-architect', 'minor', 'typo in a comment'),
    ]
    const r = filterFindings(fs, active, m, profileOf('guarded'))
    expect(r.removed.map(x => x.finding.agent)).toEqual(['engineering-backend-architect'])
    expect(r.removed[0]!.reason).toBe("Out-of-domain critique filtered — engineering-security-engineer is domain authority for 'security'")
    expect(r.kept).toHaveLength(3)
    expect(r.kept[1]!.description).toContain('[OVERRIDE] Out-of-domain blocker kept per severity rule (domain owner: engineering-security-engineer)')
    expect(filterFindings(fs, active, m, profileOf('advisory')).removed).toEqual([])
  })
  test('the review run filters reports and logs the removals', async () => {
    const io = memIo({ [MATRIX_PATH]: MATRIX })
    const reports: ReviewerReport[] = [
      { agent: 'engineering-backend-architect', verdict: 'NEEDS WORK', findings: [finding('engineering-backend-architect', 'major', 'CSRF token missing on the form')] },
      { agent: 'engineering-security-engineer', verdict: 'PASS', findings: [] },
    ]
    const delta = await filterReview(io, reports, active, 1)
    expect(reports[0]!.findings).toEqual([])
    expect(delta[0]).toContain('1 out-of-domain finding(s) filtered')
    const log = io.files.get(logPath(io))!
    expect(logPath(io)).toBe('.planning/logs/authority-decisions-2026-10-08.log')
    expect(log).toMatch(/^2026-10-08T12:00:00.000Z \| agents=engineering-security-engineer,engineering-backend-architect,testing-qa-verification-specialist \| topic=security \| decision=finding filtered \| owner=engineering-security-engineer \| reason=Out-of-domain/)
    const auto = memIo({ [MATRIX_PATH]: MATRIX, 'settings.json': JSON.stringify({ control_mode: 'autonomous' }) })
    const kept: ReviewerReport[] = [{ agent: 'engineering-backend-architect', verdict: 'NEEDS WORK', findings: [finding('engineering-backend-architect', 'major', 'CSRF token missing')] }]
    expect(await filterReview(auto, kept, active, 1)).toEqual([])
    expect(kept[0]!.findings).toHaveLength(1)
  })
})

describe('decision log and directory mappings', () => {
  test('appends lines in order, concurrently', async () => {
    const io = memIo()
    await Promise.all([1, 2, 3].map(i => logDecision(io, { agents: ['a1'], topic: `write src/${i}.ts`, decision: 'warn', reason: `r${i}\nmore` })))
    const lines = io.files.get(logPath(io))!.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines.map(l => l.match(/topic=write (\S+)/)![1])).toEqual(['src/1.ts', 'src/2.ts', 'src/3.ts'])
    expect(lines[0]).toContain('owner=- | reason=r1 more')
  })
  const MAP = (strictness: string) => `mappings:\n  tests:\n    paths:\n      - "tests"\n  components:\n    paths: ["src/components"]\nenforcement:\n  strictness: ${strictness}\n  exceptions:\n    - ".planning/**"\n    - "CLAUDE.md"\n    - "e2e/**"\n`
  test('strict denies with the suggested location, warn warns, off and exceptions pass', async () => {
    const strict = memIo({ '.planning/config/directory-mappings.yaml': MAP('strict') })
    const d = await checkMapping(strict, 'src/a.test.ts')
    expect(d.action).toBe('deny')
    expect(d.reason).toContain('suggested location: tests/a.test.ts')
    expect((await checkMapping(strict, 'tests/unit/a.test.ts')).action).toBe('ok')
    expect((await checkMapping(strict, 'src/components/Button.tsx')).action).toBe('ok')
    expect((await checkMapping(strict, 'lib/Button.tsx')).reason).toContain('src/components/Button.tsx')
    expect((await checkMapping(strict, 'src/util.py')).action).toBe('ok') // no mapping for the category
    expect((await checkMapping(strict, 'e2e/login.test.ts')).action).toBe('ok')
    expect((await checkMapping(strict, 'docs/CLAUDE.md')).action).toBe('ok')
    expect((await checkMapping(memIo({ '.planning/config/directory-mappings.yaml': MAP('warn') }), 'src/a.test.ts')).action).toBe('warn')
    expect((await checkMapping(memIo({ '.planning/config/directory-mappings.yaml': MAP('off') }), 'src/a.test.ts')).action).toBe('ok')
    expect((await checkMapping(memIo(), 'src/a.test.ts')).action).toBe('ok')
    // Legion's mapper skill wrote `rules:`; its template and enforcer read `enforcement:`.
    const rules = memIo({ '.planning/config/directory-mappings.yaml': MAP('strict').replace('enforcement:', 'rules:') })
    expect((await checkMapping(rules, 'src/a.test.ts')).action).toBe('deny')
    expect((await checkMapping(rules, 'e2e/login.test.ts')).action).toBe('ok')
    const auto = memIo({ '.planning/config/directory-mappings.yaml': MAP('strict'), 'settings.json': JSON.stringify({ control_mode: 'autonomous' }) })
    expect((await checkMapping(auto, 'src/a.test.ts')).action).toBe('warn')
    // the parse is cached by content: an edited file takes effect at once
    strict.files.set('.planning/config/directory-mappings.yaml', MAP('off'))
    expect((await checkMapping(strict, 'src/a.test.ts')).action).toBe('ok')
  })
})

describe('orchestrator knowledge index', () => {
  const cmds = { 'commands/plan.md': '---\ndescription: Plan a phase\nargument-hint: "[n]"\n---\nbody', 'commands/build.md': '---\ndescription: "Build: run it"\n---\n', 'commands/notes.txt': 'x' }
  test('built from command frontmatter and the persona registry, sorted and byte-stable', async () => {
    const a = await loadKnowledgeIndex(memIo(cmds))
    const reversed = memIo(Object.fromEntries(Object.entries(cmds).reverse()))
    expect(await loadKnowledgeIndex(reversed)).toBe(a)
    expect(await loadKnowledgeIndex(memIo(Object.fromEntries(Object.entries(cmds).map(([k, v]) => [`../${k}`, v]))))).toBe(a)
    expect(a).toContain('- /triad:build: Build: run it\n- /triad:plan: Plan a phase')
    expect(a).toMatch(/- Engineering \(\d+\): engineering-ai-engineer, /)
    expect(a).not.toContain(NOT_SPAWNED)
    expect(a).not.toMatch(/20\d\d-\d\d-\d\d/)
    const divisions = [...a.matchAll(/^- ([A-Z][\w ]+) \(\d+\):/gm)].map(x => x[1])
    expect(divisions).toEqual([...divisions].sort())
    expect(divisions).toHaveLength(9)
    expect(knowledgeIndex([{ name: 'b', description: 'B' }, { name: 'a', description: 'A' }])).toBe(knowledgeIndex([{ name: 'a', description: 'A' }, { name: 'b', description: 'B' }]))
  })
})

describe('hooks', () => {
  const files: Record<string, string> = {
    '/repo/.planning/config/directory-mappings.yaml': 'mappings:\n  tests:\n    paths: ["tests"]\nenforcement:\n  strictness: strict\n',
  }
  function world(on: any, writes: Record<string, string>) {
    mock.store(on)
    on('session.start', () => ({ cwd: '/repo' }))
    on('session.id', () => ({ value: 'sess-1' }))
    on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__triad__' + e.name } }))
    on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
    on('fs.write', (_$: any, e: any) => { writes[e.path] = e.text; return { value: undefined } })
    on('fs.read', (_$: any, e: any) => { if (e.path in files) return { value: files[e.path] }; throw new Error('ENOENT') })
    on('fs.list', () => { throw new Error('ENOENT') })
    let n = 0
    on('agent.spawn', (_$: any, e: any) => ({ model: e.model, agentId: `agent${++n}` }))
    on('tool.call', () => ({ result: 'ok' }) as any)
  }
  test('a coder\'s write outside strict directory mappings is refused and logged', async ($, on) => {
    const writes: Record<string, string> = {}
    world(on, writes)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    const c = await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'a', description: 'a' })
    const no: any = await $.tool.call({ tool: 'Write', file_path: '/repo/src/a.test.ts', content: 'x', agentId: c.agentId } as any)
    expect(String(no.deny)).toContain('suggested location: tests/a.test.ts')
    const ok: any = await $.tool.call({ tool: 'Write', file_path: '/repo/tests/a.test.ts', content: 'x', agentId: c.agentId } as any)
    expect(ok.deny).toBeUndefined()
    const log = Object.entries(writes).find(([k]) => k.includes('/.planning/logs/authority-decisions-'))
    expect(log?.[1]).toContain('topic=directory-mapping | decision=write denied')
  })
})

describe('persona runs', () => {
  test('agents-orchestrator is never spawned', async () => {
    const io = memIo()
    const seen: any[] = []
    const agents = { ...fakeAgents(io), async run(o: any) { seen.push(o); return { agentId: 'x', answer: 'ok' } } }
    const r = await runPersonas(io, agents as any, { runs: [{ agent: 'agents-orchestrator', brief: 'coordinate' }, { agent: 'engineering-senior-developer', brief: 'do' }] })
    expect(r[0]!.error).toContain('never spawned')
    expect(seen.map(o => o.persona.id)).toEqual(['engineering-senior-developer'])
  })
  test('a haiku persona\'s output is reviewed by a sonnet pass, read-only like the run', async () => {
    const io = memIo()
    const seen: any[] = []
    const agents = { ...fakeAgents(io), async run(o: any) { seen.push(o); return { agentId: `a${seen.length}`, answer: o.persona.tier === 'haiku' ? 'draft: 3 failures' : 'corrected: 4 failures' } } }
    const r = await runPersonas(io, agents as any, { runs: [{ agent: 'testing-test-results-analyzer', brief: 'Analyze the test log' }] })
    expect(seen.map(o => `${o.persona.id}@${o.persona.tier}`)).toEqual(['testing-test-results-analyzer@haiku', 'testing-qa-verification-specialist@sonnet'])
    expect(seen[1].brief).toContain('Analyze the test log')
    expect(seen[1].brief).toContain('draft: 3 failures')
    expect(seen[1].brief).toContain('same format')
    expect(seen[1].scope).toMatchObject({ mode: 'surgical', files_modified: [] })
    expect(r[0]).toMatchObject({ answer: 'corrected: 4 failures', reviewed: 'sonnet' })
    expect(renderPersonaRuns(r)).toContain('reviewed by sonnet')
    const s = await runPersonas(io, agents as any, { runs: [{ agent: 'engineering-senior-developer', brief: 'x' }] })
    expect(s[0]!.reviewed).toBeUndefined()
    expect(seen).toHaveLength(3)
  })
})
