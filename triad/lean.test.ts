import { describe, expect, mock, test } from 'claude-code/testing'
import { leanBrief, leanGuide, leanLevel, leanReviewRules } from './hooks/lean.ts'
import { schemaProblems } from './hooks/policy.ts'
import { debtFacts, debtLine, parseDebt, renderDebt, scanDebt } from './hooks/legion/debt.ts'
import { review } from './hooks/legion/reviewrun.ts'
import { build } from './hooks/legion/build.ts'
import { planWrite, projectInit } from './hooks/legion/handlers.ts'
import type { PlanInput } from './hooks/legion/render.ts'
import { fakeAgents, memIo } from './testkit.ts'

const plan = (p: number, file: string): PlanInput => ({
  plan: p, title: `Plan ${p}`, wave: 1, agents: ['engineering-backend-architect'], depends_on: [], files_modified: [file],
  files_forbidden: [], verification_commands: [`test -f ${file}`], expected_artifacts: [{ path: file, provides: 'code', required: true }], truths: ['it works'],
  objective: `Write ${file}.`, tasks: [{ name: 'write', files: [file], action: `Create ${file}.`, verification: [`test -f ${file}`], done: `${file} exists` }],
  success_criteria: [`${file} exists`],
})

function world(on: any, spawns: any[]) {
  mock.store(on)
  on('session.start', () => ({ cwd: '/repo' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('tool.register', (_$: any, e: any) => ({ value: { tool: 'mcp__triad__' + e.name } }))
  on('command.register', (_$: any, e: any) => ({ value: { command: e.name } }))
  on('fs.write', () => ({ value: undefined }))
  on('prompt.section', (_$: any, e: any) => ({ text: e.text }))
  let n = 0
  on('agent.spawn', (_$: any, e: any) => { spawns.push(e); return { model: e.model, agentId: `agent${++n}` } })
}
const start = ($: any) => $.session.start({ cwd: '/repo', surface: null, isInteractive: false })

describe('lean rules', () => {
  test('levels: unknown values fall back to full; off adds nothing', () => {
    expect(leanLevel('ULTRA')).toBe('ultra')
    expect(leanLevel(undefined)).toBe('full')
    expect(leanLevel('max')).toBe('full')
    expect(leanBrief('off')).toBe('')
    expect(leanGuide('off')).toBe('')
    expect(leanReviewRules('off')).toBe('')
  })
  test('full gives the reuse ladder; ultra adds the scope note; lite only names smaller options', () => {
    expect(leanBrief('full')).toContain('Never add a dependency for a few lines')
    expect(leanBrief('full')).toContain('`shortcut: <the limit>, <when to upgrade>`')
    expect(leanBrief('full')).not.toContain('orchestrator can cut it')
    expect(leanBrief('ultra')).toContain('orchestrator can cut it')
    expect(leanBrief('lite')).not.toContain('reuse')
    expect(leanBrief('lite')).toContain('`skipped:`')
    expect(leanGuide('ultra')).toContain('Key Decisions as assumed')
    expect(leanGuide('lite')).toContain('let the user pick')
  })
  test('a skipped: line is not read as handing planned work back', () => {
    const reply = 'status: done\nsummary: added the form\nchanges:\n- src/f.ts | added | form\nverify: npm test => 3 passed\nskipped: a date picker; it could be done later if the native input falls short'
    expect(schemaProblems(reply)).toEqual([])
    expect(schemaProblems(reply.replace('skipped:', 'note:'))[0]).toMatch(/defers work back/)
  })
})

describe('lean hooks', () => {
  test('the orchestrator\'s coder briefs carry the rules; helper briefs and the guide follow the option', async ($, on) => {
    const spawns: any[] = []
    world(on, spawns)
    await start($)
    await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'add the parser', description: 'c' })
    await $.agent.spawn({ subagentType: 'triad:triad-opus-coder', prompt: 'tune the AI', description: 'o' })
    await $.agent.spawn({ subagentType: 'triad:triad-helper', prompt: 'list files in src/', description: 'h' })
    expect(spawns[0].prompt).toBe(`add the parser\n\n${leanBrief('full')}`)
    expect(spawns[1].prompt).toContain('## Lean rules (full)')
    expect(spawns[2].prompt).toBe('list files in src/')
    expect((await $.prompt.section({ name: 'communication', text: 'base' })).text).toContain('## Lean (option lean: full)')
  })
  test('lean off: no rules anywhere', { options: { lean: 'off' } }, async ($, on) => {
    const spawns: any[] = []
    world(on, spawns)
    await start($)
    await $.agent.spawn({ subagentType: 'triad:triad-coder', prompt: 'add the parser', description: 'c' })
    expect(spawns[0].prompt).toBe('add the parser')
    expect((await $.prompt.section({ name: 'communication', text: 'base' })).text).not.toContain('Lean')
  })
})

describe('lean review', () => {
  test('reviewer briefs get the lean review rules, fix briefs do not', async () => {
    const io = memIo()
    await projectInit(io, { name: 'Demo', description: 'A demo.', phases: [{ name: 'Core', goal: 'Build the core', plans: 1 }] } as any)
    await planWrite(io, { phase: 1, context: { goal: 'core' }, plans: [plan(1, 'src/a.ts')] })
    await build(io, fakeAgents(io))
    const briefs: Record<string, string> = {}
    const finding = '### Finding 1\n- **Severity**: major\n- **File**: src/a.ts\n- **Lines**: 1-2\n- **Issue**: empty input returns NaN\n- **Confidence**: 90%\n\n**Verdict**: NEEDS WORK'
    const a = fakeAgents(io, c => (c === 1 ? finding : '**Verdict**: PASS'))
    const run = a.run.bind(a)
    a.run = async o => { briefs[o.label] ??= o.brief; return run(o) }
    await review(io, a, { lightPlans: 2, lean: 'full' })
    const reviewer = Object.entries(briefs).find(([l]) => l.startsWith('review '))![1]
    expect(reviewer).toContain('No case, no finding')
    expect(reviewer).toContain('Category lean, severity minor')
    expect(Object.entries(briefs).find(([l]) => l.startsWith('fix '))![1]).not.toContain('Lean review rules')
    const off: string[] = []
    const b = fakeAgents(io)
    const runB = b.run.bind(b)
    b.run = async o => { off.push(o.brief); return runB(o) }
    await review(io, b, { lightPlans: 2, lean: 'off' })
    expect(off.some(x => x.includes('Lean review rules'))).toBe(false)
  })
})

describe('shortcut debt', () => {
  const grep = [
    'src/a.py:1:x = 1  # shortcut: in-memory cache, move to redis past one process',
    'src/b.ts:4:// shortcut: no retries',
    'src/b.ts:9:const k = 1 // Shortcut: ctrl+k opens search',
    'src/c.js:2:/* ponytail: O(n^2) scan, fine under 1k rows */',
  ].join('\n')
  test('parses markers, drops keyboard shortcuts, and flags the ones with no trigger', () => {
    const d = parseDebt(grep)
    expect(d.map(x => [x.file, x.line, x.noTrigger])).toEqual([['src/a.py', 1, false], ['src/b.ts', 4, true], ['src/c.js', 2, false]])
    expect(d[2]!.text).toBe('O(n^2) scan, fine under 1k rows')
    expect(renderDebt(d)).toContain('- L4: no retries [no-trigger]')
    expect(renderDebt(d)).toContain('3 markers, 1 with no trigger.')
    expect(debtLine(d)).toBe('Shortcut debt: 3 markers, 1 with no trigger (`/triad debt` lists them).')
    expect(debtFacts(d)).toContain('- src/b.ts:4: no retries')
    expect(renderDebt([])).toBe('No shortcut debt. Clean ledger.')
    expect(debtLine([])).toBe('')
  })
  test('scans with git grep; no match is a clean ledger, no repository is no scan', async () => {
    const io = (exitCode: number, stdout = '') => ({ ...memIo(), run: async () => ({ exitCode, stdout, stderr: '' }) })
    expect(await scanDebt(io(1))).toEqual([])
    expect(await scanDebt(io(128))).toBeUndefined()
    expect((await scanDebt(io(0, grep)))?.length).toBe(3)
    expect(renderDebt(undefined)).toMatch(/not a git repository/)
  })
})
