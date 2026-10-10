// The review loop (review-loop, review-panel) in mod code: reviewers in
// parallel, triage in code, fix agents routed by file, scoped re-review, cycle
// cap, stale-loop abort, REVIEW.md, STATE/ROADMAP, commits.
import { ghClosePhase } from './github.ts'
import { OUTCOMES, storeKnowledge, storeOutcome } from './memory.ts'
import { loadPhase, loadProject, today, type Io } from './io.ts'
import { checkPhase, getSection, isLight, overlaps, pad2, setRoadmapRow, updateState, verificationCommands } from './planning.ts'
import { BY_ID, classicReviewers, composePanel, divisionsOf, fixAgentFor, personaBrief, rubricOf } from './registry.ts'
import type { Persona } from './personas.ts'
import { REVIEWER_RULES, parseReport, passed, reviewed, renderReview, signature, triage, MUST_FIX, type Finding, type ReviewerReport } from './review.ts'
import { runVerification, dirtyFiles, type Agents } from './build.ts'
import { parseReply } from '../policy.ts'
import { phaseNumbers } from './status.ts'
import type { Mode } from './settings.ts'
import { filterReview } from './authority.ts'
import { evaluatorBrief, evaluatorPersona, evaluatorsFor } from './evaluators.ts'
import { coverageChecks, coverageFindings, readCoverage, renderCoverage } from './coverage.ts'
import { findingErrors, intentFilter } from './review.ts'
import { loadIntentConfig, resolveTeam } from './intents.ts'

export type ReviewOptions = { phase?: number; mode?: 'panel' | 'classic'; maxCycles?: number; log?: (s: string) => void; intent?: string; lightPlans?: number; fixMinor?: boolean }
// A reply's issues: lines (the findings a fix agent did not fix, with why).
function issuesOf(answer: string): string[] {
  const lines = answer.replace(/```[a-z]*\n?/gi, '').split('\n')
  const i = lines.findIndex(l => /^\s*issues:/i.test(l))
  if (i < 0) return []
  const out = [lines[i]!.replace(/^\s*issues:\s*/i, '').trim()]
  for (let j = i + 1; j < lines.length && !/^\s*[a-z_]+:/i.test(lines[j]!); j++) out.push(lines[j]!.trim().replace(/^-\s*/, ''))
  return out.filter(l => l && !/^none\.?$/i.test(l)).map(l => l.replace(/\|/g, '/'))
}

// The most minor findings one fixMinor round takes on.
const MINOR_CAP = 8
// The most late findings a closing round takes on (see the cycle cap below).
const CLOSING_CAP = 3

export type ReviewResult = { ok: boolean; result?: 'PASSED' | 'ESCALATED' | 'STALE LOOP ABORTED'; error?: string; cycles: number; text: string; open: Finding[] }

function reviewerBrief(o: { persona: Persona; panel: boolean; phase: number; name: string; goal: string; criteria: string[]; files: string[]; open: Finding[]; cycle: number; checks: string[]; closing?: boolean }): string {
  const r = rubricOf(o.persona)
  const list = o.open.map(f => `- ${f.id} [${f.severity}] ${f.file}${f.line_range ? `:${f.line_range[0]}` : ''}: ${f.description}`)
  if (o.closing) return [
    personaBrief(o.persona),
    '',
    `# Closing check: Phase ${o.phase}: ${o.name} (cycle ${o.cycle})`,
    `Files: ${o.files.join(', ') || '(none)'}`,
    ...(o.checks.length ? [`Verification commands (you may run them): ${o.checks.join(' ; ')}`] : []),
    '',
    'Every earlier finding is resolved. These last findings were just fixed; check only these. Report one again if it is not fixed, and raise nothing new.',
    ...list,
    '',
    'You are a reviewer. Do not modify any file.',
    REVIEWER_RULES,
  ].join('\n')
  return [
    personaBrief(o.persona),
    '',
    `# Review: Phase ${o.phase}: ${o.name} (cycle ${o.cycle})`,
    `Goal: ${o.goal || '(see CONTEXT.md)'}`,
    ...(o.criteria.length ? ['Success criteria:', ...o.criteria.map(c => `- ${c}`)] : []),
    '',
    `Files to review: ${o.files.join(', ') || '(none)'}`,
    ...(o.checks.length ? [`Verification commands (you may run them): ${o.checks.join(' ; ')}`] : []),
    ...(o.open.length ? ['', 'Findings from the last cycle, said to be fixed; check each one:', ...list] : []),
    '',
    o.panel ? `## Your Domain Rubric — ${r.name}\nEvaluate only against these criteria; fellow reviewers cover the rest.\n${r.criteria.map((c, i) => `${i + 1}. ${c.name}: ${c.check}`).join('\n')}` : `## Rubric — ${r.name}\n${r.criteria.map((c, i) => `${i + 1}. ${c.name}: ${c.check}`).join('\n')}`,
    '',
    'You are a reviewer. Do not modify any file.',
    REVIEWER_RULES,
  ].join('\n')
}

