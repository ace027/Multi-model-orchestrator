// Board of directors (board-of-directors skill): composition by registry
// scoring with the diversity rule, Phase 1 assessments in parallel, discussion
// rounds, a binding APPROVE/REJECT vote, the resolution formula in code, and
// the artifacts under .planning/board/. Members are read-only.
import { loadProject, today, type Io } from './io.ts'
import { BY_ID, findPersona, rank } from './registry.ts'
import { runPersonas, type PersonaRunResult } from './personarun.ts'
import { commit, type Agents } from './build.ts'
import { storeOutcome } from './memory.ts'
import { slugify } from './planning.ts'
import type { Persona } from './personas.ts'

export type BoardSettings = { default_size: number; min_size: number; discussion_rounds: number; assessment_timeout_ms: number; persist_artifacts: boolean }
const DEFAULTS: BoardSettings = { default_size: 5, min_size: 3, discussion_rounds: 2, assessment_timeout_ms: 300000, persist_artifacts: true }
export const boardSettings = (s: any): BoardSettings => ({ ...DEFAULTS, ...(s?.board ?? {}) })

export type Verdict = 'APPROVED' | 'APPROVED WITH CONDITIONS' | 'REJECTED' | 'ESCALATED'

// Section 5: first match wins; N excludes abstentions.
export function resolveVotes(approve: number, n: number): Verdict {
  if (n <= 0) return 'ESCALATED'
  if (approve >= Math.ceil((2 * n) / 3)) return 'APPROVED'
  if (approve > Math.floor(n / 2)) return 'APPROVED WITH CONDITIONS'
  if (n % 2 === 0 && approve === n / 2) return 'ESCALATED'
  return 'REJECTED'
}

export type Member = { id: string; name: string; division: string; lenses: string[]; score: number }

// Top N by registry score, at most 2 per division (Section 1, step 3).
export function compose(topic: string, size: number): Member[] {
  const out: Member[] = []
  const per = new Map<string, number>()
  for (const { persona, score } of rank(topic)) {
    if (out.length >= size) break
    if (score <= 0) break
    if ((per.get(persona.division) ?? 0) >= 2) continue
    per.set(persona.division, (per.get(persona.division) ?? 0) + 1)
    out.push({ id: persona.id, name: persona.name, division: persona.division, lenses: persona.review_strengths.slice(0, 4), score })
  }
  return out
}

export function boardCompose(topic: string, settings: any): string {
  const b = boardSettings(settings)
  const m = compose(topic, b.default_size)
  const lines = [`Board slate for "${topic}" (${m.length} of ${b.default_size}; minimum ${b.min_size}):`, '', '| # | Agent | Division | Evaluation lenses |', '|---|-------|----------|-------------------|',
    ...m.map((x, i) => `| ${i + 1} | ${x.id} | ${x.division} | ${x.lenses.join(', ') || 'general'} |`)]
  if (m.length < b.min_size) lines.push('', `Only ${m.length} agents scored above zero for topic '${topic}'. Minimum board size is ${b.min_size}.${m.length >= 2 ? ' A board of 2 needs the user\'s explicit opt-in (min_size: 2).' : ' The board cannot be convened; rephrase the topic or name members.'}`)
  return lines.join('\n')
}

type Assessment = { member: Member; verdict?: 'APPROVE' | 'CONCERNS' | 'REJECT'; score?: number; concerns: string[]; recommendations: string[]; redFlags: string[]; text: string; error?: string }
type Vote = { member: Member; verdict: 'APPROVE' | 'REJECT' | 'ABSTAIN'; confidence?: number; conditions: string; text: string }

const section = (text: string, name: string) => {
  const m = text.match(new RegExp(`###\\s*${name}:?\\s*([\\s\\S]*?)(?=\\n###\\s|$)`, 'i'))
  const body = (m?.[1] ?? '').trim()
  if (!body || /^none\b/i.test(body)) return []
  return body.split('\n').map(l => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean)
}

