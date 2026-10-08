// Escalations (escalation-protocol.yaml): <escalation> blocks parsed and
// validated against escalation_format, control_mode_behaviors applied, and the
// resolution lifecycle kept in each plan's SUMMARY.md Escalations table. The
// project's yaml wins over the bundled Legion defaults key by key.
import { ESCALATION_PROTOCOL } from './execdata.ts'
import { parseYaml } from './yaml.ts'
import { loadPhase, loadProject, type Io } from './io.ts'
import { getSection } from './planning.ts'

export const PROTOCOL_FILE = '.planning/config/escalation-protocol.yaml'

export type Protocol = {
  required: string[]
  optional: string[]
  severities: string[]
  types: Record<string, { default_severity?: string }>
  modes: Record<string, { override?: string; floor?: string; fileScope: boolean }>
  statuses: string[]
}

export type Escalation = {
  severity: string
  type: string
  decision: string
  status: string
  context?: string
  alternatives?: string
  affected_files?: string[]
  resolution?: string
  declared?: string // severity before the control mode changed it
  problems?: string[] // escalation_format violations
}

function normalize(raw: any): Protocol {
  const f = raw?.escalation_format ?? {}
  const sev = raw?.severity_levels
  const modes: Protocol['modes'] = {}
  for (const [k, v] of Object.entries<any>(raw?.control_mode_behaviors ?? {})) {
    const text = (Array.isArray(v?.behavior) ? v.behavior : []).join(' ')
    modes[k] = { override: v?.override_severity ?? undefined, floor: text.match(/never downgraded below (\w+)/i)?.[1]?.toLowerCase(), fileScope: !!v?.auto_escalate_file_scope }
  }
  return {
    required: f.required_fields ?? [],
    optional: f.optional_fields ?? [],
    severities: Array.isArray(sev) ? sev : Object.keys(sev ?? {}),
    types: Object.fromEntries(Object.entries<any>(raw?.escalation_types ?? {}).map(([k, v]) => [k, { default_severity: v?.default_severity }])),
    modes,
    statuses: raw?.resolution?.statuses ?? [],
  }
}

export const DEFAULT_PROTOCOL = normalize(ESCALATION_PROTOCOL)

export async function loadProtocol(io: Io): Promise<{ protocol: Protocol; warnings: string[] }> {
  const text = await io.read(PROTOCOL_FILE)
  if (text === undefined) return { protocol: DEFAULT_PROTOCOL, warnings: [] }
  let raw: any
  try {
    raw = parseYaml(text)
  } catch (e) {
    return { protocol: DEFAULT_PROTOCOL, warnings: [`${PROTOCOL_FILE} is not valid YAML (${(e as Error).message}); using Legion's defaults`] }
  }
  const merged = { ...ESCALATION_PROTOCOL, ...Object.fromEntries(Object.entries(raw ?? {}).filter(([k]) => k in ESCALATION_PROTOCOL)) }
  if (raw?.escalation_format) merged.escalation_format = { ...ESCALATION_PROTOCOL.escalation_format, ...raw.escalation_format }
  if (raw?.resolution) merged.resolution = { ...ESCALATION_PROTOCOL.resolution, ...raw.resolution }
  return { protocol: normalize(merged), warnings: [] }
}

function fieldsOf(block: string): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  let last: string | undefined
  for (const line of block.split('\n')) {
    const kv = line.match(/^\s*([a-z_]+):\s*(.*)$/i)
    if (kv) {
      last = kv[1]!.toLowerCase()
      out[last] = kv[2]!.trim()
    } else if (last && /^\s*-\s+/.test(line)) {
      const cur = out[last]
      out[last] = [...(Array.isArray(cur) ? cur : cur ? [cur] : []), line.replace(/^\s*-\s+/, '').trim()]
    } else if (last && line.trim() && typeof out[last] === 'string') out[last] = `${out[last]} ${line.trim()}`.trim()
  }
  return out
}

// Problems with one block against escalation_format (required fields, the severity and type enums).
export function checkEscalation(f: Record<string, unknown>, p: Protocol): string[] {
  const out: string[] = []
  for (const k of p.required) if (f[k] === undefined || f[k] === '' || (Array.isArray(f[k]) && !(f[k] as unknown[]).length)) out.push(`missing ${k}`)
  if (f.severity && !p.severities.includes(String(f.severity))) out.push(`severity "${f.severity}" is not one of ${p.severities.join(', ')}`)
  if (f.type && !(String(f.type) in p.types)) out.push(`type "${f.type}" is not one of ${Object.keys(p.types).join(', ')}`)
  return out
}

// Every <escalation> block in an agent's answer; invalid ones keep what they said and carry their problems.
export function parseEscalations(text: string, p: Protocol = DEFAULT_PROTOCOL): Escalation[] {
  const out: Escalation[] = []
  for (const m of text.matchAll(/<escalation>([\s\S]*?)<\/escalation>/g)) {
    const f = fieldsOf(m[1]!)
    const s = (k: string) => (Array.isArray(f[k]) ? (f[k] as string[]).join('; ') : (f[k] as string | undefined)) || undefined
    const severity = s('severity')?.toLowerCase()
    const problems = checkEscalation({ ...f, severity }, p)
    const files = f.affected_files
    out.push({
      severity: severity ?? '', type: s('type') ?? '', decision: s('decision') ?? '', status: 'pending', context: s('context'), alternatives: s('alternatives'),
      affected_files: Array.isArray(files) ? files : files ? [files] : undefined, ...(problems.length ? { problems } : {}),
    })
  }
  return out
}