function fixBrief(persona: Persona, findings: Finding[], files: string[], phase: number, cycle: number | 'minor'): string {
  return [
    personaBrief(persona),
    '',
    cycle === 'minor' ? `# Minor review findings: phase ${phase}` : `# Review fixes: phase ${phase}, cycle ${cycle}`,
    cycle === 'minor'
      ? `The review passed; these are its minor and medium-confidence findings. Fix the ones that are clear and small, and nothing else. Skip any that needs a design decision or a large change. Files you may write: ${files.join(', ')}. Do not commit.`
      : `Fix these findings, and nothing else. Files you may write: ${files.join(', ')}. Do not commit.`,
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
  // Light process (a small phase, no review mode asked for): two reviewers, no
  // multi-pass evaluators, at most two cycles.
  const light = !opts.mode && !opts.intent && isLight(ph.plans.length, opts.lightPlans ?? 0)
  const maxCycles = Math.min(opts.maxCycles ?? settings.review?.max_cycles ?? 3, light ? 2 : Infinity)
  const date = today(io)
  const files = [...new Set([
    ...ph.plans.flatMap(x => x.fm.files_modified),
    ...Object.values(ph.summaries).flatMap(s => (getSection(s, /^##\s+Files Modified/i) ?? '').split('\n').map(l => l.replace(/^\s*-\s*/, '').replace(/`/g, '').trim()).filter(l => /[./]/.test(l) && !/\s/.test(l))),
  ])].filter(f => !f.endsWith('/')).sort()
  const checks = [...new Set(ph.plans.flatMap(verificationCommands))]
  const text = `${info?.goal ?? ''} ${name} ${ph.context ?? ''} ${files.join(' ')}`
  const agentIds = ph.plans.flatMap(x => x.fm.agents)
  const panelMode = (opts.mode ?? settings.review?.default_mode ?? 'panel') === 'panel'
  let reviewers = light ? classicReviewers(text).slice(0, 2) : panelMode ? composePanel(text, divisionsOf(files, agentIds)) : classicReviewers(text)
  if (light) log(`light process: ${ph.plans.length} plans (lightPlans ${opts.lightPlans})`)

  // Intent review (--just-security and the other filter_review intents): the
  // intent's team replaces the panel and its domains filter the findings.
  let intentDomains: string[] | undefined
  if (opts.intent) {
    const team = resolveTeam((await loadIntentConfig(io)).config, opts.intent)
    if (!team) return fail(`unknown intent ${opts.intent}.`)
    const members = [...team.agents.primary, ...team.agents.secondary].map(id => BY_ID.get(id)).filter((x): x is Persona => !!x)
    if (members.length) reviewers = members
    intentDomains = team.domains
  }
  log(`reviewers: ${reviewers.map(r => r.id).join(', ')}`)

  // Multi-pass evaluators (review.evaluator_depth) and coverage thresholds.
  const evaluators = !opts.intent && !light && (settings.review?.evaluator_depth ?? 'multi-pass') === 'multi-pass' ? evaluatorsFor(files) : []
  if (evaluators.length) log(`evaluators: ${evaluators.map(e => e.type).join(', ')}`)
  const coverage = opts.intent ? undefined : await readCoverage(io)
  const covChecks = coverage ? coverageChecks(coverage, settings.review?.coverage_thresholds) : []
  const fixesLog: string[] = []

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
  // The cycle cap, and one closing round past it: when the last cycle finds
  // only a few new non-critical findings and every earlier one is resolved,
  // they get one fix round and a re-check of just those findings.
  let limit = maxCycles
  let closing = false
  for (cycle = 1; cycle <= limit; cycle++) {
    const asked = closing ? reviewers.filter(r => open.some(f => f.agent === r.id)) : reviewers
    const reports: ReviewerReport[] = await Promise.all(asked.map(async persona => {
      const brief = reviewerBrief({ persona, panel: panelMode && !light, phase: n, name, goal: info?.goal ?? '', criteria: info?.criteria ?? [], files: reviewFiles, open, cycle, checks, closing })
      const r = await agents.run({ persona, brief, scope: { planId: `review-${pad2(n)}`, mode: 'surgical', files_modified: [], files_forbidden: [], active: reviewers.map(x => x.id) }, label: `review ${persona.id}` })
      const report = parseReport(persona.id, r.answer ?? '', cycle)
      // Reviewers sometimes give absolute paths; findings are keyed by the project-relative one.
      for (const f of report.findings) if (f.file.startsWith(io.root + '/')) f.file = f.file.slice(io.root.length + 1)
      return report
    }))
    delta.push(...await filterReview(io, reports, reviewers.map(r => r.id), cycle))

    // Evaluators: all on cycle 1, then only those with findings still open.
    // One that returns neither verdict nor finding is left out, not counted silent.
    const evalNow = evaluators.filter(e => cycle === 1 || open.some(f => f.agent === `evaluator:${e.type}`))
    const evalReports = await Promise.all(evalNow.map(async e => {
      const persona = evaluatorPersona(e)
      const brief = evaluatorBrief(e, { phase: n, name, goal: info?.goal ?? '', criteria: info?.criteria ?? [], files: reviewFiles }) +
        (cycle > 1 ? `\n\nFindings from the last cycle, said to be fixed; check each one:\n${open.filter(f => f.agent === `evaluator:${e.type}`).map(f => `- ${f.id} [${f.severity}] ${f.file}: ${f.description}`).join('\n')}` : '')
      const r = await agents.run({ persona, brief, scope: { planId: `review-${pad2(n)}`, mode: 'surgical', files_modified: [], files_forbidden: [] }, label: `evaluate ${e.type}` })
      const report = parseReport(`evaluator:${e.type}`, r.answer ?? '', cycle)
      for (const f of report.findings) if (f.file.startsWith(io.root + '/')) f.file = f.file.slice(io.root.length + 1)
      return report
    }))
    reports.push(...evalReports.filter(reviewed))
    if (cycle === 1 && coverage) {
      const cf = coverageFindings(coverage, covChecks, cycle)
      if (cf.length) reports.push({ agent: 'coverage', verdict: undefined, findings: cf })
    }
    if (opts.intent) for (const r of reports) {
      const had = r.findings.length
      r.findings = intentFilter(r.findings, opts.intent, intentDomains)
      if (had && !r.findings.length && !r.verdict) r.verdict = 'PASS' // only out-of-intent findings
    }
    for (const r of reports.filter(r => r.agent !== 'coverage')) verdicts.push({ agent: r.agent, verdict: r.verdict ?? (r.findings.length ? 'NEEDS WORK' : 'no verdict'), cycle })
    const t = triage(reports, all.length + 1)
    // A finding raised again keeps its id; one nobody raised again counts as fixed.
    const same = (a: Finding, b: Finding) => a.file === b.file && (!a.line_range || !b.line_range || (a.line_range[0] <= b.line_range[1] + 2 && b.line_range[0] <= a.line_range[1] + 2))
    let resolvedNow = 0, unchanged = 0
    for (const f of open) {
      const again = t.mustFix.findIndex(m => same(m, f))
      if (again < 0) { f.status = 'fixed'; f.cycle = cycle; resolvedNow++; continue }
      unchanged++
      const m = t.mustFix[again]!
      t.actioned.splice(t.actioned.indexOf(m), 1)
      t.mustFix[again] = Object.assign(f, { severity: m.severity, description: m.description, suggested_fix: m.suggested_fix ?? f.suggested_fix, cycle })
    }
    // A closing round re-checks the findings it fixed; anything new is recorded as deferred.
    if (closing) {
      const late = t.mustFix.filter(m => !open.includes(m))
      t.mustFix = t.mustFix.filter(m => open.includes(m))
      t.actioned = t.actioned.filter(m => !late.includes(m))
      t.deferred.push(...late.map(f => ({ ...f, status: 'deferred' as const })))
    }
    for (const f of t.niceToHave) f.status = 'deferred' // suggestions are not required
    let next = all.length + 1
    for (const f of t.actioned) f.id = `F-${String(next++).padStart(3, '0')}`
    all.push(...t.actioned)
    deferred.push(...t.deferred)
    suggestions.push(...t.niceToHave)
    t.hotSpots.forEach(f => hot.add(f))
    // Cycle Delta (review-loop): what the last fix round resolved, what is new, what is unchanged.
    const breakdown = cycle > 1 ? ` (resolved ${resolvedNow}, new ${t.mustFix.length - unchanged}, unchanged ${unchanged})` : ''
    delta.push(`cycle ${cycle}: ${t.mustFix.length} must-fix${breakdown}, ${t.niceToHave.length} suggestions, ${t.deferred.length} deferred, ${t.dropped} dropped (low confidence)`)
    log(delta[delta.length - 1]!)
    if (closing ? !t.mustFix.length && reports.length > 0 && reports.every(reviewed) : passed(reports, t)) { result = 'PASSED'; open = []; break }
    open = t.mustFix
    const sig = signature(open)
    if (cycle > 1 && sig === lastSig) staleCount++
    else staleCount = 0
    lastSig = sig
    if (staleCount >= 1 && cycle > 2 && !closing) { result = 'STALE LOOP ABORTED'; break }
    if (cycle === limit) {
      const severe = open.some(f => f.severity === 'blocker' || f.severity === 'critical')
      if (closing || cycle === 1 || unchanged > 0 || severe || open.length > CLOSING_CAP) { result = 'ESCALATED'; break }
      closing = true
      limit++
      delta.push(`cycle ${cycle}: every earlier finding resolved; closing round for ${open.length} new finding(s): one fix round, then a check of those only`)
      log(delta[delta.length - 1]!)
    }
    const silent = reports.filter(r => !reviewed(r))
    if (silent.length) {
      // No report from a reviewer: ask again next cycle; out of cycles, escalate.
      delta.push(`cycle ${cycle}: no report from ${silent.map(r => r.agent).join(', ')}`)
      log(delta[delta.length - 1]!)
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
    const verify = await runVerification(io, checks, undefined, `review phase ${n} checks`)
    const after = await dirtyFiles(io)
    const changed = [...after].filter(f => !before.has(f) && !f.startsWith('.triad/') && !f.startsWith('.planning/'))
    const notFixed = runs.flatMap(r => (parseReply(r.r.answer ?? '').status === 'done' ? [] : r.fs.map(f => f.id)))
    fixes.push(`cycle ${cycle}: ${runs.map(r => `${r.id} on ${r.fs.map(f => f.id).join(', ')} (${parseReply(r.r.answer ?? '').status ?? 'no answer'})`).join('; ')}; checks ${verify.filter(v => v.passed).length}/${verify.length} passed`)

    // FIXES.md in the phase directory: what each fix agent was given and did.
    fixesLog.push(`## Cycle ${cycle}`, '', `**Date**: ${date}`, `**Checks**: ${verify.filter(v => v.passed).length}/${verify.length} passed`, `**Files changed**: ${changed.map(f => `\`${f}\``).join(', ') || 'none'}`, '',
      '| Finding | Severity | File | Agent | Status | Notes |', '|---------|----------|------|-------|--------|-------|',
      ...runs.flatMap(r => {
        const reply = parseReply(r.r.answer ?? '')
        return r.fs.map(f => `| ${f.id} | ${f.severity} | \`${f.file}\` | ${r.id} | ${notFixed.includes(f.id) ? 'not fixed' : 'fix applied'} | ${(notFixed.includes(f.id) ? reply.blockedReason ?? reply.status ?? 'no answer' : reply.summary.join(' ')).replace(/\|/g, '/').replace(/\n/g, ' ')} |`)
      }), '')
    await io.write(`${ph.rel}/FIXES.md`, [`# Phase ${n}: ${name} — Review Fixes`, '', 'Fixes applied by the review loop, one section per cycle. Re-review decides whether each one holds.', '', ...fixesLog].join('\n'))
    reviewFiles = [...new Set([...changed, ...open.map(f => f.file)])].filter(f => files.some(x => overlaps(f, x)) || changed.includes(f))
    state = updateState(state, { status: `Phase ${n} under review — cycle ${cycle}/${limit}, ${open.filter(f => f.severity === 'blocker').length} blocker(s) remaining`, lastActivity: `Phase ${n} review cycle ${cycle} (${date})` })
    await io.write('.planning/STATE.md', state)
    if (changed.length && settings.execution.auto_commit !== false) {
      await io.run(['git', 'add', '-A', '--', ...changed, '.planning/STATE.md'])
      await io.run(['git', 'commit', '-q', '-m', `fix(${prefix}): review cycle ${cycle} fixes for phase ${n}\n\nPhase ${n}: ${name}\nFixed ${open.length - notFixed.length} issues: ${open.filter(f => !notFixed.includes(f.id)).map(f => f.id).join(', ') || 'none'}\nUnresolved: ${notFixed.join(', ') || 'none'}`])
    }
  }

  // Minor findings (fixMinor): after a pass, one fix round for the suggestions
  // and medium-confidence findings that name a file. The checks run again and
  // the round is undone if any fails, so a pass never turns into a break.
  let minorNote: string | undefined
  const minor = [...new Map([...suggestions, ...deferred].filter(f => f.file && files.some(x => overlaps(f.file, x))).map(f => [`${f.file}\n${f.description}`, f])).values()].slice(0, MINOR_CAP)
  if (result === 'PASSED' && opts.fixMinor && minor.length) {
    if (!checks.length) minorNote = `minor findings: ${minor.length} left (no verification commands to check a fix against)`
    else {
      const byAgent = new Map<string, Finding[]>()
      for (const f of minor) byAgent.set(fixAgentFor(f.file), [...(byAgent.get(fixAgentFor(f.file)) ?? []), f])
      const before = await dirtyFiles(io)
      const runs = await Promise.all([...byAgent.entries()].map(async ([id, fs]) => {
        const persona = BY_ID.get(id) ?? BY_ID.get('engineering-senior-developer')!
        const own = [...new Set(fs.map(f => f.file))]
        const may = [...own, ...files.filter(f => /(^|\/)tests?\/|test_|\.test\.|\.spec\./.test(f) && !own.includes(f))]
        const r = await agents.run({ persona, brief: fixBrief(persona, fs, may, n, 'minor'), scope: { planId: `review-${pad2(n)}-minor`, mode: mode === 'autonomous' ? 'autonomous' : 'guarded', files_modified: may, files_forbidden: [] }, label: `minor fixes ${id}` })
        return { id, fs, r }
      }))
      const changed = [...await dirtyFiles(io)].filter(f => !before.has(f) && !f.startsWith('.triad/') && !f.startsWith('.planning/'))
      const verify = changed.length ? await runVerification(io, checks, undefined, `review phase ${n} minor-fix checks`) : []
      const okNow = verify.every(v => v.passed)
      if (changed.length && !okNow) {
        await io.run(['git', 'checkout', '--', ...changed])
        await io.run(['git', 'clean', '-fdq', '--', ...changed])
      }
      const applied = changed.length && okNow
      // What a fix agent chose to leave, from its reply's issues: list.
      const kept = runs.flatMap(r => issuesOf(r.r.answer ?? ''))
      minorNote = `minor findings: ${runs.map(r => `${r.id} on ${r.fs.map(f => f.id).join(', ')} (${parseReply(r.r.answer ?? '').status ?? 'no answer'})`).join('; ')}; ` +
        (kept.length ? `left as is: ${kept.join(' / ')}; ` : '') +
        (!changed.length ? 'no changes' : applied ? `checks ${verify.length}/${verify.length} passed, ${changed.length} file(s) changed` : `checks failed (${verify.filter(v => !v.passed).length}/${verify.length}), changes undone`)
      fixes.push(minorNote)
      if (applied && settings.execution.auto_commit !== false) {
        await io.run(['git', 'add', '-A', '--', ...changed])
        await io.run(['git', 'commit', '-q', '-m', `refactor(${prefix}): minor review fixes for phase ${n}\n\nPhase ${n}: ${name}\nFindings addressed: ${minor.map(f => f.id).join(', ')}`])
      }
    }
    log(minorNote)
  }

  const findings = [...all]
  // Schema check of every recorded finding; invalid ones are flagged in the report, never dropped.
  const invalid = [...all, ...deferred].map(f => ({ id: f.id, errors: findingErrors(f) })).filter(x => x.errors.length)
  if (invalid.length) log(`invalid findings: ${invalid.map(i => i.id).join(', ')}`)
  const doc = renderReview({ phase: n, name, result: result!, cycles: Math.min(cycle, limit), reviewers: reviewers.map(r => r.id), date, findings, deferred, suggestions, verdicts, hotSpots: [...hot], cycleDelta: delta, fixes,
    coverage: opts.intent ? undefined : renderCoverage(coverage, covChecks), invalid, evaluators: evaluators.map(e => e.type), intent: opts.intent })
  await io.write(`${ph.rel}/${pad2(n)}-REVIEW.md`, doc)
  const total = p.state.total ?? p.roadmap.rows.length
  const phases = phaseNumbers(p.roadmap)
  const after = phases.find(x => x > n)
  if (result === 'PASSED') {
    state = updateState(state, {
      phase: `${n} of ${total} (complete)`,
      status: `Phase ${n} complete — review passed (${Math.min(cycle, limit)} cycle(s))`,
      lastActivity: `Phase ${n} review (${date})`,
      nextAction: after !== undefined ? `Run \`/triad:plan ${after}\` to plan Phase ${after}: ${p.roadmap.phases.find(x => x.phase === after)?.name ?? ''}` : 'All phases complete — project review finished!',
    })
    roadmap = checkPhase(setRoadmapRow(roadmap, n, { status: 'Complete' }), n)
  } else {
    const blockers = open.filter(f => f.severity === 'blocker' || f.severity === 'critical').length
    state = updateState(state, {
      status: result === 'STALE LOOP ABORTED' ? `Phase ${n} review stale — the same ${open.length} finding(s) after ${cycle} cycles` : `Phase ${n} review escalated — ${open.length} unresolved finding(s) (${blockers} blocker/critical) after ${Math.min(cycle, limit)} cycles`,
      lastActivity: `Phase ${n} review (${date})`,
      nextAction: `Fix the unresolved findings in ${pad2(n)}-REVIEW.md, accept the phase as is, or re-plan; then run \`/triad:review --phase ${n}\``,
    })
  }
  await io.write('.planning/STATE.md', state)
  await io.write('.planning/ROADMAP.md', roadmap)
  // Memory: an outcome per reviewer; a pattern on a first-cycle pass; the verdict as a preference signal.
  const memo: string[] = []
  try {
    const cycles = Math.min(cycle, limit)
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
    await io.run(['git', 'add', '-A', '--', '.planning/STATE.md', '.planning/ROADMAP.md', `${ph.rel}/${pad2(n)}-REVIEW.md`, ...(fixesLog.length ? [`${ph.rel}/FIXES.md`] : []), ...new Set(memo)])
    await io.run(['git', 'commit', '-q', '-m', result === 'PASSED' ? `chore(${prefix}): phase ${n} review passed — ${name}` : `chore(${prefix}): phase ${n} review ${result === 'ESCALATED' ? 'escalated' : 'stale'} — ${name}`])
  }
  const summary = [
    `Phase ${n}: ${name} — review ${result}`,
    `Reviewers: ${reviewers.map(r => r.id).join(', ')}`,
    ...delta,
    ...(minorNote ? [minorNote] : []),
    ...(open.length ? ['Unresolved:', ...open.map(f => `- ${f.id} [${f.severity}] ${f.file}: ${f.description}`)] : []),
    ...(evaluators.length ? [`Evaluators: ${evaluators.map(e => e.type).join(', ')}`] : []),
    ...(invalid.length ? [`Invalid findings (schema): ${invalid.map(i => i.id).join(', ')} — see ## Invalid Findings`] : []),
    `Report: ${ph.rel}/${pad2(n)}-REVIEW.md`,
    ...(ghNote ? [`GitHub: ${ghNote}`] : []),
  ].join('\n')
  return { ok: result === 'PASSED', result, cycles: Math.min(cycle, limit), text: summary, open }
}

export { MUST_FIX }
