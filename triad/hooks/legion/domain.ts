// Domain workflows (design-workflows, marketing-workflows, workflow-common-domains):
// detection, teams, wave patterns, document scaffolds, lifecycle status, the
// completion check and the audit grades, in code. The questioning, design
// consultation and the review lenses are persona work driven by the commands.
//
// Legion inconsistencies resolved here: detection never uses keywords (a hint
// only); documents are flat files ({slug}-system.md, {slug}-research.md,
// campaigns/{slug}.md) as in the constants, not the gates' per-phase folders;
// the campaign status set is Planning/Active/Measuring/Complete (the gate's
// "Draft" is Planning); a design pass scoring exactly 7 passes; the AI-slop
// grade is F at 5+ patterns as stated. The skill's per-platform marketing ids
// were merged in Legion's own roster into marketing-social-platform-specialist.
import { loadPhase, loadProject, today, type Io } from './io.ts'
import { getSection } from './planning.ts'
import { BY_ID } from './registry.ts'

export type Domain = 'design' | 'marketing'
export const DESIGN_DIR = '.planning/designs'
export const CAMPAIGN_DIR = '.planning/campaigns'
export const domainSlug = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '')

// Legacy marketing ids from the skill text, mapped to the roster.
export const LEGACY_IDS: Record<string, string> = {
  'marketing-twitter-engager': 'marketing-social-platform-specialist',
  'marketing-instagram-curator': 'marketing-social-platform-specialist',
  'marketing-tiktok-strategist': 'marketing-social-platform-specialist',
  'marketing-reddit-community-builder': 'marketing-social-platform-specialist',
  'marketing-social-media-strategist': 'marketing-content-social-strategist',
}
const id = (x: string) => LEGACY_IDS[x] ?? x

// --- detection ---

export type Detection = { domain?: Domain; reason: string; supporting?: Domain; hint?: string }

export async function detectDomain(io: Io, n?: number, flag?: string): Promise<Detection> {
  const f = flag?.replace(/^--domain=/, '').trim().toLowerCase()
  if (f === 'design' || f === 'marketing') return { domain: f, reason: `--domain=${f}` }
  const p = await loadProject(io)
  const num = n ?? p.state?.phase
  const info = p.roadmap?.phases.find(x => x.phase === num)
  if (!info || !num) return { reason: 'phase not in ROADMAP.md' }
  const ph = await loadPhase(io, p, num)
  const ctx = ph.rel ? (await io.read(`${ph.rel}/CONTEXT.md`)) ?? '' : ''
  const wt = ctx.match(/^workflow_type:\s*(design|marketing)\s*$/m)?.[1] as Domain | undefined
  if (wt) return { domain: wt, reason: `CONTEXT.md workflow_type: ${wt}` }
  const block = (p.roadmapText ?? '').match(new RegExp(`### Phase ${num}:[\\s\\S]*?(?=\\n### Phase |$)`))?.[0] ?? ''
  const reqs = `${info.requirements} ${block}`
  const mkt = /\bMKT-\d+/.test(reqs), dsn = /\bDSN-\d+/.test(reqs)
  if (mkt && dsn) return { domain: 'marketing', supporting: 'design', reason: 'MKT- and DSN- requirements (marketing leads, design supports)' }
  if (mkt) return { domain: 'marketing', reason: 'MKT- requirement ids' }
  if (dsn) return { domain: 'design', reason: 'DSN- requirement ids' }
  const text = `${info.name} ${info.goal}`.toLowerCase()
  const hint = /\b(design system|ux|ui|brand|wireframe|visual|accessib|component library|design tokens)\b/.test(text) ? 'design'
    : /\b(campaign|marketing|social|content calendar|audience|launch announcement)\b/.test(text) ? 'marketing' : undefined
  return { reason: 'no MKT-/DSN- ids, workflow_type or --domain', hint: hint ? `The phase reads like ${hint} work: ask the user whether to use the ${hint} workflow (--domain=${hint}).` : undefined }
}

// --- teams and waves ---

