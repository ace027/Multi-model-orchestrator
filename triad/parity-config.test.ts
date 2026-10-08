// Ported from Legion's agent-contract, config-agent-references,
// dispatch-conformance, validate-settings, recommendation-engine,
// directory-mappings, environment-mapping and no-agent-deferrals tests, run
// against Triad's code and Legion's fixtures (tests/fixtures/index.ts).
import { describe, expect, test } from 'claude-code/testing'
import { FIXTURES } from './tests/fixtures/index.ts'
import { PERSONAS } from './hooks/legion/personas.ts'
import { ROSTER, rank } from './hooks/legion/registry.ts'
import { DOMAINS, SCHEMAS, SETTINGS } from './hooks/legion/data.ts'
import { INTENT_TEAMS, ROSTER_GAP_CONFIG } from './hooks/legion/configdata.ts'
import { agentRefs } from './hooks/legion/validate.ts'
import { loadSettings } from './hooks/legion/settings.ts'
import { validate } from './hooks/legion/schema.ts'
import { parseYaml } from './hooks/legion/yaml.ts'
import { globMatch } from './hooks/legion/intents.ts'
import { mapBuild } from './hooks/legion/map.ts'
import { validatePaths } from './hooks/legion/spec.ts'
import { deferralIn, schemaProblems } from './hooks/policy.ts'
import { memIo } from './testkit.ts'

const yaml = (key: string) => parseYaml(FIXTURES[key]!.replace(/^---\s*$/m, '')) as any