export function parseAssessment(member: Member, r: PersonaRunResult): Assessment {
  const text = (r.answer ?? '').trim()
  const verdict = text.match(/###\s*Verdict:\s*\**\s*(APPROVE|CONCERNS|REJECT)/i)?.[1]?.toUpperCase() as Assessment['verdict']
  const score = Number(text.match(/###\s*Score:\s*(\d+(?:\.\d+)?)/i)?.[1]) || undefined
  return { member, verdict, score, concerns: section(text, 'Concerns'), recommendations: section(text, 'Recommendations'), redFlags: section(text, 'Red Flags'), text, error: r.error ?? (text ? undefined : 'no answer') }
}

export function parseVote(member: Member, text: string): Vote | undefined {
  const v = text.match(/Verdict:\s*\**\s*(APPROVE|REJECT)\b/i)?.[1]?.toUpperCase() as 'APPROVE' | 'REJECT' | undefined
  if (!v) return undefined
  const c = Number(text.match(/Confidence:\s*([01](?:\.\d+)?)/i)?.[1])
  const cond = text.match(/Conditions:\s*([\s\S]*?)(?=\n\s*-\s*\w+:|\n###|$)/i)?.[1]?.trim() ?? 'None'
  return { member, verdict: v, confidence: Number.isFinite(c) && c >= 0 && c <= 1 ? c : undefined, conditions: cond || 'None', text: text.trim() }
}

const assessBrief = (topic: string, context: string, m: Member, mode: string) => [
  '# Board of Directors — Independent Assessment', '',
  `You are serving on a Board of Directors (${mode}). Assess the proposal independently — do not assume other members agree or disagree with you.`, '',
  `## Topic\n${topic}`, '', `## Proposal Context\n${context || '(see .planning/PROJECT.md and STATE.md)'}`, '',
  '## Your Evaluation Lenses', ...(m.lenses.length ? m.lenses : ['overall soundness']).map(l => `- ${l}: score 1-10 with analysis`), '',
  '## Assessment Output Format (exactly)', `## Assessment: ${m.name}`, '### Verdict: APPROVE | CONCERNS | REJECT', '### Score: {1-10 overall}',
  '### Evaluation (by lens):', '- {lens}: {score}/10 — {analysis}', '### Red Flags: {auto-reject triggers, or "None"}', '### Concerns: {bulleted list, or "None"}',
  '### Recommendations: {bulleted list, or "None"}', '### Questions for Other Board Members: {or "None"}', '', 'Keep it to 200-400 words.',
].join('\n')

const summaryOf = (as: Assessment[]) => as.filter(a => !a.error).map(a => `### ${a.member.name} — Verdict: ${a.verdict ?? '?'}, Score: ${a.score ?? '?'}/10\n**Key concerns**: ${a.concerns.join('; ') || 'None'}\n**Recommendations**: ${a.recommendations.join('; ') || 'None'}\n**Questions**: ${section(a.text, 'Questions for Other Board Members').join('; ') || 'None'}`).join('\n\n')

const discussBrief = (topic: string, round: number, rounds: number, as: Assessment[], prior: string, own: Assessment) => [
  `# Board of Directors — Discussion Round ${round} of ${rounds}`, '', `You are participating in a board discussion about: ${topic}`, '',
  '## All Board Assessments', summaryOf(as), ...(prior ? ['', `## Prior Discussion (Round ${round - 1})`, prior] : []), '',
  '## Your Phase 1 Assessment', own.text, '',
  '## Discussion Instructions', 'Respond to the other members and to questions directed at you, using one or more message types: CHALLENGE (disagree, with evidence), AGREE (endorse, with evidence), QUESTION (ask a member), CLARIFY (answer a question), SHIFT (you changed position: original, what changed it, new position).', '',
  '## Output Format', '### {MESSAGE_TYPE}: {Your Name} → {Target Name or "Board"}', '{specific, evidence-based, concise}',
].join('\n')

const voteBrief = (topic: string, own: Assessment, transcript: string, retry = false) => [
  '# Board of Directors — Final Vote', '', `You are casting your binding vote on: ${topic}`, '',
  '## Your Phase 1 Assessment', `Your original verdict was: ${own.verdict ?? 'unknown'}; score ${own.score ?? '?'}/10`, own.text, '',
  '## Board Discussion', transcript || '(no discussion rounds)', '',
  '## Voting Instructions', 'Cast your final vote. You MUST choose APPROVE or REJECT — there is no CONCERNS option.',
  ...(own.verdict === 'CONCERNS' ? ['Your Phase 1 verdict was CONCERNS: you must now deliberately choose APPROVE or REJECT.'] : []),
  'If you vote APPROVE, list the conditions that must be met (or "None"). If REJECT, state what would need to change for you to approve.',
  ...(retry ? ['Your previous reply had no valid verdict. Reply with the vote block only.'] : []), '',
  '## Vote Format', `### Vote: ${own.member.name}`, '- Verdict: APPROVE | REJECT', '- Confidence: {0.0-1.0}', '- Conditions: {text or "None"}',
].join('\n')

// board.assessment_timeout_ms bounds every member run; a member that times out has no assessment.
type RunCtx = { agents: Agents; log: (s: string) => void; timeoutMs?: number }
const run = (io: Io, c: RunCtx, runs: { agent: string; brief: string; label: string }[]) =>
  runPersonas(io, c.timeoutMs ? { ...c.agents, run: o => c.agents.run({ ...o, timeoutMs: c.timeoutMs }) } : c.agents, { runs, read_only: true }, c.log)

function membersOf(ids: string[]): { members: Member[]; errors: string[] } {
  const members: Member[] = []
  const errors: string[] = []
  for (const id of ids) {
    const f = findPersona(id)
    if (!f.persona) { errors.push(f.ambiguous ? `"${id}" is ambiguous (${f.ambiguous.join(', ')})` : `"${id}" is not in the roster`); continue }
    const p: Persona = f.persona
    members.push({ id: p.id, name: p.name, division: p.division, lenses: p.review_strengths.slice(0, 4), score: 0 })
  }
  return { members, errors }
}

export type MeetInput = { topic: string; members?: string[]; context?: string; allow_two?: boolean }

export async function boardMeet(io: Io, agents: Agents, input: MeetInput, log: (s: string) => void = () => {}): Promise<string> {
  const p = await loadProject(io)
  if (!p.stateText) return 'No active project found. Run /triad:start to initialize a project before convening the board.'
  const b = boardSettings(p.settings)
  const topic = input.topic.trim()
  if (!topic) return 'The board needs a topic.'
  const picked = input.members?.length ? membersOf(input.members) : { members: compose(topic, b.default_size), errors: [] }
  if (picked.errors.length) return `Unknown board members: ${picked.errors.join('; ')}`
  const floor = input.allow_two ? 2 : b.min_size
  if (picked.members.length < floor) return `Only ${picked.members.length} board members; the minimum is ${floor}.`
  const members = picked.members
  const c = { agents, log, timeoutMs: b.assessment_timeout_ms }

  // Phase 1
  log(`board: assessments by ${members.map(m => m.id).join(', ')}`)
  const raw = await run(io, c, members.map(m => ({ agent: m.id, brief: assessBrief(topic, input.context ?? '', m, 'MEET'), label: `${m.id}-board-assessment` })))
  const as = members.map((m, i) => parseAssessment(m, raw[i]!))
  const ok = as.filter(a => !a.error)
  if (ok.length < 2) return `Board meeting aborted — only ${ok.length} of ${members.length} assessments received. Minimum 2 required. Check agent availability and retry.`

  // Phase 2
  const rounds: string[] = []
  for (let r = 1; r <= b.discussion_rounds; r++) {
    log(`board: discussion round ${r}`)
    const res = await run(io, c, ok.map(a => ({ agent: a.member.id, brief: discussBrief(topic, r, b.discussion_rounds, ok, rounds[r - 2] ?? '', a), label: `${a.member.id}-board-round-${r}` })))
    rounds.push(res.map(x => (x.answer ?? '').trim()).filter(Boolean).join('\n\n'))
  }
  const transcript = rounds.map((t, i) => `## Round ${i + 1}\n\n${t}`).join('\n\n')
  const shifts = [...transcript.matchAll(/###\s*SHIFT:\s*([^→\n]+)/g)].map(m => m[1]!.trim())

  // Phase 3: one re-vote for an invalid verdict, then ABSTAIN.
  log('board: final vote')
  const vres = await run(io, c, ok.map(a => ({ agent: a.member.id, brief: voteBrief(topic, a, transcript), label: `${a.member.id}-board-vote` })))
  const votes: Vote[] = []
  for (const [i, a] of ok.entries()) {
    let v = parseVote(a.member, vres[i]!.answer ?? '')
    if (!v) {
      const again = await run(io, c, [{ agent: a.member.id, brief: voteBrief(topic, a, transcript, true), label: `${a.member.id}-board-revote` }])
      v = parseVote(a.member, again[0]!.answer ?? '')
    }
    votes.push(v ?? { member: a.member, verdict: 'ABSTAIN', conditions: 'None', text: '(no valid vote after a re-vote)' })
  }
  const approve = votes.filter(v => v.verdict === 'APPROVE')
  const reject = votes.filter(v => v.verdict === 'REJECT')
  const abstain = votes.filter(v => v.verdict === 'ABSTAIN')
  const n = approve.length + reject.length
  let verdict = resolveVotes(approve.length, n)
  const conditions = [...new Set(approve.map(v => v.conditions).filter(x => x && !/^none\b/i.test(x)))]
  if (verdict === 'APPROVED WITH CONDITIONS' && !conditions.length) verdict = 'APPROVED'

  return persist(io, p.settings, b, { topic, members, as, transcript, votes, verdict, conditions, approve: approve.length, reject: reject.length, abstain: abstain.length, shifts, phase: p.state?.phase })
}

type Outcome = { topic: string; members: Member[]; as: Assessment[]; transcript: string; votes: Vote[]; verdict: Verdict; conditions: string[]; approve: number; reject: number; abstain: number; shifts: string[]; phase?: number }

async function persist(io: Io, settings: any, b: BoardSettings, o: Outcome): Promise<string> {
  const date = today(io)
  const dir = `.planning/board/${date}-${slugify(o.topic).slice(0, 50).replace(/-$/, '')}`
  const n = o.approve + o.reject
  const concerns = o.as.flatMap(a => a.concerns)
  const resolutionText = o.verdict === 'APPROVED' ? `The board approves ${o.topic}. Motion carried ${o.approve}–${o.reject}.`
    : o.verdict === 'APPROVED WITH CONDITIONS' ? `The board conditionally approves ${o.topic}, subject to the conditions below.`
    : o.verdict === 'REJECTED' ? `The board rejects ${o.topic}. Motion failed ${o.approve}–${o.reject}.`
    : `The board is tied ${o.approve}–${o.reject} on ${o.topic}; the user decides.`
  const files: string[] = []
  if (b.persist_artifacts) {
    for (const a of o.as) { await io.write(`${dir}/assessments/${a.member.id}.md`, `${a.text || `(no assessment: ${a.error})`}\n`); files.push(`${dir}/assessments/${a.member.id}.md`) }
    await io.write(`${dir}/discussion.md`, [`# Board Discussion — ${o.topic}`, '', `**Rounds**: ${b.discussion_rounds}`, `**Board Members**: ${o.members.map(m => m.name).join(', ')}`, `**Position shifts**: ${o.shifts.join(', ') || 'none'}`, '', o.transcript || '(no discussion rounds)', ''].join('\n'))
    await io.write(`${dir}/votes.md`, [`# Board Votes — ${o.topic}`, '', `**Date**: ${date}`, '', '## Individual Votes', '',
      ...o.votes.flatMap(v => [`### Vote: ${v.member.name}`, `- Verdict: ${v.verdict}`, `- Confidence: ${v.confidence ?? '—'}`, `- Conditions: ${v.conditions}`, '']),
      '## Tally', '', '| Metric | Count |', '|--------|-------|', `| Approve | ${o.approve} |`, `| Reject | ${o.reject} |`, `| Abstain | ${o.abstain} |`, `| Effective Board Size | ${n} |`, ''].join('\n'))
    await writeResolution(io, dir, date, o, resolutionText)
    await io.write(`${dir}/MEETING.md`, [`# Board Meeting — ${o.topic}`, '', `**Date**: ${date}`, `**Verdict**: ${o.verdict}`, `**Board Size**: ${o.members.length} members`, '',
      '## Board Composition', '', '| # | Agent | Division | Evaluation Lenses |', '|---|-------|----------|-------------------|', ...o.members.map((m, i) => `| ${i + 1} | ${m.name} | ${m.division} | ${m.lenses.join(', ') || '—'} |`), '',
      '## Conditions', '', ...(o.conditions.length ? o.conditions.map(x => `- ${x}`) : ['None']), '',
      '## Key Debate Points', '', ...(o.shifts.length ? [`- Position shifts: ${o.shifts.join(', ')}`] : []), ...[...new Set(concerns)].slice(0, 5).map(x => `- ${x}`), '',
      '## Assessment Summary', '', '| Agent | Verdict | Score | Top Concern |', '|-------|---------|-------|-------------|', ...o.as.map(a => `| ${a.member.name} | ${a.verdict ?? (a.error ? 'no answer' : '?')} | ${a.score ?? '?'}/10 | ${a.concerns[0] ?? 'None'} |`), '',
      '## Timeline', '', '| Phase | Status |', '|-------|--------|', `| Phase 1 — Assessment | ${o.as.filter(a => !a.error).length}/${o.members.length} completed |`, `| Phase 2 — Discussion | ${b.discussion_rounds} rounds |`, `| Phase 3 — Vote | ${o.approve}-${o.reject} |`, `| Phase 4 — Resolution | ${o.verdict} |`, '| Phase 5 — Persistence | Saved |', '',
      '## Artifacts', '', `- \`assessments/\` — Individual member assessments (${o.as.length} files)`, '- `discussion.md` — Full discussion transcript', '- `votes.md` — Individual votes and tally', '- `resolution.md` — Binding decision and rationale', ''].join('\n'))
    files.push(`${dir}/discussion.md`, `${dir}/votes.md`, `${dir}/resolution.md`, `${dir}/MEETING.md`)
  }
  if (o.verdict !== 'ESCALATED') await record(io, settings, o, files, dir)
  return [
    `Board ${o.verdict}: ${o.topic}`, `Vote: ${o.approve} APPROVE — ${o.reject} REJECT${o.abstain ? ` — ${o.abstain} ABSTAIN` : ''} (effective board ${n})`, resolutionText,
    ...(o.conditions.length ? ['', 'Conditions (all mandatory):', ...o.conditions.map((x, i) => `${i + 1}. ${x}`)] : []),
    ...(o.verdict === 'REJECTED' ? ['', 'Key reasons:', ...[...new Set(o.as.filter(a => a.verdict === 'REJECT').flatMap(a => a.concerns))].slice(0, 3).map(x => `- ${x}`)] : []),
    '', ...o.votes.map(v => `- ${v.member.name}: ${v.verdict}${v.confidence !== undefined ? ` (${v.confidence})` : ''}${v.verdict === 'APPROVE' && !/^none/i.test(v.conditions) ? ` — ${v.conditions}` : ''}`),
    '', b.persist_artifacts ? `Artifacts: ${dir}/` : 'Board artifacts not persisted (settings.board.persist_artifacts = false)',
    o.verdict === 'ESCALATED' ? `ESCALATED: ask the user (Approve / Approve with additional conditions / Reject / Table for later), then call board action decide with dir ${dir}.` : '',
  ].filter(x => x !== '').join('\n')
}

async function writeResolution(io: Io, dir: string, date: string, o: Outcome, text: string): Promise<void> {
  await io.write(`${dir}/resolution.md`, [`# Board Resolution — ${o.topic}`, '', `**Date**: ${date}`, `**Verdict**: ${o.verdict}`, '',
    '## Conditions', '', ...(o.verdict === 'REJECTED' ? ['N/A — proposal rejected'] : o.conditions.length ? o.conditions.map(x => `- ${x}`) : ['None — unconditional approval']), '',
    '## Vote Breakdown', '', '| Agent | Division | Verdict | Confidence | Key Condition |', '|-------|----------|---------|------------|---------------|',
    ...o.votes.map(v => `| ${v.member.name} | ${v.member.division} | ${v.verdict} | ${v.confidence ?? '—'} | ${v.verdict === 'APPROVE' && !/^none/i.test(v.conditions) ? v.conditions.split('\n')[0] : '—'} |`), '',
    '## Resolution Rationale', '', text, ''].join('\n'))
}

// Section 10 memory record and the commit.
async function record(io: Io, settings: any, o: Outcome, files: string[], dir: string): Promise<void> {
  const close = Math.abs(o.approve - o.reject) <= 1
  const rec = await storeOutcome(io, settings, {
    phase: o.phase ?? 0, plan: 'board', agent: o.members.map(m => m.id).join(', '), task_type: 'board_decision',
    outcome: o.verdict === 'REJECTED' ? 'failed' : o.verdict === 'ESCALATED' ? 'partial' : 'success',
    importance: Math.min(5, 3 + (close ? 1 : 0) + (o.verdict === 'ESCALATED' ? 1 : 0)),
    tags: ['board', 'governance', ...slugify(o.topic).split('-').filter(w => w.length > 3).slice(0, 3), ...new Set(o.members.map(m => m.division.toLowerCase()))],
    summary: `${o.verdict}: ${o.topic} — ${o.members.length} members, ${o.approve}-${o.reject} vote`,
  }).catch(() => undefined)
  if (settings?.execution?.auto_commit !== false && files.length) {
    await commit(io, [...files, ...(rec ? ['.planning/memory/OUTCOMES.md'] : [])], `chore(board): record governance decision — ${dir.split('/').pop()!.slice(11)}\n\nOutcome: ${o.verdict}\nBoard: ${o.members.map(m => m.name).join(', ')}\nVote: ${o.approve}–${o.reject}`)
  }
}

// The user's casting decision on an ESCALATED board.
export async function boardDecide(io: Io, input: { dir: string; decision: 'approve' | 'approve_conditions' | 'reject' | 'table'; conditions?: string[] }): Promise<string> {
  const res = await io.read(`${input.dir}/resolution.md`)
  if (!res || !/\*\*Verdict\*\*: ESCALATED/.test(res)) return `${input.dir} has no ESCALATED resolution.`
  const verdict = input.decision === 'reject' ? 'REJECTED (user decision)' : input.decision === 'table' ? 'TABLED (user decision)' : input.decision === 'approve' ? 'APPROVED (user decision)' : 'APPROVED WITH CONDITIONS (user decision)'
  const extra = input.decision === 'approve_conditions' ? (input.conditions ?? []).map(x => `- ${x} (user)`) : []
  let text = res.replace('**Verdict**: ESCALATED', `**Verdict**: ${verdict}`)
  if (extra.length) text = text.replace(/## Conditions\n\n/, `## Conditions\n\n${extra.join('\n')}\n`)
  text += `\n## User Decision\n\nThe board was tied; the user, as chair, decided: ${verdict}.\n`
  await io.write(`${input.dir}/resolution.md`, text)
  const m = await io.read(`${input.dir}/MEETING.md`)
  if (m) await io.write(`${input.dir}/MEETING.md`, m.replace('**Verdict**: ESCALATED', `**Verdict**: ${verdict}`).replace('| Phase 4 — Resolution | ESCALATED |', `| Phase 4 — Resolution | ${verdict} |`))
  const p = await loadProject(io)
  const topic = res.match(/^# Board Resolution — (.+)$/m)?.[1] ?? input.dir
  const tally = (await io.read(`${input.dir}/votes.md`)) ?? ''
  const num = (k: string) => Number(tally.match(new RegExp(`\\| ${k} \\| (\\d+) \\|`))?.[1] ?? 0)
  await storeOutcome(io, p.settings, {
    phase: p.state?.phase ?? 0, plan: 'board', agent: 'board', task_type: 'board_decision', outcome: 'partial', importance: 5,
    tags: ['board', 'governance', 'escalated'], summary: `ESCALATED → ${verdict}: ${topic} — ${num('Approve')}-${num('Reject')} vote`,
  }).catch(() => undefined)
  if (p.settings.execution?.auto_commit !== false) await commit(io, [`${input.dir}/resolution.md`, `${input.dir}/MEETING.md`, '.planning/memory/OUTCOMES.md'], `chore(board): user decision on tied board — ${input.dir.split('/').pop()!.slice(11)}\n\nOutcome: ${verdict}`)
  return `Recorded: ${verdict}.`
}

// Section 7: Phase 1 only, auto-composed from the phase, nothing persisted.
export async function boardReview(io: Io, agents: Agents, input: { phase?: number; topic?: string }, log: (s: string) => void = () => {}): Promise<string> {
  const p = await loadProject(io)
  if (!p.stateText) return 'No active project found. Run /triad:start to initialize a project before convening the board.'
  const n = input.phase ?? p.state?.phase ?? 1
  const info = p.roadmap?.phases.find(x => x.phase === n)
  const topic = input.topic ?? `Phase ${n}: ${info?.name ?? ''} — ${info?.goal ?? ''}`
  const b = boardSettings(p.settings)
  const members = compose(topic, b.default_size)
  if (members.length < 2) return `Only ${members.length} agents scored above zero for "${topic}"; a quick review needs at least 2.`
  const raw = await run(io, { agents, log, timeoutMs: b.assessment_timeout_ms }, members.map(m => ({ agent: m.id, brief: assessBrief(topic, `Phase ${n} goal: ${info?.goal ?? 'see ROADMAP.md'}. Read the phase directory under .planning/phases/ and the files its plans changed.`, m, 'REVIEW'), label: `${m.id}-board-assessment` })))
  const as = members.map((m, i) => parseAssessment(m, raw[i]!))
  const ok = as.filter(a => !a.error)
  const scores = ok.map(a => a.score).filter((x): x is number => x !== undefined)
  const count = (xs: string[]) => [...xs.reduce((mm, x) => mm.set(x.toLowerCase(), (mm.get(x.toLowerCase()) ?? 0) + 1), new Map<string, number>())]
  const common = count(ok.flatMap(a => a.concerns)).filter(([, c]) => c >= 2).map(([x]) => x)
  const recs = count(ok.flatMap(a => a.recommendations)).sort((a, b2) => b2[1] - a[1]).map(([x]) => x)
  return [
    `## Quick Board Review — ${topic}`, '', `**Board**: ${members.length} members`, `**Assessments**: ${ok.length}/${members.length} completed`, '',
    '### Assessment Summary', '', '| Agent | Division | Verdict | Score | Top Concern |', '|-------|----------|---------|-------|-------------|',
    ...as.map(a => `| ${a.member.name} | ${a.member.division} | ${a.verdict ?? (a.error ? 'no answer' : '?')} | ${a.score ?? '?'}/10 | ${a.concerns[0] ?? 'None'} |`), '',
    `### Aggregate Score: ${scores.length ? (scores.reduce((s, x) => s + x, 0) / scores.length).toFixed(1) : '?'}/10`, '',
    '### Red Flags', ...(ok.some(a => a.redFlags.length) ? ok.flatMap(a => a.redFlags.map(f => `- ${a.member.name}: ${f}`)) : ['None identified']), '',
    '### Common Concerns', ...(common.length ? common.map(x => `- ${x}`) : ['None shared by 2+ members']), '',
    '### Recommendations', ...(recs.length ? recs.slice(0, 8).map(x => `- ${x}`) : ['None']), '',
    '---', '*Quick review — no deliberation or voting. Run `/triad:board meet <topic>` for full governance.*',
  ].join('\n')
}

export { BY_ID }
