// The review loop (review-loop, review-panel) in mod code: reviewers in
// parallel, triage in code, fix agents routed by file, scoped re-review, cycle
// cap, stale-loop abort, REVIEW.md, STATE/ROADMAP, commits.
import { ghClosePhase } from './github.ts'
import { OUTCOMES, storeKnowledge, storeOutcome } from './memory.ts'
import { loadPhase, loadProject, today, type Io } from './io.ts'
import { checkPhase, getSection, overlaps, pad2, setRoadmapRow, updateState, verificationCommands } from './planning.ts'
import { BY_ID, classicReviewers, composePanel, divisionsOf, fixAgentFor, personaBrief, rubricOf } from './registry.ts'
import type { Persona } from './personas.ts'
import { REVIEWER_RULES, parseReport, passed, reviewed, renderReview, signature, triage, MUST_FIX, type Finding, type ReviewerReport } from './review.ts'
import { runVerification, dirtyFiles, type Agents } from './build.ts'
import { parseReply } from '../policy.ts'
import { phaseNumbers } from './status.ts'
import type { Mode } from './settings.ts'

export type ReviewOptions = { phase?: number; mode?: 'panel' | 'classic'; maxCycles?: number; log?: (s: string) => void }
export type ReviewResult = { ok: boolean; result?: 'PASSED' | 'ESCALATED' | 'STALE LOOP ABORTED'; error?: string; cycles: number; text: string; open: Finding[] }

function reviewerBrief(o: { persona: Persona; panel: boolean; phase: number; name: string; goal: string; criteria: string[]; files: string[]; open: Finding[]; cycle: number; checks: string[] }): string {
  const r = rubricOf(o.persona)
  return [
    personaBrief(o.persona),
    '',
    `# Review: Phase ${o.phase}: ${o.name} (cycle ${o.cycle})`,
    `Goal: ${o.goal || '(see CONTEXT.md)'}`,
    ...(o.criteria.length ? ['Success criteria:', ...o.criteria.map(c => `- ${c}`)] : []),
    '',
    `Files to review: ${o.files.join(', ') || '(none)'}`,
    ...(o.checks.length ? [`Verification commands (you may run them): ${o.checks.join(' ; ')}`] : []),
    ...(o.open.length ? ['', 'Findings from the last cycle, said to be fixed; check each one:', ...o.open.map(f => `- ${f.id} [${f.severity}] ${f.file}${f.line_range ? `:${f.line_range[0]}` : ''}: ${f.description}`)] : []),
    '',
    o.panel ? `## Your Domain Rubric — ${r.name}\nEvaluate only against these criteria; fellow reviewers cover the rest.\n${r.criteria.map((c, i) => `${i + 1}. ${c.name}: ${c.check}`).join('\n')}` : `## Rubric — ${r.name}\n${r.criteria.map((c, i) => `${i + 1}. ${c.name}: ${c.check}`).join('\n')}`,
    '',
    'You are a reviewer. Do not modify any file.',
    REVIEWER_RULES,
  ].join('\n')
}

function fixBrief(persona: Persona, findings: Finding[], files: string[], phase: number, cycle: number): string {
  return [
    personaBrief(persona),
    '',
    `# Review fixes: phase ${phase}, cycle ${cycle}`,
    `Fix these findings, and nothing else. Files you may write: ${files.join(', ')}. Do not commit.`,
    ...findings.map(f => `\n## ${f.id} [${f.severity}] ${f.file}${f.line_range ? `:${f.line_range[0]}-${f.line_range[1]}` : ''}\nIssue: ${f.description}\n${f.why ? `Why: ${f.why}\n` : ''}${f.suggested_fix ? `Suggested fix: ${f.suggested_fix}` : ''}`),
    '',
    'If a finding is wrong for this codebase, do not change the code: say so under issues with your evidence.',
    'Reply with only: status, summary, changes, verify, issues (one line per finding you did not fix, with why).',
  ].join('\n')
}