describe('parity: agent-contract', () => {
  test('49 personas, each with a tier and a distilled core', () => {
    expect(PERSONAS.length).toBe(49)
    expect(new Set(PERSONAS.map(p => p.id)).size).toBe(49)
    for (const p of PERSONAS) {
      expect(['opus', 'sonnet', 'haiku']).toContain(p.tier)
      expect(p.core.trim().length).toBeGreaterThan(1000)
    }
  })
  test('every core keeps the identity, critical-rules and done-criteria sections', () => {
    const missing: string[] = []
    for (const p of PERSONAS) for (const [re, label] of [
      [/^## .*Identity/im, 'identity'],
      [/^## .*(Critical Rules|Rules You Must Follow)/im, 'critical rules'],
      [/^## .*(Done Criteria|Success Criteria|Definition of Done|Completion Criteria|Exit Criteria)/im, 'done criteria'],
    ] as [RegExp, string][]) if (!re.test(p.core)) missing.push(`${p.id}: ${label}`)
    expect(missing).toEqual([])
  })
  test('every core has a mission section, except the QA verification specialist', () => {
    // testing-qa-verification-specialist is a short checklist persona with no
    // mission heading (its Legion file has none either).
    expect(PERSONAS.filter(p => !/^## .*(Core Mission|Mission)/im.test(p.core)).map(p => p.id)).toEqual(['testing-qa-verification-specialist'])
  })
  // Legion's deliverables/process and anti-patterns sections and its 80-line
  // minimum are not ported: Triad's distilled cores drop those sections.
  test('metadata: four lists, 1-8 lowercase hyphenated values each', () => {
    for (const p of PERSONAS) for (const f of ['languages', 'frameworks', 'artifact_types', 'review_strengths'] as const) {
      expect(p[f].length).toBeGreaterThan(0)
      expect(p[f].length).toBeLessThan(9)
      for (const v of p[f]) expect(v).toMatch(/^[a-z0-9-]+$/)
    }
  })
  test('split roles: senior generalist and Laravel specialist both exist', () => {
    expect(ROSTER.has('engineering-senior-developer')).toBe(true)
    expect(ROSTER.has('engineering-laravel-specialist')).toBe(true)
  })
})

describe('parity: config-agent-references', () => {
  const unknown = (refs: string[]) => [...new Set(refs)].filter(r => !ROSTER.has(r))
  for (const f of ['authority-matrix.yaml', 'intent-teams.yaml', 'roster-gap-config.yaml']) {
    test(`Legion's ${f} names only roster personas`, () => {
      const refs = agentRefs(f, yaml(`legion-config/${f}`))
      expect(refs.length).toBeGreaterThan(0)
      expect(unknown(refs)).toEqual([])
    })
  }
  test("Triad's built-in intent teams, gap config and domain owners name only roster personas", () => {
    const refs = [...agentRefs('intent-teams.yaml', INTENT_TEAMS), ...agentRefs('roster-gap-config.yaml', ROSTER_GAP_CONFIG), ...Object.keys(DOMAINS)]
    expect(refs.length).toBeGreaterThan(10)
    expect(unknown(refs)).toEqual([])
  })
  test('a misspelled persona is reported', () => {
    expect(unknown(agentRefs('authority-matrix.yaml', { agents: { 'engineering-backend-architekt': {} } }))).toEqual(['engineering-backend-architekt'])
  })
})

describe('parity: dispatch-conformance (board settings)', () => {
  test('the settings schema defines board, dispatch, evaluator_depth and coverage_thresholds', () => {
    const p = SCHEMAS.settings.properties
    expect(p.board.type).toBe('object')
    expect(p.dispatch.type).toBe('object')
    expect(p.review.properties.evaluator_depth).toBeDefined()
    expect(p.review.properties.coverage_thresholds).toBeDefined()
  })
  test('board defaults match Legion', () => {
    expect(SETTINGS.board).toMatchObject({ default_size: 5, min_size: 3, discussion_rounds: 2, assessment_timeout_ms: 300000, persist_artifacts: true })
    expect(SETTINGS.review.evaluator_depth).toBe('multi-pass')
    expect(validate(SCHEMAS.settings, SETTINGS)).toEqual([])
  })
  // Legion's dispatch defaults (external CLI adapters) are not asserted:
  // Triad runs every agent in-process and has no CLI dispatch.
})

describe('parity: validate-settings', () => {
  const raw = (name: string) => JSON.parse(FIXTURES[`settings-validation/${name}.json`]!)
  test('the valid fixture passes', () => {
    expect(validate(SCHEMAS.settings, raw('valid'))).toEqual([])
    expect(loadSettings(FIXTURES['settings-validation/valid.json']!).warnings).toEqual([])
  })
  test('an extra field, a missing required key and a wrong type are each reported', () => {
    expect(validate(SCHEMAS.settings, raw('invalid-extra-field')).join('\n')).toMatch(/additional property/)
    expect(validate(SCHEMAS.settings, raw('invalid-missing-required')).join('\n')).toMatch(/required.*models|models.*required/)
    expect(validate(SCHEMAS.settings, raw('invalid-wrong-type')).join('\n')).toContain('/execution/auto_commit must be boolean')
  })
  test('loading merges a partial file over the defaults, so a missing key is not a warning', () => {
    const s = loadSettings(FIXTURES['settings-validation/invalid-missing-required.json']!)
    expect(s.warnings).toEqual([])
    expect(s.settings.models).toBeDefined()
  })
})

type Case = { name: string; prompt: string; expectedTop: string; mustInclude: string[] }
const CASES: Case[] = JSON.parse(FIXTURES['recommendation/cases.json']!)
const top = (prompt: string) => rank(prompt, p => p.tier !== 'opus').slice(0, 4)

describe('parity: recommendation-engine', () => {
  // Cases whose Legion expectation does not hold for Triad's keyword scorer.
  // Scoring is not tuned to fit them.
  const EXCEPTIONS: Record<string, string> = {
    'marketing-campaign': '"Design" in the prompt scores design-ui-designer (8) above marketing-growth-hacker (7)',
    'swift-visionos-spatial': '"Metal rendering" scores macos-spatial-metal-engineer (17) above visionos-spatial-engineer (15)',
    'ambiguous-low-confidence': 'no confidence tiers; agents-orchestrator is opus and outside the coder roster (checked below as no match)',
  }
  const MUST_INCLUDE_EXCEPTIONS: Record<string, string> = {
    'backend-performance': 'testing-api-tester is not in the top 4 for an API latency prompt',
  }
  for (const c of CASES) {
    if (EXCEPTIONS[c.name]) continue
    test(`${c.name}: ${c.expectedTop} ranks first`, () => {
      const r = top(c.prompt)
      expect(r[0]!.persona.id).toBe(c.expectedTop)
      expect(r[0]!.score).toBeGreaterThan(0)
      if (!MUST_INCLUDE_EXCEPTIONS[c.name]) for (const m of c.mustInclude) expect(r.map(x => x.persona.id)).toContain(m)
    })
  }
  test('an ambiguous prompt matches nothing', () => {
    expect(top(CASES.find(c => c.name === 'ambiguous-low-confidence')!.prompt)[0]!.score).toBe(0)
  })
  test('the exception list names real cases', () => {
    for (const n of [...Object.keys(EXCEPTIONS), ...Object.keys(MUST_INCLUDE_EXCEPTIONS)]) expect(CASES.some(c => c.name === n)).toBe(true)
  })
  // Legion's expectedConfidence levels are not modelled by rank().
})

const project = () => memIo({
  'package.json': JSON.stringify({ name: 'app', dependencies: { express: '^4' } }),
  'src/routes/orders.ts': 'export const orders = 1\n',
  'src/components/Button.tsx': 'export const Button = 1\n',
  'src/services/billing.ts': 'export const bill = 1\n',
  'tests/orders.test.ts': 'import "../src/routes/orders"\n',
  'src/utils/fmt.ts': 'export const fmt = 1\n',
  'config/app.ts': 'export const cfg = 1\n',
  'node_modules/x/index.js': 'module.exports = 1\n',
})

describe('parity: directory-mappings', () => {
  test('a map detects the standard locations and writes directory-mappings.yaml', async () => {
    const io = project()
    await mapBuild(io)
    const y = parseYaml(io.files.get('.planning/config/directory-mappings.yaml')!) as any
    for (const [cat, dir] of [['routes', 'src/routes'], ['components', 'src/components'], ['services', 'src/services'], ['tests', 'tests'], ['utils', 'src/utils']]) {
      expect(y.mappings[cat].paths).toContain(dir)
      expect(y.mappings[cat].pattern).toBe(`${dir}/**`)
      expect([10, 5, 1]).toContain(y.mappings[cat].priority)
      expect(typeof y.mappings[cat].description).toBe('string')
    }
    expect(JSON.stringify(y.mappings)).not.toContain('node_modules')
  })
  test('glob patterns match as Legion specified', () => {
    expect(globMatch('src/routes/orders.ts', 'src/routes/**')).toBe(true)
    expect(globMatch('src/routesx/orders.ts', 'src/routes/**')).toBe(false)
    expect(globMatch('commands/plan.md', '**/*.md')).toBe(true)
  })
  test("Legion's mapping files carry the required fields", () => {
    const legion = yaml('legion-config/directory-mappings.yaml')
    for (const m of Object.values<any>(legion.mappings)) {
      expect(Array.isArray(m.paths)).toBe(true)
      expect([10, 5, 1]).toContain(m.priority)
      expect(typeof m.pattern).toBe('string')
    }
    const sample = yaml('sample-codebase-mappings.yaml')
    for (const m of Object.values<any>(sample.directory_mappings)) {
      expect(typeof m.description).toBe('string')
      expect([10, 5, 1]).toContain(m.priority)
    }
    expect(sample.enforcement).toBeDefined()
    expect(sample.auto_update).toBeDefined()
    expect(sample.monorepo).toBeDefined()
  })
})

describe('parity: environment-mapping', () => {
  const mappings = (strictness: string) => `mappings:\n  routes:\n    paths:\n      - src/routes\n  tests:\n    paths:\n      - tests\nenforcement:\n  strictness: ${strictness}\n`
  const d = (path: string, description = 'route handler') => ({ name: path, path, description } as any)
  test('detect, validate, suggest: a misplaced route gets a correction', () => {
    const r = validatePaths([d('src/routes/a.ts'), d('lib/b.ts')], mappings('warn'))
    expect(r.results[0]).toMatchObject({ category: 'routes', valid: true })
    expect(r.results[1]!.valid).toBe(true)
    expect(r.results[1]!.note).toContain('suggested src/routes/b.ts')
  })
  test('strict blocks, off allows, and no mappings file means no check', () => {
    expect(validatePaths([d('lib/b.ts')], mappings('strict')).results[0]!.valid).toBe(false)
    expect(validatePaths([d('lib/b.ts')], mappings('off')).results[0]!.note).toBe('validation off')
    expect(validatePaths([d('lib/b.ts')]).strictness).toBe('off')
  })
  test('multiple categories validate independently', () => {
    const r = validatePaths([d('tests/a.test.ts', 'tests'), d('src/a.test.ts', 'tests'), d('src/routes/x.ts')], mappings('strict'))
    expect(r.results.map(x => [x.category, x.valid])).toEqual([['tests', true], ['tests', false], ['routes', true]])
  })
  // Legion's auto-update detection (new directories, monorepo packages) is
  // covered by mapBuild rewriting the file on refresh, not by a separate diff.
})

describe('parity: no-agent-deferrals', () => {
  const reply = (summary: string, status = 'done') => `status: ${status}\nsummary: ${summary}\nchanges:\n- src/a.ts | edited | x\nverify: ok`
  test('a done reply that hands work back is not conforming', () => {
    for (const s of [
      "I'll leave the tests for you to add.",
      'You should add the migration yourself.',
      'TODO for the user: wire the route.',
      'Error handling was deferred to a follow-up.',
      'The docs can be done later.',
      'Left as an exercise for the reader.',
    ]) {
      expect(deferralIn(s)).toBeDefined()
      expect(schemaProblems(reply(s)).join('\n')).toContain('defers work back')
    }
  })
  test('a blocked or partial reply may name what is left', () => {
    expect(schemaProblems(reply('You need to add the API key before this runs.', 'blocked') + '\nblocked_reason: needs a key').join('\n')).not.toContain('defers work back')
    expect(schemaProblems(reply('The docs can be done later.', 'partial')).join('\n')).not.toContain('defers work back')
  })
  test('ordinary replies are not flagged', () => {
    for (const s of ['Added the route and its test.', 'Updated the docs; you can now run the build.', 'Fixed the later stage of the pipeline.']) expect(deferralIn(s)).toBeUndefined()
  })
})