export const DESIGN_DISCIPLINES: Record<string, [string, string]> = {
  'design-systems': ['design-ui-designer', 'design-brand-guardian'],
  'ux-architecture': ['design-ux-architect', 'design-ux-researcher'],
  'brand-identity': ['design-brand-guardian', 'design-ui-designer'],
  'user-research': ['design-ux-researcher', 'design-ux-architect'],
  'visual-storytelling': ['design-visual-storyteller', 'design-brand-guardian'],
  'delight-polish': ['design-whimsy-injector', 'design-ui-designer'],
}
export const CHANNELS: Record<string, [string, string]> = {
  twitter: ['marketing-twitter-engager', 'marketing-social-media-strategist'],
  instagram: ['marketing-instagram-curator', 'marketing-content-social-strategist'],
  tiktok: ['marketing-tiktok-strategist', 'marketing-instagram-curator'],
  reddit: ['marketing-reddit-community-builder', 'marketing-content-social-strategist'],
  blog: ['marketing-content-social-strategist', 'marketing-social-media-strategist'],
  email: ['marketing-content-social-strategist', 'marketing-growth-hacker'],
  'app-store': ['marketing-app-store-optimizer', 'marketing-growth-hacker'],
  growth: ['marketing-growth-hacker', 'marketing-social-media-strategist'],
}
export const DEFAULT_CHANNELS = ['twitter', 'instagram', 'tiktok', 'reddit', 'blog', 'email']

export type TeamMember = { agent: string; role: string }
export type DesignAnswers = { focus?: string; disciplines?: string[]; brand?: string; platforms?: string[]; backend?: boolean; visual?: boolean; polish?: boolean; feedback?: boolean }
export type MarketingAnswers = { objective?: string; channels?: string[]; visual?: boolean; tracking?: boolean }

const push = (t: TeamMember[], agent: string, role: string) => { const a = id(agent); if (!t.some(m => m.agent === a)) t.push({ agent: a, role }) }

export function designTeam(a: DesignAnswers): TeamMember[] {
  const t: TeamMember[] = []
  push(t, 'design-ui-designer', 'Design Lead')
  push(t, 'design-ux-researcher', 'Research Lead')
  for (const d of a.disciplines ?? []) if (DESIGN_DISCIPLINES[d]) push(t, DESIGN_DISCIPLINES[d]![0], d)
  if (/^yes/i.test(a.brand ?? '')) push(t, 'design-brand-guardian', 'Brand Guardian (established brand)')
  if (a.backend) push(t, 'design-ux-architect', 'UX Architect (CSS and layout foundation)')
  if (a.visual) push(t, 'design-visual-storyteller', 'Visual Storyteller')
  if (a.polish) push(t, 'design-whimsy-injector', 'Micro-interactions')
  if ((a.platforms ?? []).some(p => /web|mobile/i.test(p))) push(t, 'engineering-frontend-developer', 'Frontend implementation')
  if (a.feedback) push(t, 'product-feedback-synthesizer', 'Feedback integration')
  return t
}

export function marketingTeam(a: MarketingAnswers): TeamMember[] {
  const t: TeamMember[] = []
  push(t, 'marketing-social-media-strategist', 'Strategy Lead')
  push(t, 'marketing-content-social-strategist', 'Content Lead')
  for (const c of a.channels ?? []) {
    const m = CHANNELS[c.toLowerCase()]
    if (m) push(t, m[0], `${c} channel`)
    else push(t, 'marketing-content-social-strategist', `${c} channel (no specialist; Content Lead owns it)`)
  }
  if (/acquisition|conversion|growth/i.test(a.objective ?? '')) push(t, 'marketing-growth-hacker', 'Growth')
  if (a.visual || (a.channels ?? []).some(c => /instagram|tiktok/i.test(c))) push(t, 'design-visual-storyteller', 'Visual assets (supports, never owns slots)')
  if (a.tracking) push(t, 'data-analytics-engineer', 'Tracking and measurement')
  return t
}