const rank = (p: Protocol, s: string) => p.severities.indexOf(s)

// control_mode_behaviors: an override severity (autonomous, advisory: info) or a floor (surgical: warning).
export function applyMode(e: Escalation, mode: string, p: Protocol = DEFAULT_PROTOCOL): Escalation {
  const m = p.modes[mode]
  if (!m || e.problems?.length) return e
  let s = m.override && p.severities.includes(m.override) ? m.override : e.severity
  if (m.floor && rank(p, s) < rank(p, m.floor)) s = m.floor
  return s === e.severity ? e : { ...e, severity: s, declared: e.declared ?? e.severity }
}

// ---- the Escalations table in SUMMARY.md -----------------------------------

const cell = (s: string | undefined) => (s ?? '').replace(/\|/g, '/').replace(/\n+/g, ' ').trim()

export function renderEscalations(es: Escalation[]): string {
  if (!es.length) return '(none)'
  const rows = es.map((e, i) => `| ${i + 1} | ${cell(e.severity || '(missing)')}${e.declared ? ` (declared ${e.declared})` : ''} | ${cell(e.type || '(missing)')} | ${cell(e.decision || '(missing)')} | ${e.status} | ${e.problems?.length ? `INVALID: ${cell(e.problems.join('; '))}` : cell(e.resolution)} |`)
  const details = es.flatMap((e, i) => [e.context && `- #${i + 1} context: ${cell(e.context)}`, e.alternatives && `- #${i + 1} alternatives: ${cell(e.alternatives)}`, e.affected_files?.length && `- #${i + 1} affected files: ${e.affected_files.join(', ')}`].filter(Boolean) as string[])
  return ['| # | Severity | Type | Decision | Status | Resolution |', '|---|----------|------|----------|--------|------------|', ...rows, ...(details.length ? ['', ...details] : [])].join('\n')
}

export type EscalationRow = { n: number; severity: string; type: string; decision: string; status: string; resolution: string; line: string }

export function escalationRows(summary: string): EscalationRow[] {
  const sec = getSection(summary, /^##\s+Escalations/i) ?? ''
  const out: EscalationRow[] = []
  for (const line of sec.split('\n')) {
    const c = line.match(/^\|\s*(\d+)\s*\|(.*)\|\s*$/)
    if (!c) continue
    const cells = c[2]!.split('|').map(x => x.trim())
    out.push({ n: Number(c[1]), severity: (cells[0] ?? '').split(' ')[0]!, type: cells[1] ?? '', decision: cells[2] ?? '', status: cells[3] ?? '', resolution: cells[4] ?? '', line })
  }
  return out
}

const OPEN = ['pending', 'deferred']

// The `escalation` tool: list open escalations across a phase, or resolve one in its SUMMARY.md.
export async function escalationTool(io: Io, input: { action?: string; phase?: number; plan?: string; number?: number; status?: string; resolution?: string; all?: boolean }): Promise<string> {
  const p = await loadProject(io)
  const n = input.phase ?? p.state?.phase
  if (!n) return 'escalation: STATE.md names no phase; pass phase.'
  const ph = await loadPhase(io, p, n)
  if (!ph.rel) return `escalation: no directory for Phase ${n}.`
  const { protocol } = await loadProtocol(io)
  if (input.action === 'resolve') {
    const id = String(input.plan ?? '')
    const text = ph.summaries[id]
    if (text === undefined) return `escalation: no SUMMARY.md for plan ${id} in Phase ${n}.`
    const status = String(input.status ?? '').toLowerCase()
    if (!protocol.statuses.includes(status)) return `escalation: status must be one of ${protocol.statuses.join(', ')}.`
    const row = escalationRows(text).find(r => r.n === Number(input.number))
    if (!row) return `escalation: plan ${id} has no escalation #${input.number}.`
    const resolution = cell(input.resolution) || (status === 'pending' ? '' : `${status} by the user`)
    const cells = row.line.split('|')
    cells[5] = ` ${status} `
    cells[6] = ` ${resolution} `
    await io.write(`${ph.rel}/${id}-SUMMARY.md`, text.replace(row.line, cells.join('|')))
    const next = status === 'approved' ? ' The approved action is not retried automatically: run build_phase with rerun to execute it.' : status === 'rejected' ? ' The plan must find an alternative inside its scope; rerun it when the plan is revised.' : status === 'deferred' ? ' The plan stays incomplete until the decision is taken.' : ''
    return `Escalation #${row.n} of plan ${id} (${row.severity} ${row.type}: ${row.decision}) is now ${status}${resolution ? ` — ${resolution}` : ''}.${next}`
  }
  const rows = Object.entries(ph.summaries).sort().flatMap(([id, t]) => escalationRows(t).filter(r => input.all || OPEN.includes(r.status)).map(r => ({ id, ...r })))
  if (!rows.length) return `No ${input.all ? '' : 'open '}escalations in Phase ${n}.`
  return [`Escalations in Phase ${n}${input.all ? '' : ' (pending or deferred)'}:`, '| Plan | # | Severity | Type | Decision | Status | Resolution |', '|------|---|----------|------|----------|--------|------------|',
    ...rows.map(r => `| ${r.id} | ${r.n} | ${r.severity} | ${r.type} | ${r.decision} | ${r.status} | ${r.resolution} |`),
    '', `Resolve one with action resolve (plan, number, status ${protocol.statuses.filter(s => s !== 'pending').join('|')}, resolution). Record deferred only when the user chose it.`].join('\n')
}