export async function review(io: Io, agents: Agents, opts: ReviewOptions = {}): Promise<ReviewResult> {
  const log = opts.log ?? (() => {})
  const fail = (error: string): ReviewResult => ({ ok: false, error, cycles: 0, text: `Review stopped: ${error}`, open: [] })
  const p = await loadProject(io)
  if (!p.project || !p.state || !p.stateText || !p.roadmap || !p.roadmapText) return fail('no Legion project here. Run /triad:start.')
  const n = opts.phase ?? p.state.phase
  if (!n) return fail('STATE.md names no phase.')
  const note = `${p.state.phaseNote} ${p.state.status}`.toLowerCase()
  if (opts.phase === undefined) {
    if (/\(complete\)|review passed/.test(`(${p.state.phaseNote}) ${p.state.status}`.toLowerCase())) return fail(`phase ${n} already passed review.`)
    if (/planned|pending\b(?! review)/.test(p.state.phaseNote.toLowerCase()) && !/executed|partial/.test(note)) return fail(`phase ${n} is not built yet. Run /triad:build first.`)
  }
  const ph = await loadPhase(io, p, n)
  if (!Object.keys(ph.summaries).length || !ph.rel) return fail(`phase ${n} has no plan summaries. Run /triad:build first.`)
  const info = p.roadmap.phases.find(x => x.phase === n)
  const name = info?.name ?? ph.dir!.replace(/^\d+-/, '')
  const settings = p.settings
  const mode = settings.control_mode as Mode
  const prefix = settings.execution.commit_prefix
  const maxCycles = opts.maxCycles ?? settings.review?.max_cycles ?? 3
  const date = today(io)
  const files = [...new Set([
    ...ph.plans.flatMap(x => x.fm.files_modified),
    ...Object.values(ph.summaries).flatMap(s => (getSection(s, /^##\s+Files Modified/i) ?? '').split('\n').map(l => l.replace(/^\s*-\s*/, '').replace(/`/g, '').trim()).filter(l => /[./]/.test(l) && !/\s/.test(l))),
  ])].filter(f => !f.endsWith('/')).sort()
  const checks = [...new Set(ph.plans.flatMap(verificationCommands))]
  const text = `${info?.goal ?? ''} ${name} ${ph.context ?? ''} ${files.join(' ')}`
  const agentIds = ph.plans.flatMap(x => x.fm.agents)
  const panelMode = (opts.mode ?? settings.review?.default_mode ?? 'panel') === 'panel'
  const reviewers = panelMode ? composePanel(text, divisionsOf(files, agentIds)) : classicReviewers(text)
  log(`reviewers: ${reviewers.map(r => r.id).join(', ')}`)

  let state = p.stateText
  let roadmap = p.roadmapText
  const all: Finding[] = []
  const verdicts: { agent: string; verdict: string; cycle: number }[] = []
  const deferred: Finding[] = []
  const suggestions: Finding[] = []
  const hot = new Set<string>()
  const fixes: string[] = []
  const delta: string[] = []
  let lastSig: string | undefined
  let staleCount = 0
  let reviewFiles = files
  let open: Finding[] = []
  let result: ReviewResult['result']
  let cycle = 0
  for (cycle = 1; cycle <= maxCycles; cycle++) {
    const reports: ReviewerReport[] = await Promise.all(reviewers.map(async persona => {
      const brief = reviewerBrief({ persona, panel: panelMode, phase: n, name, goal: info?.goal ?? '', criteria: info?.criteria ?? [], files: reviewFiles, open, cycle, checks })
      const r = await agents.run({ persona, brief, scope: { planId: `review-${pad2(n)}`, mode: 'surgical', files_modified: [], files_forbidden: [] }, label: `review ${persona.id}` })
      const report = parseReport(persona.id, r.answer ?? '', cycle)
      // Reviewers sometimes give absolute paths; findings are keyed by the project-relative one.
      for (const f of report.findings) if (f.file.startsWith(io.root + '/')) f.file = f.file.slice(io.root.length + 1)
      return report
    }))
    for (const r of reports) verdicts.push({ agent: r.agent, verdict: r.verdict ?? (r.findings.length ? 'NEEDS WORK' : 'no verdict'), cycle })
    const t = triage(reports, all.length + 1)
    // A finding raised again keeps its id; one nobody raised again counts as fixed.
    const same = (a: Finding, b: Finding) => a.file === b.file && (!a.line_range || !b.line_range || (a.line_range[0] <= b.line_range[1] + 2 && b.line_range[0] <= a.line_range[1] + 2))
    for (const f of open) {
      const again = t.mustFix.findIndex(m => same(m, f))
      if (again < 0) { f.status = 'fixed'; f.cycle = cycle; continue }
      const m = t.mustFix[again]!
      t.actioned.splice(t.actioned.indexOf(m), 1)
      t.mustFix[again] = Object.assign(f, { severity: m.severity, description: m.description, suggested_fix: m.suggested_fix ?? f.suggested_fix, cycle })
    }
    for (const f of t.niceToHave) f.status = 'deferred' // suggestions are not required
    let next = all.length + 1
    for (const f of t.actioned) f.id = `F-${String(next++).padStart(3, '0')}`
    all.push(...t.actioned)
    deferred.push(...t.deferred)
    suggestions.push(...t.niceToHave)
    t.hotSpots.forEach(f => hot.add(f))
    delta.push(`cycle ${cycle}: ${t.mustFix.length} must-fix, ${t.niceToHave.length} suggestions, ${t.deferred.length} deferred, ${t.dropped} dropped (low confidence)`)
    log(delta[delta.length - 1])
    if (passed(reports, t)) { result = 'PASSED'; open = []; break }
    open = t.mustFix
    const sig = signature(open)
    if (cycle > 1 && sig === lastSig) staleCount++
    else staleCount = 0
    lastSig = sig
    if (staleCount >= 1 && cycle > 2) { result = 'STALE LOOP ABORTED'; break }
    if (cycle === maxCycles) { result = 'ESCALATED'; break }
    const silent = reports.filter(r => !reviewed(r))
    if (silent.length) {
      // No report from a reviewer: ask again next cycle; out of cycles, escalate.
      delta.push(`cycle ${cycle}: no report from ${silent.map(r => r.agent).join(', ')}`)
      log(delta[delta.length - 1])
      if (!open.length) continue
    }
    if (!open.length) { result = 'PASSED'; break } // FAIL/NEEDS WORK verdicts without actionable findings

    // Fix: one agent per routed persona, its files disjoint from the others'.
    const byAgent = new Map<string, Finding[]>()
    for (const f of open) byAgent.set(fixAgentFor(f.file), [...(byAgent.get(fixAgentFor(f.file)) ?? []), f])
    const before = await dirtyFiles(io)
    const runs = await Promise.all([...byAgent.entries()].map(async ([id, fs]) => {
      const persona = BY_ID.get(id) ?? BY_ID.get('engineering-senior-developer')!
      const own = [...new Set(fs.map(f => f.file))]
      // tests that cover the files may need changing too
      const may = [...own, ...files.filter(f => /(^|\/)tests?\/|test_|\.test\.|\.spec\./.test(f) && !own.includes(f))]
      const r = await agents.run({ persona, brief: fixBrief(persona, fs, may, n, cycle), scope: { planId: `review-${pad2(n)}-fix`, mode: mode === 'autonomous' ? 'autonomous' : 'guarded', files_modified: may, files_forbidden: [] }, label: `fix ${id} cycle ${cycle}` })
      return { id, fs, r }
    }))
    const verify = await runVerification(io, checks)
    const after = await dirtyFiles(io)
    const changed = [...after].filter(f => !before.has(f) && !f.startsWith('.triad/') && !f.startsWith('.planning/'))
    const notFixed = runs.flatMap(r => (parseReply(r.r.answer ?? '').status === 'done' ? [] : r.fs.map(f => f.id)))
    fixes.push(`cycle ${cycle}: ${runs.map(r => `${r.id} on ${r.fs.map(f => f.id).join(', ')} (${parseReply(r.r.answer ?? '').status ?? 'no answer'})`).join('; ')}; checks ${verify.filter(v => v.passed).length}/${verify.length} passed`)
    reviewFiles = [...new Set([...changed, ...open.map(f => f.file)])].filter(f => files.some(x => overlaps(f, x)) || changed.includes(f))
    state = updateState(state, { status: `Phase ${n} under review — cycle ${cycle}/${maxCycles}, ${open.filter(f => f.severity === 'blocker').length} blocker(s) remaining`, lastActivity: `Phase ${n} review cycle ${cycle} (${date})` })
    await io.write('.planning/STATE.md', state)
    if (changed.length && settings.execution.auto_commit !== false) {
      await io.run(['git', 'add', '-A', '--', ...changed, '.planning/STATE.md'])
      await io.run(['git', 'commit', '-q', '-m', `fix(${prefix}): review cycle ${cycle} fixes for phase ${n}\n\nPhase ${n}: ${name}\nFixed ${open.length - notFixed.length} issues: ${open.filter(f => !notFixed.includes(f.id)).map(f => f.id).join(', ') || 'none'}\nUnresolved: ${notFixed.join(', ') || 'none'}`])
    }
  }

  const findings = [...all]
  const doc = renderReview({ phase: n, name, result: result!, cycles: Math.min(cycle, maxCycles), reviewers: reviewers.map(r => r.id), date, findings, deferred, suggestions, verdicts, hotSpots: [...hot], cycleDelta: delta, fixes })
  await io.write(`${ph.rel}/${pad2(n)}-REVIEW.md`, doc)
  const total = p.state.total ?? p.roadmap.rows.length
  const phases = phaseNumbers(p.roadmap)
  const after = phases.find(x => x > n)
  if (result === 'PASSED') {
    state = updateState(state, {
      phase: `${n} of ${total} (complete)`,
      status: `Phase ${n} complete — review passed (${Math.min(cycle, maxCycles)} cycle(s))`,
      lastActivity: `Phase ${n} review (${date})`,
      nextAction: after !== undefined ? `Run \`/triad:plan ${after}\` to plan Phase ${after}: ${p.roadmap.phases.find(x => x.phase === after)?.name ?? ''}` : 'All phases complete — project review finished!',
    })
    roadmap = checkPhase(setRoadmapRow(roadmap, n, { status: 'Complete' }), n)
  } else {
    const blockers = open.filter(f => f.severity === 'blocker' || f.severity === 'critical').length
    state = updateState(state, {
      status: result === 'STALE LOOP ABORTED' ? `Phase ${n} review stale — the same ${open.length} finding(s) after ${cycle} cycles` : `Phase ${n} review escalated — ${open.length} unresolved finding(s) (${blockers} blocker/critical) after ${maxCycles} cycles`,
      lastActivity: `Phase ${n} review (${date})`,
      nextAction: `Fix the unresolved findings in ${pad2(n)}-REVIEW.md, accept the phase as is, or re-plan; then run \`/triad:review --phase ${n}\``,
    })
  }
  await io.write('.planning/STATE.md', state)
  await io.write('.planning/ROADMAP.md', roadmap)
  // Memory: an outcome per reviewer; a pattern on a first-cycle pass; the verdict as a preference signal.
  const memo: string[] = []
  try {
    const cycles = Math.min(cycle, maxCycles)
    const blockerCount = findings.filter(f => f.severity === 'blocker' || f.severity === 'critical').length
    for (const r of reviewers) {
      const rec = await storeOutcome(io, settings, {
        phase: n, plan: `${pad2(n)}-00`, agent: r.id, task_type: 'quality-review', tags: ['review', r.division.toLowerCase()],
        outcome: result === 'PASSED' ? 'success' : 'partial', cycles, escalated: result !== 'PASSED', blockers: blockerCount,
        summary: `Phase ${n} review ${result} in ${cycles} cycle(s), ${findings.length} finding(s)`,
      })
      if (rec) memo.push(OUTCOMES)
    }
    if (result === 'PASSED' && cycles === 1 && await storeKnowledge(io, settings, 'pattern', [`Phase ${n} (${name}) passed review in one cycle`, `plans by ${[...new Set(ph.plans.map(x => x.fm.agents[0]).filter(Boolean))].join(', ')}`, 'similar phase scope and plan shape', `${pad2(n)}-REVIEW.md`, 'review, first-pass']))
      memo.push('.planning/memory/PATTERNS.md')
    if (result === 'PASSED' && await storeKnowledge(io, settings, 'preference', ['review-verdict', `Phase ${n} review`, 'PASS', 'accepted', 'positive', 'system', 'review']))
      memo.push('.planning/memory/PREFERENCES.md')
  } catch { /* memory never blocks the review */ }
  let ghNote: string | undefined
  if (result === 'PASSED' && settings.integrations?.github === 'enabled') {
    ghNote = await ghClosePhase(io, n, { plans: ph.plans.length, requirements: [...new Set(ph.plans.flatMap(x => x.fm.requirements ?? []))].join(', '), result: 'pass' }).catch(() => undefined)
  }
  if (settings.execution.auto_commit !== false) {
    await io.run(['git', 'add', '-A', '--', '.planning/STATE.md', '.planning/ROADMAP.md', `${ph.rel}/${pad2(n)}-REVIEW.md`, ...new Set(memo)])
    await io.run(['git', 'commit', '-q', '-m', result === 'PASSED' ? `chore(${prefix}): phase ${n} review passed — ${name}` : `chore(${prefix}): phase ${n} review ${result === 'ESCALATED' ? 'escalated' : 'stale'} — ${name}`])
  }
  const summary = [
    `Phase ${n}: ${name} — review ${result}`,
    `Reviewers: ${reviewers.map(r => r.id).join(', ')}`,
    ...delta,
    ...(open.length ? ['Unresolved:', ...open.map(f => `- ${f.id} [${f.severity}] ${f.file}: ${f.description}`)] : []),
    `Report: ${ph.rel}/${pad2(n)}-REVIEW.md`,
    ...(ghNote ? [`GitHub: ${ghNote}`] : []),
  ].join('\n')
  return { ok: result === 'PASSED', result, cycles: Math.min(cycle, maxCycles), text: summary, open }
}

export { MUST_FIX }
