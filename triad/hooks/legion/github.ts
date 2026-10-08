// github-sync in code: the integrations.github gate, prerequisites, the `triad`
// label, one issue per phase (plan checklist, close on review pass),
// milestones, and the `## GitHub` table that mirrors every write in STATE.md.
// GitHub failures never block a workflow; they are reported.
import { loadPhase, loadProject, type Io } from './io.ts'
import { pad2 } from './planning.ts'
import { parseMilestones } from './milestone.ts'

export const LABEL = 'triad'
export const LABEL_COLOR = '7B68EE'
export const BRANCH_PREFIX = 'triad/phase-'
export const FOOTER = '---\n*Created by Triad*'

export type GhInfo = { ok: boolean; slug?: string; defaultBranch?: string; reason?: string }

export async function ghMode(io: Io): Promise<'enabled' | 'disabled' | 'prompt'> {
  const v = (await loadProject(io)).settings.integrations?.github
  return v === 'enabled' || v === 'disabled' ? v : 'prompt'
}

export async function setGhMode(io: Io, value: 'enabled' | 'disabled'): Promise<string> {
  let s: any = {}
  try { s = JSON.parse((await io.read('settings.json')) ?? '{}') } catch { return 'settings.json is not valid JSON; not changed.' }
  s.integrations = { ...(s.integrations ?? {}), github: value }
  await io.write('settings.json', JSON.stringify(s, null, 2) + '\n')
  return `integrations.github = ${value} (settings.json).`
}

export async function ghInfo(io: Io): Promise<GhInfo> {
  const auth = await io.run(['gh', 'auth', 'status']).catch(() => ({ exitCode: 127, stdout: '', stderr: 'gh not found' }))
  if (auth.exitCode !== 0) return { ok: false, reason: /not found|ENOENT/i.test(auth.stderr) ? 'gh is not installed' : 'Run `gh auth login` to enable GitHub integration.' }
  const remote = await io.run(['git', 'remote', 'get-url', 'origin'])
  if (remote.exitCode !== 0) return { ok: false, reason: 'no origin remote' }
  const v = await io.run(['gh', 'repo', 'view', '--json', 'nameWithOwner,defaultBranch', '-q', '.nameWithOwner + " " + .defaultBranch'])
  if (v.exitCode !== 0) return { ok: false, reason: /rate limit|403|429/i.test(v.stderr) ? 'GitHub API rate limit reached. Some data may be incomplete.' : 'GitHub unreachable. Continuing without GitHub integration.' }
  const [slug, defaultBranch] = v.stdout.trim().split(/\s+/)
  return { ok: true, slug, defaultBranch }
}

export async function ensureLabel(io: Io, name = LABEL, color = LABEL_COLOR, description = 'Created by Triad'): Promise<void> {
  await io.run(['gh', 'label', 'create', name, '--description', description, '--color', color]).catch(() => undefined)
}

// ---- STATE.md `## GitHub` (always the last section) ---------------------------

export type GhRow = { phase: string; issue: string; pr: string; status: string }
export type GhMilestoneRow = { name: string; number: string; status: string }