export function wavePattern(domain: Domain, opts: { backend?: boolean; frontend?: boolean; execution?: boolean; polish?: boolean } = {}): string[] {
  if (domain === 'marketing') return [
    'Wave 1 — Strategy & Planning: marketing-content-social-strategist (+ marketing-growth-hacker for acquisition/conversion). Its SUMMARY.md must contain the core messaging brief (core message, 3 supporting points, 2-3 hashtags, primary CTA), the channel adaptation guidelines, the timing plan and the calendar.',
    'Wave 2 — Content Creation: marketing-content-social-strategist (long-form) + channel specialists in parallel; every Wave 2 agent gets the same brief, its own adaptation row and only its own calendar slots.',
    ...(opts.execution ? ['Wave 3 — Execution: channel agents publish and engage, with all prior summaries.'] : []),
  ]
  const back = opts.backend ?? false, front = opts.frontend ?? true
  return [
    'Wave 1 — Research & Foundation: design-ux-researcher + design-brand-guardian (gets the design system doc).',
    ...(back ? ['Wave 2A — Backend Architecture Design: engineering-backend-architect + design-ux-architect (gets the Wave 1 summary, CODEBASE.md, existing API/schema files).'] : []),
    ...(front ? ['Wave 2B — Frontend Design System: design-ui-designer + design-visual-storyteller (gets the system doc, the Wave 1 summary, discipline assignments, platform requirements).'] : []),
    ...(back && front ? ['Wave 3 — Integration Design: engineering-senior-developer + design-ux-architect (gets the 2A and 2B summaries).'] : []),
    ...(opts.polish ? [`Wave ${back && front ? 4 : 3} — Polish & Validation: design-whimsy-injector + review agents (gets all prior summaries).`] : []),
  ]
}

// --- documents ---

