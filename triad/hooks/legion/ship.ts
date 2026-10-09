// /triad:ship in code: scope, the 6 pre-ship gates (all run, then a verdict),
// SHIP-REPORT.md, the PR body, publishing (push, labels, gh pr create; never a
// force-push), post-ship verification, STATE/ROADMAP/OUTCOMES and the commit,
// and canary checks for the scheduler.
import { loadPhase, loadProject, today, type Io, type PhaseFiles, type Project } from './io.ts'
import { pad2, setRoadmapRow, updateState } from './planning.ts'
import { commit, dirtyFiles, runVerification } from './build.ts'
import { ensureLabel, ghInfo, ghRecordPr, issueOf, phaseBranch, FOOTER } from './github.ts'
import type { VerifyRun } from './render.ts'
import { preShipAudit } from './gates.ts'

export type Check = { name: string; pass: boolean; detail: string[]; extra?: string; skipped?: boolean }
export type Gate = { n: number; name: string; ph: PhaseFiles; checks: Check[]; verify: VerifyRun[]; test?: VerifyRun; testCommand?: string }

// Test command: settings adapter.test_command, else from the manifests.
export async function detectTestCommand(io: Io, settings: any, key: 'adapter' | 'polish' = 'adapter'): Promise<string | undefined> {
  const set = settings?.[key]?.test_command ?? settings?.adapter?.test_command
  if (set) return String(set)
  const pkg = await io.read('package.json')
  if (pkg) { try { if (JSON.parse(pkg).scripts?.test && !/no test specified/.test(JSON.parse(pkg).scripts.test)) return 'npm test' } catch { /* not JSON */ } }
  if ((await io.read('Cargo.toml')) !== undefined) return 'cargo test'
  if ((await io.read('pytest.ini')) !== undefined || /\[tool\.pytest/.test((await io.read('pyproject.toml')) ?? '')) return 'pytest'
  if ((await io.read('go.mod')) !== undefined) return 'go test ./...'
  if (/^test:/m.test((await io.read('Makefile')) ?? '')) return 'make test'
  return undefined
}

export async function detectTypeCheck(io: Io, settings: any): Promise<string | undefined> {
  if (settings?.polish?.type_check_command) return String(settings.polish.type_check_command)
  if ((await io.read('tsconfig.json')) !== undefined) return 'npx tsc --noEmit'
  if ((await io.read('mypy.ini')) !== undefined || /\[tool\.mypy/.test((await io.read('pyproject.toml')) ?? '')) return 'mypy .'
  if ((await io.read('Cargo.toml')) !== undefined) return 'cargo check'
  return undefined
}

const tail = (s: string, n: number) => s.trimEnd().split('\n').slice(-n).join('\n')
const filesOf = (summary: string) => [...(summary.match(/^## Files Modified\n([\s\S]*?)(\n## |$)/m)?.[1] ?? '').matchAll(/^- `?([^`\n]+?)`?\s*$/gm)].map(m => m[1]!).filter(f => !/^\(none\)$/.test(f))
const agentOf = (summary: string) => summary.match(/^\*\*Agent\*\*:\s*(.+)$/m)?.[1]?.trim() ?? '?'
const statusOf = (summary: string) => summary.match(/^\*\*Status\*\*:\s*(.+)$/m)?.[1]?.trim() ?? '?'

function reviewBlockers(review: string): string[] {
  return review.split('\n').filter(l => /^\|\s*[A-Z]+-?\d+\s*\|\s*(blocker|critical)\s*\|/i.test(l) && /\|\s*open\s*\|\s*$/i.test(l)).map(l => l.split('|')[1]!.trim())
}
function securityBlockers(sec: string | undefined): string[] {
  if (!sec) return []
  return sec.split('\n').filter(l => /^\|\s*SEC-\d+/.test(l) && /\|\s*(CRITICAL|HIGH)\s*\|/i.test(l) && /\|\s*OPEN\s*\|\s*$/i.test(l)).map(l => l.split('|')[1]!.trim())
}
function blockerEscalations(summary: string): number {
  const rows = (summary.match(/^## Escalations\n([\s\S]*?)(\n## |$)/m)?.[1] ?? '').split('\n').filter(l => /^\|\s*\d+\s*\|\s*blocker\s*\|/i.test(l) && !/\|\s*resolved\s*\|/i.test(l)).length
  const blocks = [...summary.matchAll(/<escalation>([\s\S]*?)<\/escalation>/g)].filter(m => /severity:\s*blocker/i.test(m[1]!) && !/(resolution|status):\s*resolved/i.test(m[1]!)).length
  return rows + blocks
}

export async function resolveScope(io: Io, p: Project, phase?: number): Promise<{ n?: number; name?: string; error?: string }> {
  if (!p.project) return { error: 'No Triad project found in this directory. Run `/triad:start` to initialize.' }
  const rm = p.roadmap
  if (phase !== undefined) {
    const info = rm?.phases.find(x => x.phase === phase) ?? rm?.rows.find(x => x.phase === phase)
    return info ? { n: phase, name: info.name } : { error: `Phase ${phase} is not in ROADMAP.md.` }
  }
  const n = p.state?.phase
  if (!n) return { error: 'No current phase in STATE.md; pass --phase N.' }
  const row = rm?.rows.find(r => r.phase === n)
  const status = p.state?.status ?? ''
  // build leaves "Phase N complete — all plans executed" with the row Executed; only review marks the row Complete
  if (!/review passed/i.test(status) && !/^(complete|shipped)/i.test(row?.status ?? '')) {
    return { error: `Phase ${n} has not passed review yet (status: ${status || 'unknown'}). Run \`/triad:review\` before shipping, or specify a reviewed phase with \`--phase N\`.` }
  }
  return { n, name: rm?.phases.find(x => x.phase === n)?.name ?? row?.name ?? '' }
}

// The gate's commands (every plan's verification commands, then the test
// suite) run through runVerification, as a job a runner agent waits on
// (runner.ts), never as one silent child process of this call. Results that
// all passed are kept for the commit they ran on, so publish, and a ship run
// again after a session restart, reuse them instead of running the suite again.
export const GATE_DIR = '.triad/ship-gate'
const GATE_CACHE = `${GATE_DIR}/results.json`
export type GateMeta = { phase: number; head: string; commands: { plan?: string; command: string }[] }
const headOf = async (io: Io) => { const r = await io.run(['git', 'rev-parse', 'HEAD']); return r.exitCode === 0 ? r.stdout.trim() : '' }

export async function shipGate(io: Io, opts: { phase?: number }): Promise<Gate | string> {
  const p = await loadProject(io)
  const s = await resolveScope(io, p, opts.phase)
  if (s.error) return s.error
  const n = s.n!
  const ph = await loadPhase(io, p, n)
  const own = `${ph.rel}/SHIP-REPORT.md`
  // The report `check` writes is ours, and .triad/ is Triad's own: neither makes the tree dirty for the gate.
  const dirty = [...(await dirtyFiles(io))].filter(f => f !== own && !f.startsWith('.triad/'))
  const checks: Check[] = []
  const missing = ph.plans.filter(pl => !ph.summaries[pl.id])
  checks.push({ name: 'Build complete', pass: ph.plans.length > 0 && !missing.length, detail: ph.plans.length ? missing.length ? [`GATE FAIL: ${missing.length} plans missing build output. Run /triad:build to complete.`, ...missing.map(m => `- ${m.id}`)] : [] : ['GATE FAIL: no plans in this phase. Run /triad:plan and /triad:build.'] })
  const sec = ph.rel ? await io.read(`${ph.rel}/SECURITY-REVIEW.md`) ?? await io.read(`${ph.rel}/${pad2(n)}-SECURITY-REVIEW.md`) : undefined
  const blockers = ph.review ? [...reviewBlockers(ph.review), ...securityBlockers(sec)] : []
  checks.push({ name: 'Review passed', pass: !!ph.review && !blockers.length, detail: !ph.review ? ['GATE FAIL: No review found. Run /triad:review before shipping.'] : blockers.length ? [`GATE FAIL: ${blockers.length} unresolved blockers in review.`, ...blockers.map(b => `- ${b}`)] : [] })
  const esc = Object.values(ph.summaries).reduce((a, t) => a + blockerEscalations(t), 0)
  checks.push({ name: 'No blocker escalations', pass: esc === 0, detail: esc ? [`GATE FAIL: ${esc} unresolved blocker escalations.`] : [] })
  const clean: Check = { name: 'Clean working tree', pass: !dirty.length, detail: dirty.length ? ['GATE FAIL: Uncommitted changes in working tree. Commit or stash before shipping.', ...dirty.slice(0, 20).map(f => `- ${f}`)] : [] }
  const testCommand = await detectTestCommand(io, p.settings)
  const meta: GateMeta = { phase: n, head: await headOf(io), commands: [...ph.plans.flatMap(pl => (pl.fm.verification_commands ?? []).map(command => ({ plan: pl.id, command }))), ...(testCommand ? [{ command: testCommand }] : [])] }
  const quickFail = checks.some(c => !c.pass) || !clean.pass
  let runs: VerifyRun[] = []
  if (!quickFail && meta.commands.length) {
    let cached: { meta: GateMeta; runs: VerifyRun[] } | undefined
    try { cached = JSON.parse((await io.read(GATE_CACHE)) ?? '') } catch { cached = undefined }
    if (meta.head && cached && JSON.stringify(cached.meta) === JSON.stringify(meta)) runs = cached.runs
    else {
      runs = await runVerification(io, meta.commands.map(c => c.command), undefined, `ship phase ${n} gate`)
      if (meta.head && runs.every(r => r.passed)) await io.write(GATE_CACHE, JSON.stringify({ meta, runs }))
    }
  }
  const verify = runs.slice(0, runs.length - (testCommand ? 1 : 0))
  const test = testCommand && !quickFail ? runs[runs.length - 1] : undefined
  const vdetail = meta.commands.flatMap((c, i) => c.plan && runs[i] && !runs[i]!.passed ? [`GATE FAIL: Verification command failed: \`${c.command}\` — exit code ${runs[i]!.exitCode} (plan ${c.plan})`, tail(runs[i]!.output ?? '', 10)] : [])
  // With an earlier gate failing the commands do not run: the verdict is already no.
  const skipped = quickFail && meta.commands.length > 0
  if (skipped) checks.push({ name: 'Verification commands', pass: false, skipped, detail: [] })
  else checks.push({ name: 'Verification commands', pass: !vdetail.length, detail: vdetail, extra: `${verify.filter(v => v.passed).length}/${verify.length}` })
  if (testCommand) checks.push(skipped ? { name: 'Tests pass', pass: false, skipped, detail: [] } : { name: 'Tests pass', pass: !!test?.passed, detail: test?.passed ? [] : ['GATE FAIL: Test suite failed.', tail(test?.output ?? '', 20)] })
  else checks.push({ name: 'Tests pass', pass: true, detail: [], extra: 'no test command found' })
  checks.push(clean)
  return { n, name: s.name!, ph, checks, verify, test, testCommand }
}

export function renderGate(g: Gate): string {
  const passed = g.checks.filter(c => c.pass).length
  const out = [`## Pre-Ship Gate: Phase ${g.n}`, '| Check | Status |', '|-------|--------|', ...g.checks.map(c => `| ${c.name} | ${c.skipped ? 'Not run' : c.pass ? 'Pass' : 'FAIL'}${c.extra ? ` (${c.extra})` : ''} |`), '', `**Result**: ${passed} of 6 gates passed`]
  const fails = g.checks.filter(c => !c.pass)
  if (fails.length) out.push('', ...fails.flatMap(c => c.detail), ...(g.checks.some(c => c.skipped) ? ['The verification commands and tests did not run: the gates above fail first.'] : []), '', 'Ship blocked — resolve the above issues and re-run /triad:ship.')
  return out.join('\n')
}

function grouped(files: string[]): string {
  if (!files.length) return '_none_'
  const by = new Map<string, string[]>()
  for (const f of files) { const d = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.'; by.set(d, [...(by.get(d) ?? []), f]) }
  return [...by].sort().map(([d, fs]) => `**${d}/**\n${fs.map(f => `- \`${f}\``).join('\n')}`).join('\n\n')
}

function facts(g: Gate) {
  const files = [...new Set(Object.values(g.ph.summaries).flatMap(filesOf))].sort()
  const plans = g.ph.plans.map(pl => ({ id: pl.id, agent: agentOf(g.ph.summaries[pl.id] ?? ''), status: /^complete/i.test(statusOf(g.ph.summaries[pl.id] ?? '')) ? 'Completed' : 'Partial', files: filesOf(g.ph.summaries[pl.id] ?? '').length }))
  const rows = (g.ph.review ?? '').split('\n').filter(l => /^\|\s*[A-Z]+-?\d+\s*\|\s*\w+\s*\|/.test(l)).map(l => l.split('|').map(c => c.trim()))
  const sev = (s: RegExp) => rows.filter(r => s.test(r[2]!)).length
  const resolved = rows.filter(r => !/^open$/i.test(r[7]!))
  const result = g.ph.review?.match(/^## Result: (.+)$/m)?.[1] ?? '?'
  const testLine = g.test ? `- **Command**: \`${g.testCommand}\` — ${g.test.passed ? 'passed' : 'failed'}${(g.test.output ?? '').match(/(\d+) pass(?:ed)?[^\n]*?(\d+) fail/i) ? ` (${(g.test.output ?? '').match(/(\d+) pass(?:ed)?[^\n]*?(\d+) fail/i)![0]})` : ''}` : 'Test results not captured'
  const escalations = Object.entries(g.ph.summaries).flatMap(([id, t]) => (t.match(/^## Escalations\n([\s\S]*?)(\n## |$)/m)?.[1] ?? '').split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l)).map(l => `- ${id}: ${l.split('|').slice(2, 6).map(c => c.trim()).join(' · ')}`))
  return { files, plans, blocker: sev(/blocker|critical/i), warning: sev(/major/i), info: sev(/minor|advisory/i), resolved, total: rows.length, verdict: result === 'PASSED' ? (rows.length ? 'PASSED WITH NOTES' : 'PASSED') : result, testLine, escalations }
}

export function renderShipReport(g: Gate, at: Date, prUrl?: string): string {
  const f = facts(g)
  return ['---', `phase: ${pad2(g.n)}`, `phase_name: ${g.name}`, `ship_date: ${at.toISOString()}`, 'gate_result: PASSED', `files_modified_count: ${f.files.length}`, `agents_used: ${new Set(f.plans.map(p => p.agent)).size}`, `review_verdict: ${f.verdict}`, ...(prUrl ? [`pr_url: ${prUrl}`] : []), '---', '',
    `# Ship Report — Phase ${pad2(g.n)}: ${g.name}`, '', `## Files Modified (${f.files.length} files)`, grouped(f.files), '',
    '## Agent Assignments', ...(f.plans.length ? ['| Plan | Agent | Status | Files Modified |', '|------|-------|--------|---------------|', ...f.plans.map(p => `| ${p.id} | ${p.agent} | ${p.status} | ${p.files} |`)] : ['_none_']), '',
    '## Test Results', f.testLine, '',
    '## Review Findings', `- ${f.blocker} BLOCKER, ${f.warning} WARNING, ${f.info} INFO; resolved ${f.resolved.length}/${f.total}`, ...f.resolved.map(r => `- ${r[1]} ${r[5]?.slice(0, 100)} (${r[7]})`), '',
    '## Escalation Log', ...(f.escalations.length ? f.escalations : ['_none_']), '',
    '## Verification Results', ...(g.verify.length ? ['| Command | Result |', '|---------|--------|', ...g.verify.map(v => `| \`${v.command.replace(/\|/g, '\\|')}\` | ${v.passed ? 'PASS' : 'FAIL'} |`)] : ['_none_']), ''].join('\n')
}

export function renderPrBody(g: Gate, issue?: number): string {
  const f = facts(g)
  return ['## Summary', `- Phase ${pad2(g.n)}: ${g.name}`, `- ${g.ph.plans.length} plans executed, ${f.files.length} files modified`, `- Review: ${f.verdict}`, '',
    '## Changes', grouped(f.files), '', '### Agent Contributions', '| Plan | Agent | Status |', '|------|-------|--------|', ...f.plans.map(p => `| ${p.id} | ${p.agent} | ${p.status} |`), '',
    '## Test Results', f.testLine, '', '## Review Status', `- **Findings**: ${f.blocker} BLOCKER, ${f.warning} WARNING, ${f.info} INFO`, `- **Resolved**: ${f.resolved.length}/${f.total}`, ...f.resolved.map(r => `- ${r[1]}: ${r[5]?.slice(0, 100)}`), '',
    '## Verification', ...(g.verify.length ? g.verify.map(v => `- \`${v.command}\`: ${v.passed ? 'pass' : 'FAIL'}`) : ['_none_']), '',
    ...(issue ? [`Closes #${issue}`, ''] : []), FOOTER].join('\n')
}

// Legion's name (ship-pipeline: phases/{NN}/SHIP-REPORT.md).
const reportPath = (g: Gate) => `${g.ph.rel}/SHIP-REPORT.md`

// Gate + report. With dry_run nothing is written.
export async function shipCheck(io: Io, opts: { phase?: number; dry_run?: boolean }): Promise<string> {
  const g = await shipGate(io, opts)
  if (typeof g === 'string') return g
  const head = [...(opts.dry_run ? ['DRY RUN — ship checks will run but no PRs, pushes, or state changes will be made', ''] : []), `Ship scope: Phase ${g.n} — ${g.name}`, '', renderGate(g)]
  if (g.checks.some(c => !c.pass)) return head.join('\n')
  const report = renderShipReport(g, io.now())
  if (!opts.dry_run) await io.write(reportPath(g), report)
  const gh = await ghInfo(io)
  const issue = await issueOf(io, g.n)
  return [...head, '', opts.dry_run ? report : `Wrote ${reportPath(g)}.`, '', '## PR preview', `Title: Phase ${pad2(g.n)}: ${g.name}`, renderPrBody(g, issue), '',
    gh.ok ? `GitHub available (${gh.slug}, base ${gh.defaultBranch}). Publish options: pr / push / mark / abort.` : `GitHub not available (${gh.reason}). Publish options: push / mark / abort.`,
    ...(opts.dry_run ? ['', 'DRY RUN — skipping ship actions'] : [])].join('\n')
}

// Publish, then post-ship bookkeeping.
export async function shipPublish(io: Io, opts: { phase?: number; method: 'pr' | 'push' | 'mark' }): Promise<string> {
  const g = await shipGate(io, opts)
  if (typeof g === 'string') return g
  const own = reportPath(g)
  if (g.checks.some(c => !c.pass)) return renderGate(g)
  const p = await loadProject(io)
  const out: string[] = []
  let prUrl: string | undefined
  let prNumber: number | undefined
  if (opts.method !== 'mark') {
    const gh = opts.method === 'pr' ? await ghInfo(io) : undefined
    if (opts.method === 'pr' && !gh!.ok) return `Cannot create a PR: ${gh!.reason}`
    let branch = (await io.run(['git', 'branch', '--show-current'])).stdout.trim()
    const base = gh?.defaultBranch ?? 'main'
    if (opts.method === 'pr' && (branch === base || !branch)) {
      const nb = phaseBranch(g.n, g.name)
      const c = await io.run(['git', 'checkout', '-b', nb])
      if (c.exitCode !== 0) return `Could not create branch ${nb}: ${c.stderr.trim()}`
      branch = nb
      out.push(`Created branch ${nb}.`)
    }
    const push = await io.run(['git', 'push', '-u', 'origin', branch])
    if (push.exitCode !== 0) return [...out, `Push failed; no PR created: ${(push.stderr || push.stdout).trim()}`].join('\n')
    out.push(`Pushed ${branch}.`)
    if (opts.method === 'pr') {
      // A ship stopped after its PR was opened (a session restart) finds that PR again.
      const open = await io.run(['gh', 'pr', 'list', '--head', branch, '--base', base, '--state', 'open', '--json', 'url', '--jq', '.[0].url'])
      prUrl = open.exitCode === 0 ? open.stdout.trim().split('\n').find(l => /^https?:\/\//.test(l)) : undefined
      if (prUrl) out.push(`PR already open: ${prUrl}`)
      else {
        await ensureLabel(io, 'triad-ship', '0E8A16', 'Shipped by Triad')
        await ensureLabel(io, `phase-${pad2(g.n)}`, 'C5DEF5', `Phase ${g.n}`)
        const audit = await preShipAudit(io, 'gh pr create')
        if (audit) return [...out, audit].join('\n')
        const bodyFile = '.triad/pr-body.md'
        await io.write(bodyFile, renderPrBody(g, await issueOf(io, g.n)))
        const pr = await io.run(['gh', 'pr', 'create', '--title', `Phase ${pad2(g.n)}: ${g.name}`, '--body-file', bodyFile, '--base', base, '--head', branch, '--label', 'triad-ship', '--label', `phase-${pad2(g.n)}`, '--assignee', '@me'])
        if (pr.exitCode !== 0) return [...out, `PR creation failed: ${(pr.stderr || pr.stdout).trim()}`].join('\n')
        prUrl = pr.stdout.trim().split('\n').find(l => /^https?:\/\//.test(l))
        out.push(`PR: ${prUrl}`)
      }
      prNumber = Number(prUrl?.split('/').pop()) || undefined
      if (prNumber) { const w = await ghRecordPr(io, g.n, g.name, prNumber); if (w) out.push(w) }
    }
  }
  // Post-ship verification (warn only): publishing pushed the commit the gate
  // verified, unchanged, so the gate's runs on it stand for it.
  const post = g.verify
  for (const r of post.filter(r => !r.passed)) out.push(`Post-ship verification failure: \`${r.command}\``)
  await io.write(own, renderShipReport(g, io.now(), prUrl))
  const date = today(io)
  if (p.stateText) await io.write('.planning/STATE.md', updateState((await io.read('.planning/STATE.md')) ?? p.stateText, { status: `Phase ${g.n} shipped (${date})${prUrl ? ` — PR ${prUrl}` : ''}`, lastActivity: `Phase ${g.n} shipped (${date})` }))
  if (p.roadmapText) await io.write('.planning/ROADMAP.md', setRoadmapRow(p.roadmapText, g.n, { status: 'Shipped' }))
  const files = ['.planning/STATE.md', '.planning/ROADMAP.md', own]
  if ((await io.list('.planning/memory')).length) {
    const o = '.planning/memory/OUTCOMES.md'
    await io.write(o, ((await io.read(o)) ?? '').replace(/\s*$/, '\n\n') + [`## Phase ${g.n} — Shipped ${date}`, 'task_type: ship', 'agent: ship-pipeline', 'result: success', `pr: ${prUrl ?? 'N/A'}`, `verification: ${post.filter(v => v.passed).length}/${post.length} passed`, ''].join('\n'))
    files.push(o)
  }
  const err = await commit(io, files, `chore(${p.settings.execution.commit_prefix}): ship phase ${g.n} — ${g.name}\n\nAll quality gates passed. ${g.ph.plans.length} plans shipped.\nPR: ${prUrl ?? 'N/A'}`)
  if (err) out.push(err)
  else if (opts.method !== 'mark') await io.run(['git', 'push', 'origin', 'HEAD'])
  out.push(`Phase ${g.n}: ${g.name} — Shipped!`)
  return out.join('\n')
}

// One canary check against the gate's verification baseline.
export type CanaryResult = { status: 'HEALTHY' | 'DEGRADED' | 'REGRESSION'; passed: number; total: number; regressions: string[] }
// waitSeconds: a pause in the same job before the checks run.
export async function canaryCheck(io: Io, phase: number, extra: string[] = [], waitSeconds = 0): Promise<CanaryResult> {
  const p = await loadProject(io)
  const ph = await loadPhase(io, p, phase)
  const cmds = [...ph.plans.flatMap(pl => pl.fm.verification_commands ?? []), ...extra]
  const test = await detectTestCommand(io, p.settings)
  const all = test ? [...cmds, test] : cmds
  const runs = (await runVerification(io, waitSeconds > 0 ? [`sleep ${Math.round(waitSeconds)}`, ...all] : all, undefined, `canary phase ${phase} check`)).slice(waitSeconds > 0 ? 1 : 0)
  const failed = runs.filter(r => !r.passed)
  // Every one of these passed at the gate, so a failure now is a regression.
  return { status: failed.length ? 'REGRESSION' : 'HEALTHY', passed: runs.length - failed.length, total: runs.length, regressions: failed.map(f => f.command) }
}

export function renderCanary(interval: string, r: CanaryResult, commitHash: string): string {
  const head = [`## Canary Check — ${interval} after deploy`, `**Status**: ${r.status}`, `**Verification**: ${r.passed}/${r.total} commands passed`, `**New Errors**: ${r.regressions.length}`]
  if (r.status === 'REGRESSION') head.push('', '## Canary Monitoring — REGRESSION DETECTED', ...r.regressions.map(c => `- \`${c}\` passed before deploy and fails now`), '', `Run \`git revert ${commitHash}\` to roll back. Automatic rollback disabled for safety.`)
  return head.join('\n')
}
