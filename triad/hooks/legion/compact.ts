// Phase compaction (memory-manager Section 12, execution-tracker Step 3.5) and
// SUMMARY.md validation (summary.schema.json plus agent-communication.yaml
// summary_export_standard), in code from the SUMMARY files.
import { SCHEMAS } from './data.ts'
import { SUMMARY_EXPORT_STANDARD } from './execdata.ts'
import { validate } from './schema.ts'
import { getField, getSection, handoffOf, pad2, succeeded, summaryStatus, type Plan } from './planning.ts'
import { escalationRows } from './escalation.ts'

// Combined handoff text of the completed summaries above which a phase is
// compacted before its later waves run (the phase-complete compaction always runs).
export const HANDOFF_BUDGET = 6000
// Legion's target: the compacted summary is 30-50% of the originals.
export const COMPACT_TARGET = 0.5

export const compactedPath = (rel: string, n: number) => `${rel}/${pad2(n)}-COMPACTED.md`

const bulletsOf = (s: string | undefined) => (s ?? '').split('\n').filter(l => /^\s*-\s+/.test(l)).map(l => l.replace(/^\s*-\s+(\[[ x]\]\s*)?/, '').trim()).filter(l => l && !/^\(none\)$/i.test(l))
const handoffLine = (s: string, key: string) => getSection(s, /^##\s+Handoff Context/i)?.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.*)`, 'i'))?.[1]?.trim()
const listOf = (v: string | undefined) => (v && !/^\(none\)$/i.test(v) ? v.split(/;\s*/).filter(Boolean) : [])

export type Compacted = { text: string; covered: string[]; missing: string[]; ratio: number }

// Built from the succeeded summaries only. Preserved: deliverables, decisions,
// files, requirements, verification, agents. Trimmed: command output, task traces.
export function compactPhase(o: { n: number; dir: string; name: string; date: string; plans: Plan[]; summaries: Record<string, string> }): Compacted | undefined {
  const done = o.plans.filter(p => o.summaries[p.id] !== undefined && succeeded(summaryStatus(o.summaries[p.id]!)))
  if (!done.length) return undefined
  const reqs = [...new Set(done.flatMap(p => p.fm.requirements))]
  const files: [string, string][] = []
  const rows = done.map(p => {
    const s = o.summaries[p.id]!
    const fs = bulletsOf(getSection(s, /^##\s+Files Modified/i)).map(f => f.replace(/`/g, '').split(/\s+--\s+|\s+\|\s+/)[0]!.trim())
    for (const f of fs) files.push([f, `${p.id}: ${p.title}`])
    return {
      p, fs,
      agent: getField(s, 'Agent') ?? p.fm.agents[0] ?? '?',
      status: summaryStatus(s)!,
      decisions: bulletsOf(getSection(s, /^##\s+(Key Decisions|Decisions Made)/i)).slice(0, 3).map(d => d.slice(0, 160)),
      verify: (getSection(s, /^##\s+Verification Results/i) ?? '').split('\n')[0]!.replace(/\s*\(run by Triad.*$/, '').trim(),
      conventions: listOf(handoffLine(s, 'Conventions established')).slice(0, 3).map(c => c.slice(0, 160)),
      open: listOf(handoffLine(s, 'Open questions')).map(q => q.slice(0, 160)),
    }
  })
  const body = [
    `# Phase ${o.n}: ${o.name} — Compacted Summary`, '',
    '## Deliverables', ...rows.map(r => `- ${r.p.id} ${r.p.title} (${r.status})${r.fs.length ? `: ${r.fs.join(', ')}` : ''}`), '',
    '## Decisions', ...(rows.some(r => r.decisions.length) ? rows.flatMap(r => r.decisions.map(d => `- ${r.p.id}: ${d}`)) : ['- (none recorded)']), '',
    ...(rows.some(r => r.conventions.length || r.open.length) ? ['## Conventions and Open Questions', ...rows.flatMap(r => [...r.conventions.map(c => `- ${r.p.id} convention: ${c}`), ...r.open.map(q => `- ${r.p.id} open: ${q}`)]), ''] : []),
    '## Files Modified', '| File | Change |', '|------|--------|', ...files.map(([f, c]) => `| \`${f}\` | ${c} |`), '',
    '## Verification', ...rows.map(r => `- ${r.p.id}${r.p.fm.requirements.length ? ` (${r.p.fm.requirements.join(', ')})` : ''}: ${r.verify || 'no result recorded'}`), '',
    '## Agents', ...rows.map(r => `- ${r.p.id}: ${r.agent}`),
  ]
  // Step 4: every requirement and file must survive.
  const draft = body.join('\n')
  const missing = [...reqs.filter(q => !draft.includes(q)), ...done.flatMap(p => p.fm.files_modified).filter(f => !draft.includes(f))]
  if (missing.length) body.push('', '## Also Covered', ...missing.map(m => `- ${m}`))
  const covered = done.map(p => p.id)
  const text = [
    '---', `phase: ${o.dir}`, `compacted: ${o.date}`, `original_summaries: [${covered.map(id => `${id}-SUMMARY.md`).join(', ')}]`, `requirements_satisfied: [${reqs.join(', ')}]`, '---', '', body.join('\n'), '',
  ].join('\n')
  const original = covered.reduce((t, id) => t + o.summaries[id]!.length, 0)
  return { text, covered, missing, ratio: original ? text.length / original : 0 }
}

// Compact when the phase is complete, or before a later wave once the handoff text is long.
export function shouldCompact(plans: Plan[], summaries: Record<string, string>, phaseComplete: boolean): boolean {
  if (phaseComplete) return true
  const done = plans.filter(p => summaries[p.id] !== undefined && succeeded(summaryStatus(summaries[p.id]!)))
  return done.length >= 2 && done.reduce((t, p) => t + handoffOf(summaries[p.id]!).length, 0) > HANDOFF_BUDGET
}

// Plan ids a COMPACTED.md covers (its original_summaries).
export const compactedCovers = (text: string) => [...(text.match(/^original_summaries:\s*\[(.*)\]/m)?.[1] ?? '').matchAll(/(\d+-\d+)-SUMMARY\.md/g)].map(m => m[1]!)
export const compactedBody = (text: string) => text.replace(/^---\n[\s\S]*?\n---\n/, '').trim()

// ---- SUMMARY validation ----------------------------------------------------

const OUTCOME: Record<string, string> = { Complete: 'success', 'Complete with Warnings': 'success', Partial: 'partial', Failed: 'failed', BLOCKED: 'failed' }

// The SUMMARY.md read into summary.schema.json's shape.
export function summaryObject(text: string): Record<string, unknown> {
  const o: Record<string, unknown> = {}
  const id = text.match(/^#\s+Plan\s+(\S+)\s+Summary/m)?.[1]
  if (id) o.plan_id = id
  const agent = getField(text, 'Agent')
  if (agent) o.agent = agent.replace(/[`*]/g, '')
  const st = summaryStatus(text)
  if (st) o.outcome = OUTCOME[st]
  const tasks = getSection(text, /^##\s+Completed Tasks/i)
  if (tasks !== undefined) {
    o.completed_tasks = tasks.split('\n').filter(l => /^\s*-\s/.test(l)).map((l, i) => {
      const m = l.match(/^\s*-\s*(?:\[[ x]\]\s*)?(?:Task\s+(\d+):\s*)?(.*?)(?:\s*\((done|partial|failed|skipped)\)|\s+--\s+(done|partial|failed|skipped))?\s*$/i)!
      return { task_number: Number(m[1] ?? i + 1), description: m[2]!.trim(), status: (m[3] ?? m[4] ?? 'unknown').toLowerCase() }
    })
  }
  const files = getSection(text, /^##\s+Files Modified/i)
  if (files !== undefined) o.files_modified = bulletsOf(files).map(f => f.replace(/`/g, '').split(/\s+--\s+/)[0]!.trim())
  const dec = getSection(text, /^##\s+(Key Decisions|Decisions Made)/i)
  if (dec !== undefined) o.decisions_made = bulletsOf(dec)
  if (getSection(text, /^##\s+Handoff Context/i) !== undefined) {
    o.handoff_context = { key_outputs: listOf(handoffLine(text, 'Key outputs')), conventions_established: listOf(handoffLine(text, 'Conventions established')), open_questions: listOf(handoffLine(text, 'Open questions')) }
  }
  const rows = escalationRows(text)
  if (rows.length) o.escalations = rows.map(r => ({ severity: r.severity, type: r.type, decision: r.decision, status: r.status }))
  const vt = getSection(text, /^##\s+Verification Commands/i)
  if (vt !== undefined) {
    o.verification_results = vt.split('\n').filter(l => /^\|\s*`/.test(l)).map(l => {
      const c = l.split(/(?<!\\)\|/).map(x => x.trim())
      return { command: c[1]!.replace(/^`|`$/g, '').replace(/\\\|/g, '|'), exit_code: Number(c[2]), passed: c[3] === 'PASS' }
    })
  }
  return o
}

// Schema errors, completion-gate rules (5, 6), the export standard's required
// sections, and its conditional sections when their condition holds (counts
// from the build: escalations raised, decisions made, open questions).
export type SummaryFacts = { verificationDeclared?: boolean; escalations?: number; decisions?: number; openQuestions?: number }

export function checkSummary(text: string, f: SummaryFacts = {}): string[] {
  const o = summaryObject(text)
  const out = validate(SCHEMAS.summary, o).map(e => `schema: ${e}`)
  const tasks = (o.completed_tasks ?? []) as { status: string }[]
  if (o.outcome === 'success' && tasks.some(t => t.status === 'failed')) out.push('gate: outcome success with a failed task')
  if (f.verificationDeclared && !((o.verification_results ?? []) as unknown[]).length) out.push('gate: the plan declares verification commands but no results are recorded')
  const has = (h: string) => new RegExp(`^${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi').test(text)
  for (const h of SUMMARY_EXPORT_STANDARD.required_sections as string[]) if (!has(h)) out.push(`missing required section "${h}"`)
  const cond = SUMMARY_EXPORT_STANDARD.conditional_sections as string[]
  const hc = o.handoff_context as { open_questions: string[] } | undefined
  for (const h of cond) {
    if (/Escalations/i.test(h) && f.escalations && escalationRows(text).length < f.escalations) out.push(`${f.escalations} escalation(s) raised but the "${h}" table has ${escalationRows(text).length}`)
    if (/Decisions/i.test(h) && f.decisions && !((o.decisions_made as string[] | undefined)?.length)) out.push(`decisions made but no "${h}" section lists them`)
    if (/Open Questions/i.test(h) && f.openQuestions && !has(h) && !hc?.open_questions.length) out.push(`open questions remain but no "${h}" section or handoff entry`)
  }
  return out
}