const table = (head: string[], rows: string[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n')
const rowsOf = (v: unknown, cols: number): string[][] => Array.isArray(v) ? v.map(r => (Array.isArray(r) ? r : [r]).map(String).concat(Array(cols).fill('')).slice(0, cols)) : []

export type DocInput = { kind: 'system' | 'research' | 'campaign'; name: string; fields?: Record<string, any>; overwrite?: boolean }

export function docPath(kind: DocInput['kind'], name: string): string {
  const s = domainSlug(name)
  return kind === 'campaign' ? `${CAMPAIGN_DIR}/${s}.md` : `${DESIGN_DIR}/${s}-${kind}.md`
}

export async function writeDoc(io: Io, input: DocInput): Promise<string> {
  const path = docPath(input.kind, input.name)
  if (!domainSlug(input.name)) return 'A document needs a name.'
  if ((await io.read(path)) !== undefined && !input.overwrite) return `${path} exists. Ask the user whether to overwrite it (overwrite: true) or keep it.`
  const f = input.fields ?? {}
  const date = today(io)
  const s = (k: string, d = '{to be written}') => (f[k] === undefined || f[k] === '' ? d : Array.isArray(f[k]) ? f[k].map((x: any) => `- ${x}`).join('\n') : String(f[k]))
  let doc: string
  if (input.kind === 'system') doc = [
    `# Design System: ${input.name}`, '', `**Created:** ${date}`, `**Status:** Research`, `**Scope:** ${s('scope', 'Foundation')}`, `**Platforms:** ${s('platforms', 'Web (responsive)')}`, `**Accessibility:** ${s('accessibility', 'WCAG AA')}`, `**Owner:** design-ui-designer`, '',
    '## Design Principles', s('principles'), '', '## Token Taxonomy', '',
    '### Color Tokens', table(['Token', 'Value', 'Usage'], rowsOf(f.color, 3).length ? rowsOf(f.color, 3) : ['color-primary', 'color-secondary', 'color-surface', 'color-on-surface', 'color-error', 'color-success'].map(t => [t, '', ''])), '',
    '### Typography Tokens', table(['Token', 'Value', 'Usage'], rowsOf(f.typography, 3).length ? rowsOf(f.typography, 3) : ['font-family-primary', 'font-family-heading', 'font-size-xs', 'font-size-sm', 'font-size-md', 'font-size-lg', 'font-size-xl'].map(t => [t, '', ''])), '',
    '### Spacing Tokens', table(['Token', 'Value', 'Usage'], rowsOf(f.spacing, 3).length ? rowsOf(f.spacing, 3) : ['spacing-xs', 'spacing-sm', 'spacing-md', 'spacing-lg', 'spacing-xl'].map(t => [t, '', ''])), '',
    '### Additional Tokens', table(['Category', 'Tokens Defined'], ['Elevation', 'Border Radius', 'Animation', 'Breakpoints', 'Z-index'].map(c => [c, ''])), '',
    '## Component Architecture', '', '### Atoms', table(['Component', 'States', 'Variants', 'Accessibility'], rowsOf(f.atoms, 4)), '',
    '### Molecules', table(['Component', 'Composed Of', 'States', 'Accessibility'], rowsOf(f.molecules, 4)), '',
    '### Organisms (if scope includes)', table(['Component', 'Composed Of', 'Responsive Behavior'], rowsOf(f.organisms, 3)), '',
    '## Agent Assignments', table(['Agent', 'Role', 'Responsibilities', 'Deliverables'], rowsOf(f.assignments, 4)), '',
    '## Platform Guidelines', table(['Platform', 'Considerations'], rowsOf(f.platform_guidelines, 2)), '',
    '## Timeline', table(['Phase', 'Activities'], [['Research', ''], ['Design', ''], ['Review', ''], ['Handoff', '']]), '',
  ].join('\n')
  else if (input.kind === 'research') doc = [
    `# UX Research: ${input.name}`, '', `**Created:** ${date}`, `**Status:** Planning`, `**Methodology:** ${s('methodology', '{methods}')}`, `**Participants:** ${s('participants', '{profile}')}`, `**Owner:** design-ux-researcher`, '',
    '## Research Goals', s('goals'), '', '## Methodology', table(['Method', 'Purpose', 'Participants', 'Duration'], rowsOf(f.methods, 4)), '',
    '## Key Findings', '', '## User Personas', '', '## User Journey Map', table(['Stage', 'Actions', 'Thoughts', 'Emotions', 'Pain Points', 'Opportunities'], []), '',
    '## Recommendations', table(['Finding', 'Recommendation', 'Design Action', 'Priority'], []), '', '## Next Steps', '',
  ].join('\n')
  else doc = [
    `# Campaign: ${input.name}`, '', `**Created:** ${date}`, `**Status:** Planning`, `**Timeline:** ${s('timeline', '{start_date} to {end_date}')}`, `**Owner:** marketing-content-social-strategist`, '',
    '## Objectives', `**Primary:** ${s('objective')}`, `**Secondary:** ${s('secondary', 'None')}`, '', '### Success Metrics', table(['Metric', 'Target', 'Measurement'], rowsOf(f.metrics, 3).length ? rowsOf(f.metrics, 3) : [['Reach', '', ''], ['Engagement', '', ''], ['Conversions', '', '']]), '',
    '## Target Audience', `**Primary:** ${s('audience')}`, `**Secondary:** ${s('secondary_audience', 'None')}`, `**Channels where they live:** ${s('audience_channels', (f.channels ?? []).join(', ') || '{channels}')}`, '',
    '## Core Messaging', `**Key Message:** ${s('message')}`, '**Supporting Messages:**', '1. {rational}', '2. {emotional}', '3. {social proof}', `**Tone:** ${s('tone', '{tone}')}`, `**Hashtags:** ${s('hashtags', '{2-3}')}`, `**CTA:** ${s('cta', '{primary CTA}')}`, '',
    '## Channel Strategy', table(['Channel', 'Agent', 'Role', 'Content Types', 'Frequency'], (f.channels ?? []).map((c: string) => [c, id(CHANNELS[c.toLowerCase()]?.[0] ?? 'marketing-content-social-strategist'), '', '', ''])), '',
    '## Content Calendar', table(['Week', 'Phase', 'Key Theme', 'Content Items'], rowsOf(f.calendar, 4)), '',
    '## Agent Assignments', table(['Agent', 'Role', 'Responsibilities', 'Deliverables'], marketingTeam({ objective: f.objective, channels: f.channels }).map(m => [m.agent, m.role, '', ''])), '',
    '## Cross-Channel Consistency', '- Core message: shared verbatim with every channel agent', '- Visual assets: one set, adapted per platform', '- Hashtags: the campaign set on every channel', '- Timing: launches staggered 2-4 hours', '- Voice: per-channel tone from the adaptation guidelines', '',
    '## Timeline', table(['Phase', 'Dates', 'Activities'], [['Pre-launch', '', ''], ['Launch', '', ''], ['Sustain', '', ''], ['Measure', '', '']]), '',
  ].join('\n')
  await io.write(path, doc)
  return `Wrote ${path}.`
}

// --- lifecycle ---

const STATUSES: Record<DocInput['kind'], string[]> = {
  system: ['Research', 'Designing', 'Review', 'Complete'],
  research: ['Planning', 'In Progress', 'Complete'],
  campaign: ['Planning', 'Active', 'Measuring', 'Complete'],
}
const kindOf = (path: string): DocInput['kind'] | undefined => path.startsWith(`${CAMPAIGN_DIR}/`) ? 'campaign' : path.endsWith('-system.md') ? 'system' : path.endsWith('-research.md') ? 'research' : undefined

export async function setStatus(io: Io, path: string, status: string): Promise<string> {
  const kind = kindOf(path)
  const doc = await io.read(path)
  if (!kind || doc === undefined) return `${path} is not a domain document.`
  const order = STATUSES[kind]
  const want = order.find(x => x.toLowerCase() === status.toLowerCase().replace(/^draft$/, 'planning'))
  if (!want) return `Status must be one of ${order.join(', ')}.`
  const cur = doc.match(/^\*\*Status:\*\*\s*(.+)$/m)?.[1]?.trim() ?? order[0]!
  if (order.indexOf(want) < order.indexOf(cur)) return `${path} is ${cur}; status only moves forward (${order.join(' → ')}).`
  // Measuring → Complete needs the final report and the measuring window (campaignReport).
  if (kind === 'campaign' && want === 'Complete' && cur !== 'Complete') return `Use domain action \`report\` to close a campaign: it writes ${CAMPAIGN_DIR}/{phase-slug}/REPORT.md and completes the campaign once the measuring window has elapsed.`
  let next = doc.replace(/^\*\*Status:\*\*.*$/m, `**Status:** ${want}`)
  if (kind === 'campaign' && want === 'Measuring' && cur !== 'Measuring') next = next.replace(/^\*\*Measuring since:\*\*.*\n?/m, '').replace(/^(\*\*Status:\*\*.*)$/m, `$1\n**Measuring since:** ${today(io)}`)
  await io.write(path, next)
  return `${path}: ${cur} → ${want}`
}

// --- completion check ---

const sectionRows = (doc: string, h: RegExp) => (getSection(doc, h) ?? '').split('\n').filter(l => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|\s*$/.test(l)).slice(1).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()))

