// Embeds Legion's data in the plugin (Phase 5). Reads a Legion checkout as plain
// files; runs none of its code.
//
//   node --experimental-strip-types --no-warnings triad/scripts/gen_legion.ts <legion-dir>
//
// Writes:
//   triad/personas/<id>.md          compact persona: frontmatter + tier + distilled core
//   triad/hooks/legion/data.ts      schemas, templates, settings defaults, control modes,
//                                   review rubrics, authority domains
//   triad/hooks/legion/personas.ts  the persona registry, bundled from triad/personas/
//
// Legion is MIT licensed; see triad/LEGION-NOTICE.md.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseYaml, splitFrontmatter } from '../hooks/legion/yaml.ts'

const legion = process.argv[2]
if (!legion) throw new Error('usage: gen_legion.ts <legion-dir>')
const triad = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(join(legion, p), 'utf8')
const json = (p: string) => JSON.parse(read(p))

// Tiers (SPEC section 10, PARITY section 14). Default sonnet.
const TIERS: Record<string, 'opus' | 'haiku'> = {
  'project-management-studio-producer': 'opus',
  polymath: 'opus',
  'agents-orchestrator': 'opus',
  'testing-test-results-analyzer': 'haiku',
  'support-executive-summary-generator': 'haiku',
}

// ---- personas -------------------------------------------------------------

const CORE_SECTIONS: [RegExp, number][] = [
  [/identity/i, 1400],
  [/core mission/i, 1400],
  [/critical rules/i, 1800],
  [/communication style/i, 600],
  [/done criteria/i, 700],
]