export function parseGithubSection(state: string): { rows: GhRow[]; milestones: GhMilestoneRow[] } {
  const i = state.search(/^## GitHub\s*$/m)
  if (i < 0) return { rows: [], milestones: [] }
  const rows: GhRow[] = []
  const milestones: GhMilestoneRow[] = []
  let inMs = false
  for (const l of state.slice(i).split('\n').slice(1)) {
    if (/^## /.test(l)) break
    if (/^### Milestones/.test(l)) { inMs = true; continue }
    if (!/^\|/.test(l) || /^\|\s*(Phase|Milestone)\s*\|/.test(l) || /^\|[\s:|-]+\|$/.test(l)) continue
    const c = l.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim())
    if (inMs) milestones.push({ name: c[0]!, number: c[1]!, status: c[2]! })
    else rows.push({ phase: c[0]!, issue: c[1]!, pr: c[2]!, status: c[3]! })
  }
  return { rows, milestones }
}

export function writeGithubSection(state: string, rows: GhRow[], milestones: GhMilestoneRow[], synced: string): string {
  const i = state.search(/^## GitHub\s*$/m)
  let before = i < 0 ? state : state.slice(0, i)
  let after = ''
  if (i >= 0) {
    const rest = state.slice(i).split('\n')
    const j = rest.findIndex((l, k) => k > 0 && /^## /.test(l))
    if (j > 0) after = rest.slice(j).join('\n')
  }
  const section = ['## GitHub', '', `_Last synced: ${synced}_`, '', '| Phase | Issue | PR | Status |', '|-------|-------|----|--------|', ...rows.map(r => `| ${r.phase} | ${r.issue} | ${r.pr} | ${r.status} |`),
    ...(milestones.length ? ['', '### Milestones', '', '| Milestone | GitHub # | Status |', '|-----------|----------|--------|', ...milestones.map(m => `| ${m.name} | ${m.number} | ${m.status} |`)] : []), ''].join('\n')
  before = before.replace(/\s*$/, '\n\n')
  return (after ? before + after.replace(/\s*$/, '\n\n') : before) + section
}

async function mirror(io: Io, f: (rows: GhRow[], ms: GhMilestoneRow[]) => void): Promise<string | undefined> {
  try {
    const state = (await io.read('.planning/STATE.md')) ?? ''
    const { rows, milestones } = parseGithubSection(state)
    f(rows, milestones)
    await io.write('.planning/STATE.md', writeGithubSection(state, rows, milestones, io.now().toISOString().slice(0, 19) + 'Z'))
    return undefined
  } catch (e) { return `WARN: STATE.md GitHub mirror failed: ${(e as Error).message}` }
}

const phaseLabel = (n: number, name: string) => `Phase ${n}: ${name}`
export async function issueOf(io: Io, n: number): Promise<number | undefined> {
  const { rows } = parseGithubSection((await io.read('.planning/STATE.md')) ?? '')
  const r = rows.find(x => x.phase.startsWith(`Phase ${n}:`) || x.phase === `Phase ${n}`)
  const m = r?.issue.match(/#(\d+)/)
  return m ? Number(m[1]) : undefined
}

// ---- phase issue -------------------------------------------------------------

export async function phaseIssueBody(io: Io, n: number): Promise<{ title: string; body: string; name: string } | undefined> {
  const p = await loadProject(io)
  const info = p.roadmap?.phases.find(x => x.phase === n)
  if (!info) return undefined
  const ph = await loadPhase(io, p, n)
  const plans = ph.plans.map(pl => `- [ ] Plan ${pl.id}: ${pl.fm.title ?? pl.fm.name ?? pl.body.match(/^# (.+)$/m)?.[1] ?? pl.id}`)
  return {
    name: info.name, title: `Phase ${n}: ${info.name}`,
    body: ['## Goal', info.goal, '', '## Plans', ...(plans.length ? plans : ['_not planned yet_']), '', '## Requirements', info.requirements || '_none_', '', '## Success Criteria', ...(info.criteria.length ? info.criteria.map(c => `- ${c}`) : ['_none_']), '', FOOTER].join('\n'),
  }
}

export async function ghPhaseIssue(io: Io, n: number): Promise<string> {
  const gh = await ghInfo(io)
  if (!gh.ok) return `GitHub sync skipped: ${gh.reason}`
  if (await issueOf(io, n)) return `Phase ${n} already has issue #${await issueOf(io, n)}.`
  const b = await phaseIssueBody(io, n)
  if (!b) return `No Phase ${n} in ROADMAP.md.`
  await ensureLabel(io)
  const ms = await ghMilestone(io, gh, n)
  const r = await io.run(['gh', 'issue', 'create', '--title', b.title, '--body', b.body, '--label', LABEL, ...(ms.title ? ['--milestone', ms.title] : [])])
  if (r.exitCode !== 0) return `GitHub issue creation failed (continuing): ${r.stderr.trim()}`
  let num = Number(r.stdout.trim().split('/').pop())
  if (!num) {
    const l = await io.run(['gh', 'issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number,title', '-q', '.[0].number'])
    num = Number(l.stdout.trim())
  }
  const warn = await mirror(io, rows => { rows.push({ phase: phaseLabel(n, b.name), issue: `#${num}`, pr: '—', status: 'Open' }) })
  return [`Created issue #${num} for Phase ${n}${ms.title ? ` (milestone ${ms.title})` : ''}.`, ...(ms.note ? [ms.note] : []), ...(warn ? [warn] : [])].join('\n')
}

async function ghMilestone(io: Io, gh: GhInfo, n: number): Promise<{ title?: string; note?: string }> {
  const roadmap = (await io.read('.planning/ROADMAP.md')) ?? ''
  const m = parseMilestones(roadmap).find(x => n >= x.start && n <= x.end)
  if (!m) return {}
  const title = m.name
  const q = await io.run(['gh', 'api', `repos/${gh.slug}/milestones`, '--jq', `.[] | select(.title == "${title.replace(/"/g, '')}") | .number`])
  if (q.exitCode !== 0) return { note: 'Milestone API failed; skipping milestones.' }
  let number = q.stdout.trim().split('\n')[0]
  if (!number) {
    const c = await io.run(['gh', 'api', `repos/${gh.slug}/milestones`, '--method', 'POST', '-f', `title=${title}`, '-f', `description=Phases ${m.start}-${m.end}: ${m.goal}`, '--jq', '.number'])
    if (c.exitCode !== 0) return { note: 'Milestone API failed; skipping milestones.' }
    number = c.stdout.trim()
  }
  await mirror(io, (_, ms) => { if (!ms.some(x => x.name === title)) ms.push({ name: title, number: `#${number}`, status: 'Open' }) })
  return { title }
}

export async function ghTickPlan(io: Io, n: number, planId: string): Promise<string | undefined> {
  const num = await issueOf(io, n)
  if (!num) return undefined
  const v = await io.run(['gh', 'issue', 'view', String(num), '--json', 'body', '-q', '.body'])
  if (v.exitCode !== 0) return `GitHub checklist update failed for #${num}`
  const body = v.stdout.replace(new RegExp(`^- \\[ \\] Plan ${planId}:`, 'm'), `- [x] Plan ${planId}:`)
  if (body === v.stdout) return undefined
  const e = await io.run(['gh', 'issue', 'edit', String(num), '--body', body.replace(/\n$/, '')])
  return e.exitCode === 0 ? `Ticked Plan ${planId} on #${num}` : `GitHub checklist update failed for #${num}`
}

export async function ghClosePhase(io: Io, n: number, info: { plans: number; requirements: string; result: string }): Promise<string | undefined> {
  const num = await issueOf(io, n)
  if (!num) return undefined
  const r = await io.run(['gh', 'issue', 'close', String(num), '--comment', `Phase completed successfully.\n- Plans executed: ${info.plans}\n- Requirements satisfied: ${info.requirements || 'n/a'}\n- Review result: ${info.result}`])
  if (r.exitCode !== 0) return `Closing #${num} failed (continuing): ${r.stderr.trim()}`
  await mirror(io, rows => { const row = rows.find(x => x.issue === `#${num}`); if (row) row.status = 'Closed' })
  // Close the milestone once all its phases are complete.
  const gh = await ghInfo(io)
  const p = await loadProject(io)
  const m = parseMilestones(p.roadmapText ?? '').find(x => n >= x.start && n <= x.end)
  if (gh.ok && m && p.roadmap) {
    const done = p.roadmap.rows.filter(r => r.phase >= m.start && r.phase <= m.end).every(r => /^complete|shipped/i.test(r.status))
    const { milestones } = parseGithubSection(p.stateText ?? '')
    const row = milestones.find(x => x.name === m.name)
    if (done && row) {
      const id = row.number.replace('#', '')
      const open = await io.run(['gh', 'api', `repos/${gh.slug}/milestones/${id}`, '--jq', '.open_issues'])
      await io.run(['gh', 'api', `repos/${gh.slug}/milestones/${id}`, '--method', 'PATCH', '-f', 'state=closed'])
      await mirror(io, (_, ms) => { const x = ms.find(y => y.number === row.number); if (x) x.status = 'Closed' })
      return `Closed #${num} and milestone ${row.name}${Number(open.stdout.trim()) > 0 ? ` (warning: ${open.stdout.trim()} open issues remain)` : ''}.`
    }
  }
  return `Closed #${num}.`
}

export async function ghRecordPr(io: Io, n: number, name: string, pr: number): Promise<string | undefined> {
  return mirror(io, rows => {
    const row = rows.find(x => x.phase.startsWith(`Phase ${n}:`))
    if (row) row.pr = `#${pr}`
    else rows.push({ phase: phaseLabel(n, name), issue: '—', pr: `#${pr}`, status: 'Open' })
  })
}

// Read-only readback for /triad:status.
export async function ghStatus(io: Io): Promise<string> {
  const gh = await ghInfo(io)
  if (!gh.ok) return `GitHub: ${gh.reason}`
  const j = async (argv: string[]) => { const r = await io.run(argv); try { return r.exitCode === 0 ? JSON.parse(r.stdout || '[]') : [] } catch { return [] } }
  const issues: any[] = await j(['gh', 'issue', 'list', '--label', LABEL, '--state', 'all', '--json', 'number,title,state', '--limit', '100'])
  const prs: any[] = await j(['gh', 'pr', 'list', '--state', 'all', '--json', 'number,title,state,mergedAt,body', '--limit', '100'])
  const ms: any[] = await j(['gh', 'api', `repos/${gh.slug}/milestones?state=all`])
  const out = ['| Phase | Issue | PR | Status |', '|-------|-------|----|--------|']
  for (const i of issues.filter(x => /^Phase \d+:/.test(x.title))) {
    const pr = prs.find(p => new RegExp(`Closes #${i.number}\\b`).test(p.body ?? '') || p.title.startsWith(i.title.split(':')[0] + ':'))
    const open = i.state === 'OPEN'
    const status = open ? (pr && pr.state === 'OPEN' ? 'In Review' : 'In Progress') : !pr ? 'Complete (no PR)' : pr.mergedAt ? 'Complete' : 'Closed'
    out.push(`| ${i.title} | #${i.number} | ${pr ? `#${pr.number}` : '—'} | ${status} |`)
  }
  if (ms.length) out.push('', 'Milestones:', ...ms.map(m => `- ${m.title} (#${m.number}) — ${m.closed_issues}/${m.closed_issues + m.open_issues} issues closed`))
  return out.join('\n')
}

export const phaseBranch = (n: number, name: string) => `${BRANCH_PREFIX}${pad2(n)}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '')}`