export async function domainCheck(io: Io, path: string): Promise<string> {
  const kind = kindOf(path)
  const doc = await io.read(path)
  if (!kind || doc === undefined) return `${path} is not a domain document.`
  const issues: string[] = []
  const has = (h: string) => getSection(doc, new RegExp(`^#{2,3}\\s+${h}`, 'im')) !== undefined
  const placeholder = (h: RegExp) => /\{[^}]+\}/.test(getSection(doc, h) ?? '')
  if (kind === 'campaign') {
    for (const h of ['Objectives', 'Core Messaging', 'Channel Strategy', 'Content Calendar', 'Success Metrics']) if (!has(h)) issues.push(`missing ${h}`)
    if (placeholder(/^##\s+Core Messaging/im)) issues.push('Core Messaging still has placeholders')
    const cal = sectionRows(doc, /^##\s+Content Calendar/im)
    if (!cal.length) issues.push('Content Calendar is empty')
    const slots = cal.filter(r => !r[3] || !/[a-z]+-[a-z-]+/.test(r[3]!))
    if (slots.length) issues.push(`calendar rows without an owner agent: ${slots.map(r => r[0]).join(', ')}`)
    const chan = sectionRows(doc, /^##\s+Channel Strategy/im)
    const unknown = chan.filter(r => r[1] && !BY_ID.has(id(r[1]!)))
    if (unknown.length) issues.push(`unknown channel agents: ${unknown.map(r => r[1]).join(', ')}`)
    const metrics = sectionRows(doc, /^###\s+Success Metrics/im).filter(r => !r[1])
    if (metrics.length) issues.push(`success metrics without a target: ${metrics.map(r => r[0]).join(', ')}`)
  } else if (kind === 'system') {
    for (const h of ['Design Principles', 'Token Taxonomy', 'Color Tokens', 'Typography Tokens', 'Spacing Tokens', 'Component Architecture']) if (!has(h)) issues.push(`missing ${h}`)
    for (const [h, re] of [['Color', /^###\s+Color Tokens/im], ['Typography', /^###\s+Typography Tokens/im], ['Spacing', /^###\s+Spacing Tokens/im]] as const) {
      const empty = sectionRows(doc, re).filter(r => !r[1])
      if (empty.length) issues.push(`${h} tokens without values: ${empty.map(r => r[0]).join(', ')}`)
    }
    if (!sectionRows(doc, /^###\s+Atoms/im).length) issues.push('no atoms defined')
  } else {
    for (const h of ['Research Goals', 'Methodology', 'Key Findings', 'Recommendations']) if (!has(h)) issues.push(`missing ${h}`)
    if (!/^###\s+Finding \d+/m.test(doc)) issues.push('no findings recorded')
  }
  const status = doc.match(/^\*\*Status:\*\*\s*(.+)$/m)?.[1]?.trim()
  return issues.length ? `${path} (${status}): INCOMPLETE\n${issues.map(i => `- ${i}`).join('\n')}` : `${path} (${status}): complete`
}

// --- audit grades (design §9.3, §7) ---

const GRADES = ['A', 'B', 'C', 'D', 'F']
export function designGrade(high: number, medium: number): string {
  const steps = high + medium * 0.5
  return GRADES[Math.min(4, Math.floor(steps))]!
}
export const slopGrade = (patterns: number) => patterns >= 5 ? 'F' : GRADES[Math.min(3, patterns)]!

export const PASSES = ['Information Architecture', 'Interaction State Coverage', 'User Journey & Emotional Arc', 'AI Slop Detection', 'Design System Alignment', 'Responsive & Accessibility', 'Unresolved Design Decisions']
export function passSummary(scores: { pre: number; post?: number; deferred?: boolean }[]): string {
  const rows = scores.map((s, i) => {
    const post = s.post ?? s.pre
    const status = post >= 7 ? (s.post !== undefined && s.post !== s.pre ? 'REMEDIATED' : 'PASS') : i === 6 && s.deferred ? 'DEFERRED' : 'BELOW 7'
    return [String(i + 1), PASSES[i] ?? `Pass ${i + 1}`, String(s.pre), String(post), status]
  })
  const avg = scores.length ? scores.reduce((t, s) => t + (s.post ?? s.pre), 0) / scores.length : 0
  return ['## Design Review Summary', '', table(['Pass', 'Dimension', 'Pre-Score', 'Post-Score', 'Status'], rows), '', `**Overall Design Readiness:** ${avg.toFixed(1)}/10`, ...(avg < 5 ? ['', 'WARNING: average below 5 — confirm with the user before building.'] : [])].join('\n')
}

// --- campaign report (marketing-workflows completion gate 4 and 5) ---

export const CONSISTENCY_CHECKLIST = [
  'All channel agents have received the core message and supporting points',
  'Campaign hashtags are defined and consistent across all channels',
  'Visual style guidelines are shared with visual channels (Instagram, TikTok)',
  'CTA destinations are aligned (all channels point to the same landing page/action)',
  'Tone guidelines per channel are documented in the campaign document',
  'Launch timing is coordinated (stagger by 2-4 hours across channels for maximum reach)',
  'Channel adaptation guidelines (Section 4.2) are included in each agent\'s execution context',
]

export type ReportInput = { phase?: number; path?: string; summary?: string; metrics?: string[][]; checklist?: (boolean | string)[]; learnings?: string[] }

const num = (s?: string) => { const m = s?.replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : undefined }

// Writes .planning/campaigns/{phase-slug}/REPORT.md. The campaign moves
// Measuring → Complete only when the measuring window
// (marketing.measuring_duration_days, default 14) has elapsed and every
// checklist item is satisfied or waived with a rationale.
export async function campaignReport(io: Io, input: ReportInput): Promise<string> {
  const p = await loadProject(io)
  const n = input.phase ?? p.state?.phase
  const ph = n ? await loadPhase(io, p, n) : undefined
  if (!n || !ph?.dir) return `Phase ${n ?? '?'} has no directory; the report goes in ${CAMPAIGN_DIR}/{phase-slug}/REPORT.md.`
  const docs = input.path ? [input.path] : (await io.list(CAMPAIGN_DIR)).filter(e => !e.dir && e.name.endsWith('.md')).map(e => `${CAMPAIGN_DIR}/${e.name}`)
  if (docs.length > 1) return `Several campaign documents (${docs.join(', ')}); pass path.`
  const path = docs[0]
  const doc = path ? await io.read(path) : undefined
  const name = doc?.match(/^# Campaign:\s*(.+)$/m)?.[1]?.trim() ?? p.roadmap?.phases.find(x => x.phase === n)?.name ?? ph.dir
  const status = doc?.match(/^\*\*Status:\*\*\s*(.+)$/m)?.[1]?.trim()
  const since = doc?.match(/^\*\*Measuring since:\*\*\s*(\S+)/m)?.[1]
  const days = Number((p.settings as any).marketing?.measuring_duration_days ?? 14)
  const elapsed = since ? Math.floor((io.now().getTime() - Date.parse(since)) / 86_400_000) : undefined
  const windowDone = elapsed !== undefined && elapsed >= days
  const targets = doc ? sectionRows(doc, /^###\s+Success Metrics/im) : []
  const metrics = input.metrics?.length ? input.metrics : targets.map(r => [r[0] ?? '', r[1] ?? '', ''])
  const metricRows = metrics.map(([m, t, a]) => {
    const tv = num(t), av = num(a)
    return [m ?? '', t || '—', a || 'not measured', tv !== undefined && av !== undefined ? (av >= tv ? 'MET' : 'MISSED') : '—']
  })
  const checks = CONSISTENCY_CHECKLIST.map((item, i) => { const c = input.checklist?.[i]; return { item, ok: c === true || (typeof c === 'string' && !!c.trim()), waiver: typeof c === 'string' ? c.trim() : undefined } })
  const checklistDone = checks.every(c => c.ok)
  const complete = status === 'Measuring' && windowDone && checklistDone
  const date = today(io)
  const out = `${CAMPAIGN_DIR}/${ph.dir}/REPORT.md`
  const text = [
    `# Campaign Report: ${name}`, '',
    `**Phase:** ${n}: ${p.roadmap?.phases.find(x => x.phase === n)?.name ?? ph.dir}`, `**Campaign:** ${path ? `\`${path}\`` : '_no campaign document_'}`, `**Generated:** ${date}`,
    `**Measuring window:** ${since ? `${since}, ${days} days (${windowDone ? 'elapsed' : `${Math.max(0, days - (elapsed ?? 0))} day(s) left`})` : `not started (${days} days once the campaign is Measuring)`}`,
    `**Campaign status:** ${complete ? 'Complete' : status ?? 'unknown'}`, '',
    '## Summary', input.summary?.trim() || '_to be written_', '',
    '## Results vs Targets', table(['Metric', 'Target', 'Actual', 'Result'], metricRows), '',
    '## Consistency Checklist', ...checks.map(c => `- [${c.ok ? 'x' : ' '}] ${c.item}${c.waiver ? ` — waived: ${c.waiver}` : ''}`), '',
    '## Learnings', ...(input.learnings?.length ? input.learnings.map(l => `- ${l}`) : ['_none recorded_']), '',
  ].join('\n')
  await io.write(out, text)
  if (complete && path && doc) await io.write(path, doc.replace(/^\*\*Status:\*\*.*$/m, '**Status:** Complete'))
  const why = complete ? 'campaign marked Complete' : status !== 'Measuring' ? `campaign is ${status ?? 'missing'}, not Measuring` : !windowDone ? `measuring window not elapsed (${since ? `${Math.max(0, days - (elapsed ?? 0))} day(s) left` : 'no start date'})` : `${checks.filter(c => !c.ok).length} checklist item(s) neither satisfied nor waived`
  return `Wrote ${out}: ${why}.`
}
