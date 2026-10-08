// Custom personas (/triad:agent): the 8 validation checks plus the persona
// contract in code, the file under .planning/agents/, the project's custom
// catalog, and runtime registration so plan, build and review can use it.
import { PERSONAS, type Persona } from './personas.ts'
import { BY_ID, ROSTER } from './registry.ts'
import { splitFrontmatter } from './yaml.ts'
import { loadProject, today, type Io } from './io.ts'
import { commit } from './build.ts'

export const CUSTOM_DIR = '.planning/agents'
export const CUSTOM_CATALOG = '.planning/agents/CATALOG.md'
export const COLORS = ['red', 'green', 'blue', 'purple', 'cyan', 'orange', 'yellow', 'pink']
export const DIVISIONS = ['Engineering', 'Design', 'Marketing', 'Product', 'Project Management', 'Testing', 'Support', 'Spatial Computing', 'Specialized', 'Custom']
const LISTS = ['languages', 'frameworks', 'artifact_types', 'review_strengths'] as const
const CONTRACT: [string, RegExp][] = [
  ['Identity', /^## .*Identity/m],
  ['Core Mission', /^## .*(Core Mission|Mission)/m],
  ['Critical Rules', /^## .*(Critical Rules|Rules You Must Follow)/m],
  ['Deliverables or Workflow', /^## .*(Technical Deliverables|Workflow Process|Deliverables|Workflow|Process)/m],
  ['Anti-Patterns', /^## .*(Anti-Patterns|What You Must Not Do|Common Rationalizations|Failure Modes)/m],
  ['Done Criteria', /^## .*(Done Criteria|Success Criteria|Definition of Done|Completion Criteria|Exit Criteria)/m],
]
const CORE_MAX = 7000

export type AgentInput = {
  id: string; name: string; description: string; division: string; color: string; tier?: 'sonnet' | 'haiku' | 'opus'
  languages: string[]; frameworks: string[]; artifact_types: string[]; review_strengths: string[]
  tags: string[]; specialty?: string; body: string
}

const list = (xs: string[]) => `[${xs.join(', ')}]`
export function renderAgent(a: AgentInput): string {
  return ['---', `name: "${a.name.replace(/"/g, "'")}"`, `description: "${a.description.replace(/"/g, "'")}"`, `division: "${a.division}"`, `color: ${a.color}`, `tier: ${a.tier ?? 'sonnet'}`,
    ...LISTS.map(k => `${k}: ${list(a[k] ?? [])}`), `tags: ${list(a.tags ?? [])}`, '---', a.body.replace(/\s+$/, ''), ''].join('\n')
}

// All checks; every failure, not just the first.
export async function validateAgent(io: Io, a: AgentInput): Promise<string[]> {
  const errs: string[] = []
  const id = String(a.id ?? '')
  const file = `${CUSTOM_DIR}/${id}.md`
  const owner = (await io.read(file)) !== undefined ? file : ROSTER.has(id) ? `personas/${id}.md` : undefined
  if (owner) errs.push(`1 name: The name '${id}' is already taken by \`${owner}\`. Try \`${id}-2\` or a more specific name.`)
  if (!/^[a-z][a-z0-9-]+$/.test(id)) errs.push(`2 name format: '${id}' must match ^[a-z][a-z0-9-]+$ (kebab-case, starting with a letter).`)
  const d = String(a.description ?? '')
  if (!d.trim() || /\n/.test(d) || d.trim().length < 10) errs.push('3 description: one line, at least 10 characters.')
  if (!COLORS.includes(a.color)) errs.push(`4 color: '${a.color}' is not one of ${COLORS.join(', ')}.`)
  if (!DIVISIONS.includes(a.division)) errs.push(`5 division: '${a.division}' is not one of ${DIVISIONS.join(', ')}.`)
  const body = String(a.body ?? '')
  const bodyLines = body.replace(/\s+$/, '').split('\n').length
  if (bodyLines < 80) errs.push(`6 body length: ${bodyLines} lines; at least 80 needed.`)
  if (!/^#{1,2} /m.test(body)) errs.push('7 heading: the body needs at least one # or ## heading.')
  if (!a.name || !body.includes(a.name)) errs.push(`8 name in body: the display name '${a.name}' must appear in the body.`)
  for (const [label, re] of CONTRACT) if (!re.test(body)) errs.push(`contract: missing a ## ${label} section.`)
  const total = renderAgent(a).split('\n').length
  if (total > 350) errs.push(`contract: the file is ${total} lines; at most 350.`)
  for (const k of LISTS) {
    const v = a[k] ?? []
    if (v.length < 1 || v.length > 8) errs.push(`contract: ${k} needs 1-8 values (has ${v.length}).`)
    const bad = v.filter(x => !/^[a-z0-9-]+$/.test(x))
    if (bad.length) errs.push(`contract: ${k} values must match ^[a-z0-9-]+$ (${bad.join(', ')}).`)
  }
  if (!a.tags?.length || a.tags.length > 5 || a.tags.some(t => !/^[a-z0-9-]+$/.test(t))) errs.push('tags: 1-5 kebab-case task-type tags.')
  return errs
}

function toPersona(id: string, text: string): Persona | undefined {
  const { data, body } = splitFrontmatter(text)
  if (!data) return undefined
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])
  const tier = data.tier === 'haiku' || data.tier === 'opus' ? data.tier : 'sonnet'
  const core = body.trim().length > CORE_MAX ? body.trim().slice(0, body.trim().lastIndexOf('\n', CORE_MAX)) : body.trim()
  return {
    id, name: String(data.name ?? id), description: String(data.description ?? ''), division: String(data.division ?? 'Custom'), tier,
    languages: arr(data.languages), frameworks: arr(data.frameworks), artifact_types: [...arr(data.artifact_types), ...arr(data.tags)], review_strengths: arr(data.review_strengths), core,
  }
}

export function registerPersona(p: Persona): void {
  const i = PERSONAS.findIndex(x => x.id === p.id)
  if (i >= 0) PERSONAS[i] = p
  else PERSONAS.push(p)
  BY_ID.set(p.id, p)
  ROSTER.add(p.id)
}

// Project custom personas join the roster (idempotent; a bundled id is never replaced).
const BUNDLED = new Set(PERSONAS.map(p => p.id))
export async function loadCustomPersonas(io: Io): Promise<string[]> {
  const out: string[] = []
  for (const e of await io.list(CUSTOM_DIR)) {
    if (e.dir || !e.name.endsWith('.md') || e.name === 'CATALOG.md') continue
    const id = e.name.slice(0, -3)
    if (BUNDLED.has(id) || !/^[a-z][a-z0-9-]+$/.test(id)) continue
    const p = toPersona(id, (await io.read(`${CUSTOM_DIR}/${id}.md`)) ?? '')
    if (p) { registerPersona(p); out.push(id) }
  }
  return out
}

const CATALOG_HEAD = '# Custom Agents\n\nProject personas created with `/triad:agent`. They join the roster for plan, build and review.\n\n| Agent | File | Division | Specialty | Task Types |\n|-------|------|----------|-----------|------------|\n'
function catalogWith(text: string | undefined, a: AgentInput): string {
  const row = `| ${a.id} | \`${CUSTOM_DIR}/${a.id}.md\` | ${a.division} | ${(a.specialty ?? a.description).replace(/\|/g, '/')} | ${a.tags.join(', ')} |`
  const base = text && text.includes('| Agent | File |') ? text.replace(/\s+$/, '') + '\n' : CATALOG_HEAD
  return base.split('\n').filter(l => !l.startsWith(`| ${a.id} |`)).join('\n').replace(/\n*$/, '\n') + row + '\n'
}

function addDecision(state: string, line: string): string {
  const lines = state.split('\n')
  const h = lines.findIndex(l => /^##\s+Recent Decisions/i.test(l))
  if (h < 0) return state.replace(/\s*$/, '') + `\n\n## Recent Decisions\n- ${line}\n`
  let e = h + 1
  while (e < lines.length && !/^## /.test(lines[e]!)) e++
  while (e > h + 1 && !lines[e - 1]!.trim()) e--
  lines.splice(e, 0, `- ${line}`)
  return lines.join('\n').replace(/^- \(none yet\)\n/m, '')
}

// Validate, write, verify, catalog, register, record the decision, commit.
export async function agentCreate(io: Io, a: AgentInput, opts: { limit?: { count: number; limit: number; suggestions: string[] }; force?: boolean } = {}): Promise<string> {
  const p = await loadProject(io)
  if (!p.project) return 'No Triad project found. Run `/triad:start` to initialize.'
  if (opts.limit && opts.limit.count >= opts.limit.limit && !opts.force) {
    return [`The roster is at its agent limit (${opts.limit.count} of ${opts.limit.limit}). Consolidate before adding:`, ...opts.limit.suggestions.map(s => `- ${s}`), 'Pass force to create it anyway.'].join('\n')
  }
  a = { ...a, tags: a.tags ?? [], body: String(a.body ?? '') }
  const errs = await validateAgent(io, a)
  if (errs.length) return ['Validation failed (nothing was written). Fix these and call create again; all checks re-run:', ...errs.map(e => `- ${e}`)].join('\n')
  const file = `${CUSTOM_DIR}/${a.id}.md`
  await io.write(file, renderAgent(a))
  if ((await io.read(file)) === undefined) return `Writing ${file} failed; the catalog was not touched.`
  let catalogNote = `${CUSTOM_CATALOG} (row added)`
  try {
    await io.write(CUSTOM_CATALOG, catalogWith(await io.read(CUSTOM_CATALOG), a))
    if (!(await io.read(CUSTOM_CATALOG))?.includes(`| ${a.id} |`)) throw new Error('row missing after write')
  } catch {
    catalogNote = `update failed. The agent file was created successfully at \`${file}\`; add its row to ${CUSTOM_CATALOG} by hand.`
  }
  const persona = toPersona(a.id, renderAgent(a))!
  registerPersona(persona)
  if (p.stateText !== undefined) await io.write('.planning/STATE.md', addDecision(p.stateText, `Added custom agent ${a.id} (${a.division}) for ${a.tags.join(', ')} (${today(io)})`))
  const err = p.settings.execution.auto_commit === false ? undefined
    : await commit(io, [file, CUSTOM_CATALOG, '.planning/STATE.md'], `feat(${p.settings.execution.commit_prefix}): add custom agent ${a.id}\n\nDivision: ${a.division}\nTask types: ${a.tags.join(', ')}\nFile: ${file}`)
  return [
    `Name: ${a.name} (${a.id})`, `Division: ${a.division}`, `File: ${file}`, `Task types: ${a.tags.join(', ')}`, `Registry: ${catalogNote}`, ...(err ? [`Commit: ${err}`] : []),
    '', `Your new agent '${a.id}' is ready. It will appear in \`/triad:plan\` recommendations for tasks matching: ${a.tags.join(', ')}.`,
  ].join('\n')
}

