// The memory manager (memory-manager, workflow-common-memory, /learn) in code:
// OUTCOMES.md event log with decay recall and agent scores, the knowledge tables
// (PATTERNS/ERRORS/PREFERENCES), /learn entries, and archive-not-delete prune.
// Every read degrades to empty when a file is missing; memory.enabled=false
// turns every store and recall off.
import { today, type Io } from './io.ts'
import { parseState } from './planning.ts'
import { BY_ID } from './registry.ts'
import type { Settings } from './settings.ts'

const DIR = '.planning/memory'
export const OUTCOMES = `${DIR}/OUTCOMES.md`
export const ARCHIVE = `${DIR}/ARCHIVE.md`
export const RETRO = `${DIR}/RETRO.md`
const COLS = '| ID | Date | Branch | Phase | Plan | Agent | Task Type | Outcome | Importance | Tags | Summary |\n|----|------|--------|-------|------|-------|-----------|---------|------------|------|---------|'

export const OUTCOMES_HEADER = `# Memory — Outcome Log

Records agent performance and task outcomes for cross-session learning.
Managed by memory-manager skill. Do not edit manually unless pruning old records.

## Records

${COLS}
`
const ARCHIVE_HEADER = `# Memory — Archived Outcomes

Pruned records from OUTCOMES.md. Preserved for historical reference.
Records archived by memory-manager prune operation. Do not edit manually.

## Archived Records

${COLS}
`

export type Outcome = {
  id: string; date: string; branch: string; phase: number; plan: string; agent: string
  task_type: string; outcome: 'success' | 'partial' | 'failed'; importance: number; tags: string[]; summary: string
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
const isRow = (l: string) => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l)
const esc = (s: string) => s.replace(/\|/g, '/').replace(/\s*\n\s*/g, ' ').trim()

// Table rows whose first cell matches `id` (header and separator skipped).
function tableRows(text: string, id: RegExp): string[][] {
  return text.split('\n').filter(isRow).map(cells).filter(c => id.test(c[0] ?? ''))
}

export function parseOutcomes(text: string): Outcome[] {
  return tableRows(text, /^O-\d{3,}$/).map(c => {
    // Legacy rows have no Branch column (10 cells).
    const b = c.length >= 11 ? 1 : 0
    return {
      id: c[0]!, date: c[1] ?? '', branch: b ? c[2]! : '', phase: Number(c[2 + b]) || 0, plan: c[3 + b] ?? '', agent: c[4 + b] ?? '',
      task_type: c[5 + b] || 'general', outcome: (c[6 + b] ?? 'success') as Outcome['outcome'], importance: Number(c[7 + b]) || 1,
      tags: (c[8 + b] ?? '').split(',').map(t => t.trim()).filter(Boolean), summary: c[9 + b] ?? '',
    }
  })
}

const outcomeRow = (o: Outcome) => `| ${[o.id, o.date, o.branch || 'unknown', o.phase, o.plan, o.agent, o.task_type, o.outcome, o.importance, o.tags.join(', '), esc(o.summary)].join(' | ')} |`