function sections(body: string): { title: string; text: string }[] {
  const out: { title: string; text: string }[] = []
  let cur: { title: string; text: string } | undefined = { title: '', text: '' }
  for (const line of body.split('\n')) {
    if (/^## /.test(line)) {
      if (cur) out.push(cur)
      cur = { title: line.replace(/^##\s+/, '').replace(/[^\p{L}\p{N} &/,'-]/gu, '').trim(), text: '' }
    } else cur!.text += line + '\n'
  }
  if (cur) out.push(cur)
  return out
}

// Cut at a line boundary under `max` chars; drop fenced templates (they are long and rarely needed).
function trimSection(text: string, max: number): string {
  const lines = text.replace(/```[\s\S]*?```/g, '').split('\n').filter((l, i, a) => l.trim() || (a[i - 1] ?? '').trim())
  let out = ''
  for (const l of lines) {
    if (out.length + l.length + 1 > max) break
    out += l + '\n'
  }
  return out.trim()
}

function distill(body: string): string {
  const secs = sections(body)
  const intro = trimSection(secs[0].text.replace(/^#\s.*$/m, ''), 700)
  const parts = [intro]
  for (const [re, max] of CORE_SECTIONS) {
    const s = secs.find(x => re.test(x.title))
    if (s) parts.push(`## ${s.title}\n${trimSection(s.text, max)}`)
  }
  return parts.filter(Boolean).join('\n\n')
}

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])

type Persona = {
  id: string; name: string; description: string; division: string; tier: string
  languages: string[]; frameworks: string[]; artifact_types: string[]; review_strengths: string[]; core: string
}

const yamlStr = (s: string) => JSON.stringify(s)
const yamlList = (a: string[]) => `[${a.map(x => (/^[\w.+#/-]+$/.test(x) ? x : JSON.stringify(x))).join(', ')}]`

mkdirSync(join(triad, 'personas'), { recursive: true })
const personas: Persona[] = []
for (const f of readdirSync(join(legion, 'agents')).filter(f => f.endsWith('.md')).sort()) {
  const id = f.replace(/\.md$/, '')
  const { data, body } = splitFrontmatter(read(`agents/${f}`))
  const d = data ?? {}
  const p: Persona = {
    id,
    name: String(d.name ?? id),
    description: String(d.description ?? ''),
    division: String(d.division ?? ''),
    tier: TIERS[id] ?? 'sonnet',
    languages: list(d.languages),
    frameworks: list(d.frameworks),
    artifact_types: list(d.artifact_types),
    review_strengths: list(d.review_strengths),
    core: distill(body),
  }
  personas.push(p)
  const fm = [
    '---',
    `name: ${yamlStr(p.name)}`,
    `description: ${yamlStr(p.description)}`,
    `division: ${yamlStr(p.division)}`,
    `tier: ${p.tier}`,
    `languages: ${yamlList(p.languages)}`,
    `frameworks: ${yamlList(p.frameworks)}`,
    `artifact_types: ${yamlList(p.artifact_types)}`,
    `review_strengths: ${yamlList(p.review_strengths)}`,
    `source: legion agents/${f} (MIT)`,
    '---',
    '',
  ].join('\n')
  writeFileSync(join(triad, 'personas', f), fm + p.core + '\n')
}

// Bundle from the compact files, so edits to triad/personas/*.md are what ships.
const bundled = readdirSync(join(triad, 'personas')).filter(f => f.endsWith('.md')).sort().map(f => {
  const { data, body } = splitFrontmatter(readFileSync(join(triad, 'personas', f), 'utf8'))
  const d = data ?? {}
  return {
    id: f.replace(/\.md$/, ''), name: String(d.name), description: String(d.description), division: String(d.division),
    tier: String(d.tier), languages: list(d.languages), frameworks: list(d.frameworks),
    artifact_types: list(d.artifact_types), review_strengths: list(d.review_strengths), core: body.trim(),
  }
})

const HEADER = '// Generated by triad/scripts/gen_legion.ts from Legion (MIT; see triad/LEGION-NOTICE.md). Do not edit.\n'
writeFileSync(join(triad, 'hooks/legion/personas.ts'), HEADER +
  `export type Persona = { id: string; name: string; description: string; division: string; tier: 'opus' | 'sonnet' | 'haiku'; languages: string[]; frameworks: string[]; artifact_types: string[]; review_strengths: string[]; core: string }\n\n` +
  `export const PERSONAS: Persona[] = ${JSON.stringify(bundled, null, 1)}\n`)

// ---- rubrics (review-panel Section 2) --------------------------------------

type Rubric = { name: string; criteria: { name: string; check: string }[] }
const rubrics: Record<string, Rubric> = {}
const panel = read('skills/review-panel/SKILL.md')
const reg = panel.slice(panel.indexOf('### Rubric Definitions'), panel.indexOf('#### Division Default Rubrics'))
for (const m of reg.matchAll(/\*\*([a-z0-9-]+)\*\* — ([^\n]+)\n\|[^\n]*\n\|[^\n]*\n((?:\|[^\n]*\n)+)/g)) {
  rubrics[m[1]] = {
    name: m[2].trim(),
    criteria: m[3].trim().split('\n').map(r => r.split('|').map(c => c.trim())).map(c => ({ name: c[2], check: c[3] })),
  }
}
const defaults: Record<string, Rubric> = {}
const defs = panel.slice(panel.indexOf('#### Division Default Rubrics'))
for (const m of defs.matchAll(/^\| (Testing|Design|Engineering|Product|Project Management) \| ([^|]+) \| ([^|]+) \|$/gm)) {
  defaults[m[1]] = { name: m[2].trim(), criteria: m[3].split(',').map(s => s.trim()).map(s => ({ name: s[0].toUpperCase() + s.slice(1), check: s })) }
}

// ---- authority domains, control modes --------------------------------------

const authority = parseYaml(read('.planning/config/authority-matrix.yaml')) as any
const domains: Record<string, string[]> = {}
for (const [id, a] of Object.entries<any>(authority.agents ?? {})) domains[id] = list(a.exclusive_domains)
const controlModes = (parseYaml(read('.planning/config/control-modes.yaml')) as any).profiles

const stripComment = (t: string) => t.replace(/^<!--[\s\S]*?-->\n*/, '')
const data = {
  schemas: {
    plan: json('docs/schemas/plan-frontmatter.schema.json'),
    summary: json('docs/schemas/summary.schema.json'),
    finding: json('docs/schemas/review-finding.schema.json'),
    outcome: json('docs/schemas/outcomes-record.schema.json'),
    settings: json('docs/settings.schema.json'),
  },
  templates: {
    project: stripComment(read('skills/questioning-flow/templates/project-template.md')),
    roadmap: stripComment(read('skills/questioning-flow/templates/roadmap-template.md')),
    state: stripComment(read('skills/questioning-flow/templates/state-template.md')),
  },
  settings: (({ $schema, ...rest }) => rest)(json('settings.json')),
  controlModes,
  rubrics,
  defaultRubrics: defaults,
  domains,
}
writeFileSync(join(triad, 'hooks/legion/data.ts'), HEADER +
  Object.entries(data).map(([k, v]) => `export const ${k.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}: any = ${JSON.stringify(v, null, 1)}\n`).join('\n'))

console.log(`personas ${bundled.length}, rubrics ${Object.keys(rubrics).length} + ${Object.keys(defaults).length} defaults, domains ${Object.keys(domains).length}`)
