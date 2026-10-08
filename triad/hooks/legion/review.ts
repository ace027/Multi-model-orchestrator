// Review triage in code (review-loop Sections 4-6, review-panel Section 3):
// parse reviewer findings, dedup by file and overlapping lines, confidence
// filter, hot spots, verdicts, stale-loop detection, REVIEW.md.
// Severities are the review-finding schema's enum (PARITY section 14).
import { SCHEMAS } from './data.ts'
import { validate } from './schema.ts'

export const SEVERITIES = ['blocker', 'critical', 'major', 'minor', 'advisory'] as const
export type Severity = (typeof SEVERITIES)[number]
export const MUST_FIX = new Set<Severity>(['blocker', 'critical', 'major'])

export type Finding = {
  id: string // F-001
  severity: Severity
  category: string
  description: string
  why?: string
  file: string
  line_range?: [number, number]
  suggested_fix?: string
  confidence: number // percent
  agent: string
  cycle: number
  status: 'open' | 'fixed' | 'accepted' | 'deferred'
  reviewers: string[] // who reported it (after dedup)
  criterion?: string
}

export type ReviewerReport = { agent: string; verdict: 'PASS' | 'NEEDS WORK' | 'FAIL' | undefined; findings: Finding[] }

const LEGACY: Record<string, Severity> = { warning: 'major', suggestion: 'minor', info: 'advisory', high: 'critical', medium: 'major', low: 'minor' }

function severityOf(s: string): Severity | undefined {
  const t = s.toLowerCase().replace(/[^a-z]/g, '')
  return (SEVERITIES as readonly string[]).includes(t) ? (t as Severity) : LEGACY[t]
}