export const nextId = (prefix: string, ids: string[]) => {
  const max = Math.max(0, ...ids.map(i => Number(i.match(/(\d+)$/)?.[1] ?? 0)))
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export function recencyWeight(date: string, now: Date): number {
  const t = Date.parse(date)
  if (!Number.isFinite(t)) return 0.4
  const days = (now.getTime() - t) / 86_400_000
  return days <= 7 ? 1 : days <= 30 ? 0.7 : days <= 90 ? 0.4 : 0.1
}
export const decayScore = (o: Outcome, now: Date) => o.importance * recencyWeight(o.date, now)

const enabled = (s: Settings) => (s as any).memory?.enabled !== false

async function branchOf(io: Io): Promise<string> {
  const r = await io.run(['git', 'branch', '--show-current']).catch(() => undefined)
  return r?.exitCode === 0 && r.stdout.trim() ? r.stdout.trim() : 'unknown'
}

// Importance: base by result, +1 for the agent's first time on this task type,
// +1 for cross-division work, +1 for a review with 3+ blockers; capped at 5.
export function importanceOf(o: { outcome: Outcome['outcome']; cycles?: number; escalated?: boolean; blockers?: number; firstTime?: boolean; crossDivision?: boolean; trivial?: boolean }): number {
  let base = o.outcome === 'failed' ? 5 : o.escalated ? 4 : o.outcome === 'partial' || (o.cycles ?? 1) >= 2 ? 3 : o.trivial ? 1 : 2
  if (o.firstTime) base++
  if (o.crossDivision) base++
  if ((o.blockers ?? 0) >= 3) base++
  return Math.min(5, base)
}

const TASK_DIVISION: Record<string, string> = { 'quality-review': 'Testing', testing: 'Testing', implementation: 'Engineering', design: 'Design', marketing: 'Marketing', documentation: 'Product' }

// A persona's task type for outcome records: its division's kind of work.
export function taskTypeOf(p: { division: string }): string {
  return ({ Engineering: 'implementation', Testing: 'quality-review', Design: 'design', Marketing: 'marketing', Product: 'documentation', 'Project Management': 'planning', Support: 'support', 'Spatial Computing': 'implementation', Specialized: 'implementation' } as Record<string, string>)[p.division] ?? 'general'
}

export type StoreInput = Omit<Outcome, 'id' | 'date' | 'branch' | 'importance' | 'tags'> & { tags?: string[]; cycles?: number; escalated?: boolean; blockers?: number }

export async function storeOutcome(io: Io, settings: Settings, input: StoreInput): Promise<Outcome | undefined> {
  if (!enabled(settings)) return undefined
  const text = (await io.read(OUTCOMES)) ?? OUTCOMES_HEADER
  const rows = parseOutcomes(text)
  const persona = BY_ID.get(input.agent)
  const div = TASK_DIVISION[input.task_type]
  const o: Outcome = {
    ...input,
    task_type: input.task_type || 'general',
    id: nextId('O-', rows.map(r => r.id)),
    date: today(io),
    branch: await branchOf(io),
    importance: importanceOf({ ...input, firstTime: !rows.some(r => r.agent === input.agent && r.task_type === input.task_type), crossDivision: !!(div && persona && persona.division !== div) }),
    tags: input.tags ?? [],
  }
  await io.write(OUTCOMES, text.replace(/\n*$/, '\n') + outcomeRow(o) + '\n')
  const m = (settings as any).memory ?? {}
  if (m.auto_prune && rows.length + 1 > (m.prune_threshold ?? 200)) await prune(io, settings)
  return o
}

export type RecallQuery = { tags?: string[]; agent?: string; task_type?: string; branch?: string; limit?: number }

export async function recallOutcomes(io: Io, settings: Settings, q: RecallQuery = {}): Promise<{ records: Outcome[]; total: number; note?: string }> {
  if (!enabled(settings)) return { records: [], total: 0 }
  const text = await io.read(OUTCOMES)
  if (text === undefined) return { records: [], total: 0 }
  const all = parseOutcomes(text)
  const now = io.now()
  const branch = q.branch && q.branch !== 'all' ? (q.branch === 'current' ? await branchOf(io) : q.branch) : undefined
  const tags = (q.tags ?? []).map(t => t.toLowerCase())
  const hit = all.filter(o =>
    decayScore(o, now) >= 0.2 &&
    (!tags.length || o.tags.some(t => tags.includes(t.toLowerCase())) || tags.includes(o.task_type.toLowerCase())) &&
    (!q.agent || o.agent === q.agent) && (!q.task_type || o.task_type === q.task_type) &&
    (!branch || (o.branch || 'main') === branch))
    .sort((a, b) => decayScore(b, now) - decayScore(a, now))
  const threshold = (settings as any).memory?.prune_threshold ?? 200
  return {
    records: hit.slice(0, q.limit ?? 20), total: all.length,
    note: all.length > threshold ? `OUTCOMES.md has ${all.length} records. Run \`/triad:learn --prune\` to archive old entries, or enable \`memory.auto_prune\` in settings.json.` : undefined,
  }
}

// memory_score = clamp((success_rate*3 + avg_importance*0.5) * avg_recency, 0, 5), agents with 2+ records.
export async function agentScores(io: Io, settings: Settings, taskTypes: string[] = []): Promise<Record<string, number>> {
  const { records } = await recallOutcomes(io, settings, { tags: taskTypes, limit: 10_000 })
  const now = io.now()
  const by = new Map<string, Outcome[]>()
  for (const r of records) by.set(r.agent, [...(by.get(r.agent) ?? []), r])
  const out: Record<string, number> = {}
  for (const [agent, rs] of by) {
    if (rs.length < 2) continue
    const rate = rs.filter(r => r.outcome === 'success').length / rs.length
    const imp = rs.reduce((s, r) => s + r.importance, 0) / rs.length
    const rec = rs.reduce((s, r) => s + recencyWeight(r.date, now), 0) / rs.length
    out[agent] = Math.round(Math.max(0, Math.min(5, (rate * 3 + imp * 0.5) * rec)) * 100) / 100
  }
  return out
}

export async function briefing(io: Io, settings: Settings): Promise<string | undefined> {
  const text = enabled(settings) ? await io.read(OUTCOMES) : undefined
  if (text === undefined) return undefined
  const all = parseOutcomes(text)
  if (!all.length) return undefined
  const recent = (await recallOutcomes(io, settings, { limit: 5 })).records
  const by = new Map<string, Outcome[]>()
  for (const r of all) by.set(r.agent, [...(by.get(r.agent) ?? []), r])
  const top = [...by].sort((a, b) => b[1].length - a[1].length).slice(0, 3)
  return [
    `Memory: ${all.length} outcome records.`,
    ...recent.map(r => `- ${r.id} ${r.date} ${r.plan} ${r.agent}: ${r.outcome} — ${r.summary}`),
    `Top agents: ${top.map(([a, rs]) => `${a} (${rs.length} tasks, ${Math.round(rs.filter(r => r.outcome === 'success').length / rs.length * 100)}% success)`).join(', ')}`,
  ].join('\n')
}

// Archive outcomes older than prune_age_days with importance <= 3 outside the current phase.
export async function prune(io: Io, settings: Settings): Promise<string> {
  const text = await io.read(OUTCOMES)
  if (text === undefined) return 'No outcomes to prune. OUTCOMES.md does not exist.'
  const m = (settings as any).memory ?? {}
  const age = m.prune_age_days ?? 90
  const stateText = await io.read('.planning/STATE.md')
  const current = stateText ? parseState(stateText).phase : undefined
  const now = io.now().getTime()
  const all = parseOutcomes(text)
  const old = (o: Outcome) => { const t = Date.parse(o.date); return Number.isFinite(t) && (now - t) / 86_400_000 > age }
  const out = all.filter(o => old(o) && o.importance <= 3 && o.phase !== current)
  if (!out.length) return 'No records eligible for pruning. All records are either recent, high-importance, or in the current phase.'
  const ids = new Set(out.map(o => o.id))
  const kept = text.split('\n').filter(l => !(isRow(l) && ids.has(cells(l)[0]!))).join('\n')
  const archive = ((await io.read(ARCHIVE)) ?? ARCHIVE_HEADER).replace(/\n*$/, '\n') + out.map(outcomeRow).join('\n') + '\n'
  await io.write(ARCHIVE, archive)
  await io.write(OUTCOMES, kept)
  const check = parseOutcomes((await io.read(OUTCOMES)) ?? '')
  const archived = parseOutcomes((await io.read(ARCHIVE)) ?? '')
  if (check.length !== all.length - out.length || !out.every(o => archived.some(a => a.id === o.id))) {
    await io.write(OUTCOMES, text)
    return `Prune verification failed. OUTCOMES.md restored to pre-prune state.\n${out.map(outcomeRow).join('\n')}`
  }
  return [
    `Pruned ${out.length} records → ${ARCHIVE}`,
    `Remaining: ${check.length} active records`,
    `Preserved: ${check.filter(o => o.importance >= 4).length} high-importance (4-5), ${check.filter(o => o.phase === current).length} current-phase`,
    `Archive total: ${archived.length} records`,
  ].join('\n')
}

// ---- Knowledge tables (store-side, used by review) ----

const KNOWLEDGE = {
  pattern: { file: `${DIR}/PATTERNS.md`, title: 'Pattern Library', section: 'Patterns', id: 'P-', cols: ['ID', 'Date', 'Branch', 'Pattern', 'Context', 'Reuse Criteria', 'Source', 'Tags'] },
  error: { file: `${DIR}/ERRORS.md`, title: 'Error Fixes', section: 'Errors', id: 'E-', cols: ['ID', 'Date', 'Branch', 'Error Signature', 'Fix', 'Agent', 'Resolved', 'Tags'] },
  preference: { file: `${DIR}/PREFERENCES.md`, title: 'User Preferences', section: 'Preferences', id: 'D-', cols: ['ID', 'Date', 'Branch', 'Decision Point', 'Context', 'Proposed', 'User Choice', 'Signal', 'Agent', 'Tags'] },
} as const
export type KnowledgeKind = keyof typeof KNOWLEDGE

function knowledgeHeader(k: KnowledgeKind): string {
  const d = KNOWLEDGE[k]
  return `# Memory — ${d.title}\n\nManaged by the memory manager. Learnings recorded with /triad:learn are kept below the table.\n\n## ${d.section}\n\n| ${d.cols.join(' | ')} |\n|${d.cols.map(c => '-'.repeat(c.length + 2)).join('|')}|\n`
}

// Inserts a row at the end of the file's table (creating the file and table if needed).
export async function storeKnowledge(io: Io, settings: Settings, kind: KnowledgeKind, values: string[]): Promise<string | undefined> {
  if (!enabled(settings)) return undefined
  const d = KNOWLEDGE[kind]
  let text = (await io.read(d.file)) ?? knowledgeHeader(kind)
  if (!text.includes(`| ${d.cols[0]} | ${d.cols[1]} |`)) text = knowledgeHeader(kind) + '\n' + text
  const rows = tableRows(text, new RegExp(`^${d.id}\\d{3,}$`))
  // An unresolved error with the same signature is updated in place (the one edit memory makes).
  if (kind === 'error') {
    const sig = values[0]!.toLowerCase()
    const same = rows.find(r => (r[3] ?? '').toLowerCase() === sig)
    if (same?.[6] === 'true') return same[0]
    if (same) {
      const line = text.split('\n').find(l => isRow(l) && cells(l)[0] === same[0])!
      const c = cells(line); c[4] = esc(values[1] ?? ''); c[6] = 'true'
      await io.write(d.file, text.replace(line, `| ${c.join(' | ')} |`))
      return same[0]
    }
  }
  const id = nextId(d.id, rows.map(r => r[0]!))
  const row = `| ${[id, today(io), await branchOf(io), ...values.map(esc)].join(' | ')} |`
  const lines = text.split('\n')
  const head = lines.findIndex(l => l.startsWith(`| ${d.cols[0]} | ${d.cols[1]} |`))
  let at = head + 2
  while (at < lines.length && isRow(lines[at]!)) at++
  lines.splice(at, 0, row)
  await io.write(d.file, lines.join('\n'))
  return id
}

// ---- /triad:learn ----

const LEARN = {
  pattern: { file: `${DIR}/PATTERNS.md`, id: 'PAT-', kind: 'pattern' as const },
  pitfall: { file: `${DIR}/ERRORS.md`, id: 'PIT-', kind: 'error' as const },
  preference: { file: `${DIR}/PREFERENCES.md`, id: 'PRF-', kind: 'preference' as const },
}
export type LearnType = keyof typeof LEARN
export type Learning = { id: string; type: LearnType | 'outcome' | 'retro'; summary: string; tags: string[]; date: string; body: string; file: string }

function learnings(text: string, file: string): Learning[] {
  const out: Learning[] = []
  const re = /^## ((?:PAT|PIT|PRF)-\d{3,}): (.*)$/gm
  const heads = [...text.matchAll(re)]
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1]!.index! : text.length
    const block = text.slice(h.index! + h[0].length, end)
    const field = (n: string) => block.match(new RegExp(`^- \\*\\*${n}\\*\\*: (.*)$`, 'm'))?.[1]?.trim() ?? ''
    const body = block.replace(/^- \*\*\w+\*\*: .*$/gm, '').replace(/\n---\s*$/, '').trim()
    out.push({ id: h[1]!, type: h[1]!.startsWith('PAT') ? 'pattern' : h[1]!.startsWith('PIT') ? 'pitfall' : 'preference', summary: h[2]!.trim(), tags: field('Tags').split(',').map(t => t.trim()).filter(Boolean), date: field('Date'), body, file })
  })
  return out
}