// The reviewer prompt's format:
//   ### Finding N
//   - **File**: path
//   - **Lines**: 10-14
//   - **Severity**: blocker|critical|major|minor|advisory
//   - **Category**: ...
//   - **Issue**: what is wrong
//   - **Why**: why it matters
//   - **Fix**: how to fix it
//   - **Confidence**: 90%
//   - **Criterion**: 1 — name
// ending with `**Verdict**: PASS | NEEDS WORK | FAIL`.
export function parseReport(agent: string, text: string, cycle: number): ReviewerReport {
  const findings: Finding[] = []
  const blocks = text.split(/^#{2,4}\s*Finding\b.*$/im).slice(1)
  for (const b of blocks) {
    // A field runs on over indented or bulleted lines until the next "- **Field**:" line.
    const f = (k: string) => {
      const lines = b.split('\n')
      const i = lines.findIndex(l => new RegExp(`^\\s*[-*]?\\s*\\*{0,2}(?:${k})\\*{0,2}\\s*:`, 'i').test(l))
      if (i < 0) return undefined
      const out = [lines[i]!.replace(new RegExp(`^\\s*[-*]?\\s*\\*{0,2}(?:${k})\\*{0,2}\\s*:\\s*\\*{0,2}\\s*`, 'i'), '')]
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]!
        if (!l.trim() || /^\s*[-*]?\s*\*\*[^*]+\*\*\s*:/.test(l) || /^\s*[-*]?\s*[A-Z][\w /-]*:\s/.test(l) || /^#/.test(l)) break
        out.push(l.trim())
      }
      return out.join(' ').trim() || undefined
    }
    const sev = severityOf(f('Severity') ?? '')
    const file = (f('File') ?? '').replace(/[`*]/g, '').replace(/:(\d+)(-\d+)?$/, '').trim()
    const linesStr = f('Lines?|Line/Section|Line range') ?? (f('File') ?? '').match(/:(\d+(?:-\d+)?)/)?.[1] ?? ''
    const lm = linesStr.match(/(\d+)(?:\s*[-–]\s*(\d+))?/)
    const conf = f('Confidence') ?? ''
    const pct = Number(conf.match(/(\d+)\s*%/)?.[1] ?? (/high/i.test(conf) ? 85 : /medium/i.test(conf) ? 65 : /low/i.test(conf) ? 30 : 0))
    if (!sev || !file) continue
    findings.push({
      id: '', severity: sev, category: f('Category') ?? 'general', description: f('Issue|What') ?? '', why: f('Why|Details'),
      file, line_range: lm ? [Number(lm[1]), Number(lm[2] ?? lm[1])] : undefined, suggested_fix: f('Fix|Suggested Fix'),
      confidence: pct, agent, cycle, status: 'open', reviewers: [agent], criterion: f('Criterion'),
    })
  }
  const v = text.match(/\*{0,2}Verdict\*{0,2}\s*:?\s*\*{0,2}\s*(PASS|NEEDS WORK|FAIL)/i)?.[1]?.toUpperCase() as ReviewerReport['verdict']
  return { agent, verdict: v, findings }
}

const rangesTouch = (a?: [number, number], b?: [number, number]) => !a || !b || (a[0] <= b[1] + 2 && b[0] <= a[1] + 2)
const rank = (s: Severity) => SEVERITIES.indexOf(s)

// Same file and overlapping (or unstated) lines: one finding, highest severity,
// then highest confidence, with every reviewer named.
export function dedup(all: Finding[]): Finding[] {
  const out: Finding[] = []
  for (const f of all) {
    const same = out.find(o => o.file === f.file && rangesTouch(o.line_range, f.line_range) && (o.line_range || f.line_range || o.category === f.category))
    if (!same) { out.push({ ...f, reviewers: [...f.reviewers] }); continue }
    const keep = rank(f.severity) < rank(same.severity) || (f.severity === same.severity && f.confidence > same.confidence) ? f : same
    const reviewers = [...new Set([...same.reviewers, ...f.reviewers])]
    Object.assign(same, { ...keep, reviewers, severity: rank(f.severity) < rank(same.severity) ? f.severity : same.severity })
  }
  return out
}

export type Triage = { actioned: Finding[]; deferred: Finding[]; dropped: number; mustFix: Finding[]; niceToHave: Finding[]; hotSpots: string[] }

// Confidence: 80% and up is actioned, 50-79% deferred, under 50% dropped.
export function triage(reports: ReviewerReport[], startId = 1): Triage {
  const merged = dedup(reports.flatMap(r => r.findings))
  let n = startId
  for (const f of merged) f.id = `F-${String(n++).padStart(3, '0')}`
  const actioned = merged.filter(f => f.confidence >= 80)
  const deferred = merged.filter(f => f.confidence >= 50 && f.confidence < 80).map(f => ({ ...f, status: 'deferred' as const }))
  const byFile: Record<string, Set<string>> = {}
  for (const f of reports.flatMap(r => r.findings)) (byFile[f.file] ??= new Set()).add(f.agent)
  return {
    actioned, deferred, dropped: merged.length - actioned.length - deferred.length,
    mustFix: actioned.filter(f => MUST_FIX.has(f.severity)),
    niceToHave: actioned.filter(f => !MUST_FIX.has(f.severity)),
    hotSpots: Object.entries(byFile).filter(([, a]) => a.size >= 2).map(([f]) => f),
  }
}

// A reviewer that gave neither a verdict nor a finding did not review: never a pass.
export const reviewed = (r: ReviewerReport) => r.verdict !== undefined || r.findings.length > 0

export function passed(reports: ReviewerReport[], t: Triage): boolean {
  return t.mustFix.length === 0 && reports.length > 0 && reports.every(r => r.verdict === 'PASS' || (r.verdict === undefined && reviewed(r) && !r.findings.some(f => MUST_FIX.has(f.severity) && f.confidence >= 80)))
}

// The finding as the schema's record (for validation and the JSON sidecar).
export function asRecord(f: Finding): Record<string, unknown> {
  const r: Record<string, unknown> = { id: f.id, severity: f.severity, category: f.category, description: f.description, file: f.file, status: f.status, agent: f.agent, cycle: f.cycle }
  if (f.line_range) r.line_range = `${f.line_range[0]}-${f.line_range[1]}`
  if (f.suggested_fix) r.suggested_fix = f.suggested_fix
  return r
}

export const findingErrors = (f: Finding) => validate(SCHEMAS.finding, asRecord(f))

// Intent review (intent-review): a filter_review intent keeps only the findings
// in its domains, before dedup. The rule ids are Legion's review rules.
export const INTENT_REVIEW_RULES: Record<string, string[]> = {
  'security-only': ['owasp-top-10', 'stride-model', 'vulnerability-assessment', 'penetration-testing', 'security-audit', 'threat-modeling', 'security', 'owasp', 'stride', 'authentication', 'authorization', 'auth', 'vulnerability', 'threat', 'injection', 'xss', 'csrf', 'secret'],
  document: ['documentation', 'code-maintainability', 'docs'],
  harden: ['owasp-top-10', 'test-strategy', 'test-automation', 'test-coverage', 'security', 'tests'],
}

export function intentFilter(findings: Finding[], intent: string, domains: string[] = []): Finding[] {
  const keys = [...new Set([...(INTENT_REVIEW_RULES[intent] ?? []), ...domains])].map(k => k.toLowerCase().replace(/[-_]/g, ' '))
  if (!keys.length) return findings
  return findings.filter(f => {
    const t = `${f.category} ${f.criterion ?? ''}`.toLowerCase().replace(/[-_:]/g, ' ')
    return keys.some(k => new RegExp(`\\b${k.replace(/ /g, '\\s+')}`).test(t))
  })
}

// Two re-reviews in a row with the same open findings: the loop is stale.
export const signature = (fs: Finding[]) => fs.map(f => `${f.file}|${f.severity}|${f.line_range?.join('-') ?? ''}`).sort().join('\n')

const row = (f: Finding) =>
  `| ${f.id} | ${f.severity} | \`${f.file}${f.line_range ? `:${f.line_range[0]}${f.line_range[1] !== f.line_range[0] ? '-' + f.line_range[1] : ''}` : ''}\` | ${f.description.replace(/\|/g, '/')} | ${f.reviewers.join(', ')} | ${f.confidence}% | ${f.status} |`

export type ReviewDoc = {
  phase: number; name: string; result: 'PASSED' | 'ESCALATED' | 'STALE LOOP ABORTED'; cycles: number; reviewers: string[]; date: string
  findings: Finding[]; deferred: Finding[]; suggestions: Finding[]; verdicts: { agent: string; verdict: string; cycle: number }[]; hotSpots: string[]
  cycleDelta: string[]; fixes: string[]
  coverage?: string[]; invalid?: { id: string; errors: string[] }[]; evaluators?: string[]; intent?: string
}

export function renderReview(d: ReviewDoc): string {
  const head = ['| ID | Severity | Location | Issue | Reviewers | Confidence | Status |', '|----|----------|----------|-------|-----------|------------|--------|']
  const unresolved = d.findings.filter(f => f.status === 'open')
  const resolved = d.findings.filter(f => f.status !== 'open')
  const lines = [
    `# Phase ${d.phase}: ${d.name} — Review Summary`,
    '',
    `## Result: ${d.result}`,
    '',
    `**Cycles Used**: ${d.cycles}`,
    `**Reviewers**: ${d.reviewers.join(', ')}`,
    ...(d.evaluators?.length ? [`**Evaluators**: ${d.evaluators.join(', ')}`] : []),
    ...(d.intent ? [`**Intent**: ${d.intent}`] : []),
    `**Completed**: ${d.date}`,
    '',
    '## Findings Summary',
    `- Must-fix (blocker, critical, major) found: ${d.findings.filter(f => MUST_FIX.has(f.severity)).length}; fixed: ${resolved.filter(f => f.status === 'fixed').length}; unresolved: ${unresolved.length}`,
    `- Suggestions (minor, advisory): ${d.suggestions.length}`,
    `- Deferred (confidence 50-79%): ${d.deferred.length}`,
    `- Hot spots (flagged by 2+ reviewers): ${d.hotSpots.map(f => `\`${f}\``).join(', ') || 'none'}`,
    '',
    '## Findings Detail',
    ...(d.findings.length ? [...head, ...d.findings.map(row)] : ['(none)']),
  ]
  if (d.result !== 'PASSED') {
    lines.push('', '## Unresolved Findings', ...(unresolved.length ? [...head, ...unresolved.map(row)] : ['(none)']))
    lines.push('', '## Resolved Findings', ...(resolved.length ? [...head, ...resolved.map(row)] : ['(none)']))
    lines.push('', '## Recommendation', d.result === 'STALE LOOP ABORTED'
      ? 'Two re-reviews in a row found the same issues. Fix them by hand, or re-plan the affected work.'
      : 'Fix the unresolved findings by hand, accept the phase as is, or investigate further.')
    for (const f of unresolved.filter(f => f.severity === 'blocker' || f.severity === 'critical')) {
      lines.push('', '<escalation>', 'severity: blocker', 'type: quality', `decision: unresolved ${f.severity} ${f.id} in ${f.file}`, `context: ${f.description}`, '</escalation>')
    }
  }
  lines.push('', '## Reviewer Verdicts', ...d.verdicts.map(v => `- Cycle ${v.cycle}, ${v.agent}: **${v.verdict}**`))
  lines.push('', '## Suggestions (Not Required)', ...(d.suggestions.length ? d.suggestions.map(f => `- ${f.id} \`${f.file}\`: ${f.description}${f.suggested_fix ? ` (fix: ${f.suggested_fix})` : ''}`) : ['(none)']))
  if (d.deferred.length) lines.push('', '## Deferred (Medium Confidence)', ...d.deferred.map(f => `- \`${f.file}\` [${f.severity}, ${f.confidence}%]: ${f.description}`))
  if (d.fixes.length) lines.push('', '## Fixes Applied', ...d.fixes.map(s => `- ${s}`))
  if (d.cycles >= 2 && d.cycleDelta.length) lines.push('', '## Cycle Delta', ...d.cycleDelta.map(s => `- ${s}`))
  if (d.coverage) lines.push('', '## Coverage', ...d.coverage)
  if (d.invalid?.length) lines.push('', '## Invalid Findings', 'These findings do not validate against review-finding.schema.json; they are kept above, fix or re-raise them:', ...d.invalid.map(i => `- ${i.id}: ${i.errors.join('; ')}`))
  return lines.join('\n') + '\n'
}

export const REVIEWER_RULES = `Review rules:
- Review only the files listed, against the rubric. Read them; do not modify anything.
- Every finding needs the file and line, what is wrong, why it matters, and how to fix it. Findings without all four are dropped.
- Severity: blocker (crash, data loss, security hole, broken build), critical (wrong result on a main path), major (logic error, missing edge case, missing test of a stated criterion), minor (small defect, unclear code), advisory (style or a suggestion). Do not inflate nitpicks.
- Confidence: report only findings you are at least 50% sure of, and say the percentage. Only 80% and above are acted on.
- No praise, no performative agreement. If the work is right, say PASS with no findings.

Answer in exactly this format, nothing else:

### Finding 1
- **File**: path/to/file
- **Lines**: 10-14
- **Severity**: blocker | critical | major | minor | advisory
- **Category**: correctness | security | tests | performance | maintainability | docs
- **Issue**: what is wrong
- **Why**: why it matters
- **Fix**: how to fix it
- **Confidence**: 90%
- **Criterion**: 1 — criterion name

(more findings, numbered)

**Verdict**: PASS | NEEDS WORK | FAIL`