export async function learnRecord(io: Io, input: { type: LearnType; summary: string; tags: string[]; text: string }): Promise<string> {
  const d = LEARN[input.type]
  if (!d) return `type must be pattern, pitfall or preference`
  const existing = (await io.read(d.file)) ?? ''
  const ids = learnings(existing, d.file).map(l => l.id)
  const id = nextId(d.id, ids)
  const st = await io.read('.planning/STATE.md')
  const phase = st ? parseState(st).phase : undefined
  const Type = input.type[0]!.toUpperCase() + input.type.slice(1)
  const head = existing || `# ${Type}s\n\nProject-specific ${input.type}s recorded via \`/triad:learn\`.\nReferenced by \`/triad:plan\` and \`/triad:build\` for context-aware execution.\n`
  const entry = `\n## ${id}: ${input.summary.slice(0, 80)}\n- **Date**: ${today(io)}\n- **Type**: ${input.type}\n- **Tags**: ${input.tags.map(t => t.toLowerCase()).join(', ')}\n- **Phase**: ${phase ?? 'N/A'}\n\n${input.text.trim()}\n\n---\n`
  await io.write(d.file, head.replace(/\n*$/, '\n') + entry)
  return `${input.type} recorded: ${id} — ${input.summary.slice(0, 80)}\nSaved to ${d.file}\nThis learning will inform future \`/triad:plan\` recommendations.`
}

async function allLearnings(io: Io, settings: Settings): Promise<Learning[]> {
  const out: Learning[] = []
  for (const d of Object.values(LEARN)) out.push(...learnings((await io.read(d.file)) ?? '', d.file))
  // Table rows of the knowledge files, the retro log and outcomes are searchable too.
  for (const [k, d] of Object.entries(KNOWLEDGE)) {
    for (const r of tableRows((await io.read(d.file)) ?? '', new RegExp(`^${d.id}\\d{3,}$`))) {
      out.push({ id: r[0]!, type: k === 'error' ? 'pitfall' : (k as LearnType), summary: r[3] ?? '', tags: (r[r.length - 1] ?? '').split(',').map(t => t.trim()).filter(Boolean), date: r[1] ?? '', body: r.slice(4, -1).join(' — '), file: d.file })
    }
  }
  const retro = (await io.read(RETRO)) ?? ''
  for (const m of retro.matchAll(/^## (.+)$\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) out.push({ id: `RETRO ${m[1]!.trim()}`, type: 'retro', summary: m[1]!.trim(), tags: [], date: '', body: m[2]!.trim(), file: RETRO })
  if (enabled(settings)) for (const o of parseOutcomes((await io.read(OUTCOMES)) ?? '')) out.push({ id: o.id, type: 'outcome', summary: o.summary, tags: [...o.tags, o.task_type], date: o.date, body: `${o.plan} ${o.agent} ${o.outcome}`, file: OUTCOMES })
  return out
}

export async function learnRecall(io: Io, settings: Settings, topic: string): Promise<string> {
  if (!(await io.list(DIR)).length) return 'No memory directory found. Record your first learning with `/triad:learn <lesson>`.'
  const t = topic.toLowerCase().trim()
  const words = t.split(/\s+/).filter(Boolean)
  const scored = (await allLearnings(io, settings)).map(l => {
    let s = 0
    if (l.tags.some(g => g.toLowerCase() === t || words.includes(g.toLowerCase()))) s += 3
    if (l.summary.toLowerCase().includes(t)) s += 2
    if (l.body.toLowerCase().includes(t)) s += 1
    return { l, s }
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s)
  if (!scored.length) return `No learnings found for '${topic}'. Run \`/triad:learn --list\` to see everything recorded.`
  return [`# Learnings: "${topic}"`, '', `${scored.length} entries found:`, '', ...scored.map(({ l }) =>
    `**${l.id}** (${l.type}) — ${l.summary}\nTags: ${l.tags.join(', ') || '-'}\n> ${l.body.split('\n').slice(0, 2).join('\n> ')}\n`)].join('\n')
}

export async function learnList(io: Io): Promise<string> {
  if (!(await io.list(DIR)).length) return 'No memory directory found. Record your first learning with `/triad:learn <lesson>`.'
  const sections: string[] = ['# Project Learnings', '']
  let total = 0
  for (const [type, d] of Object.entries(LEARN)) {
    const ls = learnings((await io.read(d.file)) ?? '', d.file)
    total += ls.length
    sections.push(`## ${type[0]!.toUpperCase() + type.slice(1)}s (${ls.length})`, '')
    if (ls.length) sections.push('| ID | Summary | Tags | Date |', '|----|---------|------|------|', ...ls.map(l => `| ${l.id} | ${esc(l.summary)} | ${l.tags.join(', ')} | ${l.date} |`), '')
  }
  if (!total) return 'No learnings recorded yet. Record one with `/triad:learn <lesson>`.'
  sections.push(`**Total**: ${total} learnings recorded`)
  return sections.join('\n')
}

// Claude Code's auto-memory: read only, advisory, ~500 tokens at most.
export async function claudeMemory(read: (abs: string) => Promise<string | undefined>, home: string, root: string): Promise<string | undefined> {
  const key = root.replace(/[^A-Za-z0-9]/g, '-')
  const text = await read(`${home}/.claude/projects/${key}/memory/MEMORY.md`)
  return text?.trim() ? text.trim().slice(0, 2000) : undefined
}
