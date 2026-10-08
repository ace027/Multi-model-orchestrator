import type { Register } from 'claude-code'
import { DEFAULTS, MODEL_FOR, agentIdIn, approxTokens, mayWrite, pathsInBrief, parseReply, roleOfType, schemaProblems, type Options, type Role } from './policy.ts'
import { emptyLedger, ensureAgent, promptTokens, recordCompletion, recordStep, render, type Ledger } from './ledger.ts'
import { PROGRESS_SYSTEM, TRIMMED_RESULT, WRAP_UP_NOTE, apiChars, newMeter, parseProgress, partialReply, progressPrompt, project, resultOverflows, transcriptTail, type Meter } from './ceiling.ts'
import { LEGION_TOOLS } from './legion/tools.ts'
import { personaQuery, planCheck, planWrite, projectInit, statusText, validateText } from './legion/handlers.ts'
import { build } from './legion/build.ts'
import { review } from './legion/reviewrun.ts'
import { checkWrite, type Scope } from './legion/settings.ts'
import type { Io } from './legion/io.ts'
import type { Agents } from './legion/build.ts'
import { COMPRESS_TOOLS, SUMMARY_SYSTEM, chunks, describeCall, eligible, errorLines, headTail, mergePrompt, overThreshold, render as renderCompressed, summaryPrompt } from './compress.ts'

// Triad, Mode B (routed flat; see SPIKE.md). Only the orchestrator (main loop)
// has the Agent tool. Coders reach Haiku through the `delegate_menial` tool,
// whose handler spawns the helper itself. The mod keeps the agent tree.

const HELPER_TYPE = 'triad:triad-helper'
const DELEGATE = 'mcp__triad__delegate_menial'
const DELEGATE_MARK = 'triad delegate from '
const PREFLIGHT_TOKENS = 40_000
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']
// Tools the tiers use every turn stay loaded; other engine tools are deferred
// (still reachable through ToolSearch). Subagents' own tool lists are all here.
const KEEP_LOADED = new Set(['Agent', 'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'ToolSearch', 'Skill', DELEGATE, 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'])

let opts: Options = { ...DEFAULTS }
let cwd = ''
let sessionId = ''
let ledger: Ledger = emptyLedger()
const roles: Record<string, Role> = {}
const parents: Record<string, string | undefined> = {}
const writable: Record<string, string[]> = {}
const byToolUse: Record<string, string> = {}
const retries: Record<string, number> = {}
const tasks: Record<string, string> = {}
const running = { coder: new Set<string>(), helper: new Set<string>() }
const reserved = { coder: 0, helper: 0 }
const waiting: Record<string, { marker: string; resolve: (answer: string) => void }> = {}
// Haiku ceiling: per helper, its last request's size, and the files it wrote.
const meters: Record<string, Meter> = {}
const written: Record<string, Set<string>> = {}
let seq = 0
// Legion workflow agents: their plan scope, the writes the mod saw, a model
// override (opus personas, keyed by spawn description), and answers that came
// before anyone waited for them.
const scopes: Record<string, Scope> = {}
const scopeLog: Record<string, { files: Set<string>; warnings: string[] }> = {}
const modelFor: Record<string, string> = {}
const finished: Record<string, string> = {}
const LEGION_MARK = 'triad legion: '
const LEGION_WAIT = 60 * 60_000

// Byte-stable (no dates, no per-session data) so it caches with the prefix.
const ORCHESTRATOR_GUIDE = `# Triad orchestration
You are the orchestrator. Decompose the work, make the architecture decisions, review results and decide retries. Do not implement, or read files at length, yourself.
- Implementation goes to triad:triad-coder (Sonnet), one well-scoped task per agent. Brief it with file paths, acceptance criteria, constraints and the verify command; no pasted code. Launch independent tasks in parallel (several Agent calls in one message).
- Menial work (search, running a test suite and summarizing failures, log triage, a checklist, boilerplate you have designed) goes to triad:triad-helper (Haiku). Name the files it may write.
- Every agent returns status, summary, changes and verify. On blocked, rebrief, split the task, or take it over; retry a task at most once.
- A helper that reaches its token limit is stopped and returns partial with what is done and what is left. Review what it wrote, then give what is left to a fresh helper as a narrower job.
- Check results with the verify commands and git diff --stat, not by reading whole files.
- Long tool output may come back compressed, with the path of the full text in .triad/out/.
- /triad shows the agent tree and the tokens and cost per tier.
- Legion projects (.planning/) run through /triad:start, /triad:plan, /triad:build, /triad:review and /triad:quick; /triad status and /triad validate are computed in code.`

const depthOf = (id: string | undefined): number => (id ? 1 + depthOf(parents[id]) : 0)
const runDir = () => `${cwd}/.triad/run`
const busy = (role: 'coder' | 'helper') => running[role].size + reserved[role]
const capOf = (role: 'coder' | 'helper') => (role === 'coder' ? opts.maxCoders : opts.maxHelpers)

// Paths a helper may write: an explicit "Writable files:" line, else the paths its brief names.
function writableFrom(prompt: string): string[] {
  const line = prompt.match(/^Writable files:\s*(.*)$/im)
  if (line) return line[1].trim().toLowerCase().startsWith('none') ? [] : line[1].split(',').map(s => s.trim()).filter(Boolean)
  return pathsInBrief(prompt)
}

function refuse(reason: string) {
  ledger.refusals.push({ reason, at: new Date().toISOString() })
  return { deny: 'triad: ' + reason }
}

async function save($: any) {
  await $.fs.write(`${cwd}/.triad/ledger.json`, JSON.stringify(ledger, null, 2) + '\n')
  if (sessionId) await $.store.set(`ledger:${sessionId}`, ledger)
}

// Waits for an agent's turn.complete without spending the hook's own budget:
// the wait runs in a child process that polls for the marker the turn.complete
// hook writes (SPIKE.md, hook budget).
async function waitForAnswer($: any, agentId: string, ms: number): Promise<string | undefined> {
  let answer: string | undefined = finished[agentId]
  delete finished[agentId]
  if (answer !== undefined) return answer
  const marker = `${runDir()}/${agentId}.${++seq}.done`
  waiting[agentId] = { marker, resolve: a => { answer = a } }
  const until = Date.now() + ms
  while (answer === undefined && waiting[agentId]?.marker === marker && Date.now() < until) {
    const ticks = String(Math.max(1, Math.min(2300, Math.ceil((until - Date.now()) / 250))))
    await $.process.run(['bash', '-c', 'for i in $(seq 1 "$2"); do [ -e "$1" ] && exit 0; sleep 0.25; done; exit 1', 'wait', marker, ticks], { timeoutMs: 600_000 })
  }
  if (waiting[agentId]?.marker === marker) delete waiting[agentId]
  return answer
}

// One Haiku one-shot; its usage goes to the ledger. Undefined when the call fails.
async function summarize($: any, prompt: string): Promise<string | undefined> {
  const r = await $.model.complete({ model: 'haiku', system: SUMMARY_SYSTEM, prompt, maxTokens: 700 })
  if (!r.isAnswered) return undefined
  recordCompletion(ledger, r.usage)
  return r.text
}

async function saveOut($: any, tool: string, input: Record<string, unknown>, raw: string): Promise<string> {
  const path = `${cwd}/.triad/out/${Date.now().toString(36)}-${++seq}.txt`
  await $.fs.write(path, `# ${tool} ${describeCall(tool, input)}\n${raw}`)
  return path
}

// The partial reply for a helper stopped at the ceiling: a Haiku one-shot reads the
// tail of its transcript (well under the line) and says what is done and what is left.
async function stopReply($: any, id: string, projected: number): Promise<string> {
  let progress: { done?: string; left?: string } = {}
  try {
    const rows = await $.session.messages({ agentId: id })
    if (Array.isArray(rows)) {
      const r = await $.model.complete({ model: 'haiku', system: PROGRESS_SYSTEM, prompt: progressPrompt(tasks[id] ?? '', transcriptTail(rows, 60_000)), maxTokens: 400 })
      if (r.isAnswered) {
        recordCompletion(ledger, r.usage)
        progress = parseProgress(r.text)
      }
    }
  } catch { /* the reply still names what was written */ }
  return partialReply({ projected, ceiling: opts.haikuCeiling, ...progress, changes: [...(written[id] ?? [])] })
}

// Saves the full output, then returns the verbatim error lines plus a Haiku summary
// (map-reduce over 60k-token chunks), or head and tail when Haiku fails.
async function compress($: any, agentId: string | undefined, tool: string, input: Record<string, unknown>, raw: string): Promise<string> {
  const what = describeCall(tool, input)
  const path = await saveOut($, tool, input, raw)
  const task = (tasks[agentId ?? 'main'] ?? '').slice(0, 1500)
  const { parts, skipped } = chunks(raw)
  const pieces = await Promise.all(parts.map((text, i) =>
    summarize($, summaryPrompt({ tool, what, task, text, part: parts.length > 1 ? [i + 1, parts.length] : undefined }))))
  let summary: string | undefined
  if (pieces.every(p => p !== undefined)) summary = pieces.length === 1 ? pieces[0] : await summarize($, mergePrompt(task, what, pieces as string[]))
  const out = renderCompressed({ path, lines: raw.split('\n').length, tokens: approxTokens(raw), errors: errorLines(raw), summary: summary ?? headTail(raw), skipped })
  ledger.compression.calls++
  ledger.compression.rawTokens += approxTokens(raw)
  ledger.compression.outTokens += approxTokens(out)
  return out
}

// The tool's own result with its text replaced, or undefined when the shape is unknown.
function rewrite(tool: string, result: any, text: string, isError: boolean): unknown {
  // A failed Bash call reaches hooks with its text as the result, but an answer
  // must take the tool's object shape (spike, Phase 3 smoke test).
  if (tool === 'Bash' && typeof result === 'string') return { stdout: `${isError ? 'The command failed (nonzero exit).\n' : ''}${text}`, stderr: '', interrupted: false }
  if (typeof result === 'string') return undefined
  if (!result || typeof result !== 'object') return undefined
  if (tool === 'Bash' && 'stdout' in result) return { ...result, stdout: text, stderr: '' }
  if (tool === 'Grep') return { ...result, mode: 'content', content: text, filenames: [], numLines: text.split('\n').length }
  if (tool === 'Read' && result.type === 'text' && result.file) return { ...result, file: { ...result.file, content: text, numLines: text.split('\n').length } }
  return undefined
}

async function cancelWait($: any, agentId: string) {
  const w = waiting[agentId]
  if (!w) return
  delete waiting[agentId]
  await $.fs.write(w.marker, 'cancelled')
}

const rel = (path: string) => (path.startsWith(cwd + '/') ? path.slice(cwd.length + 1) : path)

function ioOf($: any): Io {
  return {
    root: cwd,
    read: async r => { try { return String(await $.fs.read(`${cwd}/${r}`)) } catch { return undefined } },
    write: async (r, text) => { await $.fs.write(`${cwd}/${r}`, text) },
    list: async r => {
      try { return ((await $.fs.list(`${cwd}/${r}`)) as any[]).filter(x => x.kind !== 'other').map(x => ({ name: x.name, dir: x.kind === 'dir' })) } catch { return [] }
    },
    run: async (argv, o) => {
      const r: any = await $.process.run(argv, { cwd, timeoutMs: Math.min(600_000, o?.timeoutMs ?? 120_000) })
      return { exitCode: r.exitCode ?? 1, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') }
    },
    now: () => new Date(),
  }
}

function agentsOf($: any): Agents {
  return {
    maxParallel: opts.maxCoders,
    async run({ persona, brief, scope, label }) {
      const helper = persona.tier === 'haiku'
      const description = `${LEGION_MARK}${label} #${++seq}`
      if (persona.tier === 'opus') modelFor[description] = 'opus'
      const s: any = await $.agent.spawn({ subagentType: helper ? HELPER_TYPE : 'triad:triad-coder', prompt: brief, description, model: helper ? 'haiku' : persona.tier === 'opus' ? 'opus' : 'sonnet' })
      delete modelFor[description]
      if (!s?.agentId) return { deny: s?.deny ?? 'the agent could not be spawned' }
      const id: string = s.agentId
      scopes[id] = scope
      scopeLog[id] ??= { files: new Set(), warnings: [] }
      try {
        return { agentId: id, answer: await waitForAnswer($, id, LEGION_WAIT) }
      } catch (err) {
        return { agentId: id, deny: `waiting for agent ${id} failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    },
    async followUp(id, text) {
      delete finished[id]
      const again = waitForAnswer($, id, LEGION_WAIT)
      let sent: any
      try { sent = await $.session.send({ to: { agentId: id }, text }) } catch { sent = undefined }
      if (!sent?.isDelivered) await cancelWait($, id)
      return again
    },
    writesOf: id => ({ files: [...(scopeLog[id]?.files ?? [])], warnings: [...(scopeLog[id]?.warnings ?? [])] }),
    usageOf(id) {
      const a = ledger.agents[id]
      if (!a) return undefined
      return `${a.requests} requests, ${a.input + a.cacheRead + a.cacheWrite} input tokens (${a.cacheRead} cached), ${a.output} output tokens, $${a.cost.toFixed(4)}`
    },
  }
}

// The Legion tools run in the main loop only: they spawn and wait for agents.
async function legionTool($: any, name: string, input: any): Promise<string> {
  const io = ioOf($)
  // Progress goes to .triad/legion.log (tail -f it during a long build).
  const lines: string[] = []
  const log = (line: string) => {
    lines.push(`${new Date().toISOString().slice(11, 19)} ${line}`)
    void $.fs.write(`${cwd}/.triad/legion.log`, lines.join('\n') + '\n').catch(() => {})
  }
  switch (name) {
    case 'planning_status': {
      const v = await validateText(io, '--ci')
      return `${await statusText(io)}\n\nValidate: ${v.text}`
    }
    case 'project_init': return projectInit(io, input)
    case 'plan_write': return planWrite(io, input)
    case 'plan_check': return planCheck(io, Number(input.phase))
    case 'persona_brief': return personaQuery(input)
    case 'build_phase': return (await build(io, agentsOf($), { phase: input.phase, wave: input.wave, rerun: !!input.rerun, log })).text
    case 'review_phase': return (await review(io, agentsOf($), { phase: input.phase, mode: input.mode, log })).text
  }
  return `unknown tool ${name}`
}

export const register: Register = (on, options) => {
  opts = { ...DEFAULTS, ...(options as Partial<Options>) }

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    cwd = r.cwd ?? e.cwd
    sessionId = await $.session.id()
    ledger = { ...emptyLedger(), ...((await $.store.get(`ledger:${sessionId}`)) as Partial<Ledger> | undefined) }
    ledger.options = { ...opts }
    await $.fs.write(`${cwd}/.triad/.gitignore`, '*\n')
    await $.tool.register({
      name: 'delegate_menial',
      description:
        'Hand a narrow, menial job to a Haiku helper agent and get its report back: broad search, running tests and summarizing failures, log triage, formatting, docs lookup, or boilerplate you have already designed. ' +
        'The helper may write only the files listed in `writable`. It makes no design decisions; it returns status done, blocked or partial.',
      inputSchema: {
        type: 'object',
        properties: {
          brief: { type: 'string', description: 'What to do, the file paths involved, and how to check it. No pasted code.' },
          writable: { type: 'array', items: { type: 'string' }, description: 'Files the helper may create or edit. Omit for a read-only job.' },
        },
        required: ['brief'],
      },
      isDeferred: false,
    })
    for (const t of LEGION_TOOLS) await $.tool.register({ ...t, isDeferred: true })
    await $.command.register({ name: 'triad', description: 'Triad agent tree, tokens and cost per tier; `status` and `validate [--ci] [--fix]` for a Legion .planning/ project', argumentHint: '[status | validate [--ci] [--fix]]' })
    return r
  })

  // System prompt sections other than env_info_model are built for the main loop
  // only, so the guidance never reaches subagents (unlike prompt.context blocks).
  on('prompt.section', { name: 'communication' }, async ($, e, next) => {
    const r = await next(e)
    ledger.contextInjections = (ledger.contextInjections ?? 0) + 1
    return { text: (r.text ? r.text + '\n\n' : '') + ORCHESTRATOR_GUIDE }
  })

  on('tool.describe', async ($, e, next) => {
    const r = await next(e)
    if (!opts.deferTools || r.isDeferred || KEEP_LOADED.has(e.tool) || (e.provider as any)?.plugin !== 'engine') return r
    if (!ledger.deferredTools.includes(e.tool)) ledger.deferredTools.push(e.tool)
    return { ...r, isDeferred: true }
  })

  // Only the main loop has the Agent tool (SPIKE.md #6), so this menu is the orchestrator's.
  on('agent.offer', async ($, e, next) => {
    if (opts.strictMenu && !roleOfType(e.agent)) return { isOffered: false }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    // A plugin's own spawn can arrive in the Agent tool's shape (`subagent_type`).
    const type: string = e.subagentType ?? (e as any).subagent_type ?? 'general-purpose'
    const role = roleOfType(type)
    if (!role || role === 'orchestrator') {
      if (opts.strictMenu) return refuse(`agent type "${type}" bypasses the tiers. Use triad:triad-coder (Sonnet, implements one task) or triad:triad-helper (Haiku, menial work).`)
      return next(e)
    }
    // A delegate_menial spawn runs in the main loop, so the caller rides in the description.
    const parent = e.description.startsWith(DELEGATE_MARK) ? e.description.slice(DELEGATE_MARK.length).split(/\s/)[0] : e.parentAgentId
    const depth = depthOf(parent) + 1
    if (depth > opts.maxDepth) return refuse(`depth ${depth} is over the limit of ${opts.maxDepth}; do this step yourself or return blocked.`)
    if (role === 'helper' && approxTokens(e.prompt) > PREFLIGHT_TOKENS) {
      ledger.ceiling.refusedBriefs++
      return refuse(`the brief is about ${approxTokens(e.prompt)} tokens, too large to start a Haiku helper (limit ${PREFLIGHT_TOKENS}). Give it to triad:triad-coder, or split it into narrower helper jobs.`)
    }
    if (busy(role) >= capOf(role)) return refuse(`${busy(role)} ${role}s are already running (limit ${capOf(role)}). Wait for one to finish, or batch the work.`)
    reserved[role]++
    let r
    try {
      r = await next({ ...e, model: modelFor[e.description] ?? MODEL_FOR[role], background: false })
    } finally {
      reserved[role]--
    }
    if (r.agentId) {
      const id = r.agentId
      roles[id] = role
      parents[id] = parent
      running[role].add(id)
      byToolUse[e.tool_use_id] = id
      if (role === 'helper') {
        writable[id] = writableFrom(e.prompt)
        meters[id] = newMeter()
        written[id] = new Set()
      }
      tasks[id] = e.prompt
      ensureAgent(ledger, id, { role, type, parent: parent ?? 'main', depth, status: 'running' })
    }
    return r
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'triad: the spawn check failed, so the spawn was refused. Try again.' }))

  // Haiku ceiling. Before each helper request, project its size; over the ceiling,
  // answer the step here with a partial reply so the request is never sent
  // (SPIKE.md #8). After each request, note its exact size, and at the wrap-up
  // threshold tell the helper to finish.
  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    const m = id && roles[id] === 'helper' && opts.haikuCeiling > 0 ? meters[id] : undefined
    let chars: number | undefined
    if (m) {
      const msgs = await $.session.messages({ as: 'api', agentId: id })
      if (Array.isArray(msgs)) chars = apiChars(msgs)
      const projected = chars === undefined ? 0 : project(m, chars)
      if (projected > opts.haikuCeiling) {
        ledger.ceiling.stops++
        const answer = await stopReply($, id!, projected)
        yield { kind: 'text', index: 0, text: answer } as any
        yield { kind: 'stop', stopReason: 'end_turn', usage: null } as any
        return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: null } as any
      }
    }
    const r = yield* next(e)
    if (r?.usage) recordStep(ledger, id, r.usage.model || e.model, r.usage)
    if (m && r?.usage) {
      m.lastPrompt = promptTokens(r.usage)
      if (chars !== undefined) m.charsAtLast = chars
      if (!m.warned && m.lastPrompt >= opts.haikuWrapAt) {
        m.warned = true
        ledger.ceiling.wrapNotes++
        try {
          await $.session.send({ to: { agentId: id! }, text: WRAP_UP_NOTE(m.lastPrompt, opts.haikuCeiling) })
        } catch { /* the hard stop still holds */ }
      }
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id) {
      const role = roles[id]
      if (role === 'coder' || role === 'helper') running[role].delete(id)
      if (ledger.agents[id]) ledger.agents[id].status = parseReply(e.answer).status ?? (e.isAborted ? 'aborted' : 'no status')
      const w = waiting[id]
      if (w) {
        delete waiting[id]
        w.resolve(e.answer)
        await $.fs.write(w.marker, 'done')
      } else if (scopes[id]) finished[id] = e.answer
    }
    await save($)
    return next(e)
  })

  // Coders' (and directly spawned helpers') replies: send a non-conforming reply back once.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r: any = await next(e)
    if (r.isError || typeof r.text !== 'string') return r
    const id = byToolUse[e.tool_use_id] ?? agentIdIn(r.text)
    if (!id || !roles[id]) return r
    const problems = schemaProblems(r.text)
    if (!problems.length || (retries[id] ?? 0) >= opts.maxRetries) return r
    retries[id] = (retries[id] ?? 0) + 1
    ledger.rejectedReplies++
    return {
      deny:
        `triad: the reply from agent ${id} did not follow the return schema (${problems.join('; ')}). ` +
        `Send it a message (SendMessage to ${id}) asking it to resend only the status/summary/changes/verify block.`,
    }
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'triad: the reply check failed before the agent ran. Try again.' }))

  on('tool.call', { tool: DELEGATE }, async ($, e, next) => {
    const caller = e.agentId
    const callerRole = caller ? roles[caller] : 'orchestrator'
    if (!caller) return { deny: 'triad: the orchestrator spawns helpers with the Agent tool (subagent_type triad:triad-helper).' }
    if (callerRole !== 'coder') return { deny: 'triad: only coders may delegate; helpers never spawn.' }
    const args = e as unknown as { brief?: unknown; writable?: unknown }
    const brief = String(args.brief ?? '').trim()
    const files = Array.isArray(args.writable) ? args.writable.map(String).filter(Boolean) : []
    if (!brief) return { deny: 'triad: delegate_menial needs a brief.' }
    if (approxTokens(brief) > PREFLIGHT_TOKENS) ledger.ceiling.refusedBriefs++
    if (approxTokens(brief) > PREFLIGHT_TOKENS) return refuse(`the brief is about ${approxTokens(brief)} tokens, too large to start a Haiku job (limit ${PREFLIGHT_TOKENS}). Split it into narrower jobs or do it yourself.`)
    const prompt = `${brief}\n\nWritable files: ${files.length ? files.join(', ') : 'none (read-only job)'}`
    const s: any = await $.agent.spawn({ subagentType: HELPER_TYPE, prompt, description: `${DELEGATE_MARK}${caller}`, model: 'haiku' })
    if (!s.agentId) return { deny: s.deny ?? 'triad: the helper could not be spawned.' }
    const id: string = s.agentId
    let answer = await waitForAnswer($, id, 30 * 60_000)
    if (answer === undefined) return { result: `status: partial\nsummary: helper ${id} did not finish within 30 minutes.\nchanges: unknown\nverify: none` }
    const problems = schemaProblems(answer)
    if (problems.length && (retries[id] ?? 0) < opts.maxRetries) {
      retries[id] = (retries[id] ?? 0) + 1
      ledger.rejectedReplies++
      const again = waitForAnswer($, id, 3 * 60_000)
      let sent: any
      try {
        sent = await $.session.send({ to: { agentId: id }, text: `Your reply did not follow the return schema (${problems.join('; ')}). Reply again with only the status/summary/changes/verify block.` })
      } catch {
        sent = undefined
      }
      if (!sent?.isDelivered) await cancelWait($, id)
      const second = await again
      if (second !== undefined && !schemaProblems(second).length) answer = second
    }
    const status = parseReply(answer).status
    const note = status === 'partial' ? '\n\ntriad: the helper stopped before finishing. Review what it wrote, then delegate what is left as a narrower job, or do it yourself.'
      : status === 'blocked' ? '\n\ntriad: the helper is blocked. Rebrief it once with what it needs, or do the job yourself.' : ''
    return { result: (schemaProblems(answer).length ? `triad: helper ${id} did not follow the return schema; its reply follows.\n${answer}` : answer) + note }
  }).catch(() => ({ deny: 'triad: delegate_menial failed. Do the job yourself or return blocked.' }))

  // Helpers write only the files their brief names. Agents working a Legion
  // plan are held to its files under the project's control mode.
  on('tool.call', { tool: WRITE_TOOLS }, async ($, e, next) => {
    const id = e.agentId
    const input = e as unknown as { file_path?: string; notebook_path?: string }
    const target = input.file_path ?? input.notebook_path ?? ''
    const scope = id ? scopes[id] : undefined
    if (id && scope && target) {
      const d = checkWrite(rel(target), scope)
      if (d.action === 'deny') return { deny: 'triad: ' + d.reason }
      if (d.action !== 'allow' && d.reason && !scopeLog[id]!.warnings.includes(d.reason)) scopeLog[id]!.warnings.push(d.reason)
      const r: any = await next(e)
      if (!r.deny && !r.isError) scopeLog[id]!.files.add(rel(target))
      return r
    }
    if (!id || roles[id] !== 'helper') return next(e)
    const allowed = writable[id] ?? []
    if (target && !mayWrite(target, allowed, cwd)) return { deny: `triad: a helper may write only the files its brief names (${allowed.join(', ') || 'none'}); ${target} is not one. Return blocked if the job needs it.` }
    const r: any = await next(e)
    if (target && !r.deny && !r.isError) written[id]?.add(target.startsWith(cwd + '/') ? target.slice(cwd.length + 1) : target)
    return r
  }).catch(($, e, next) => (next.called ? next(e) : { deny: 'triad: the write check failed, so the write was refused.' }))

  // Long Bash/Grep output (and log-like files read) is saved to .triad/out and
  // replaced by its error lines plus a Haiku summary. Edits and writes never are.
  on('tool.call', { tool: COMPRESS_TOOLS }, async ($, e, next) => {
    const r: any = await next(e)
    const input = e as unknown as Record<string, unknown>
    if (r.deny || typeof r.text !== 'string') return r
    const compressible = opts.compress && eligible(e.tool, input, cwd)
    const meter = e.agentId && roles[e.agentId] === 'helper' && opts.haikuCeiling > 0 ? meters[e.agentId] : undefined
    if (!compressible && !meter) return r
    let raw: string = r.text
    const persisted = r.result?.persistedOutputPath ?? r.result?.rawOutputPath
    if (persisted) {
      try { raw = String(await $.fs.read(persisted)) } catch { /* keep the text core gave */ }
    }
    let text: string | undefined
    if (compressible && overThreshold(raw, opts.compressThreshold)) text = await compress($, e.agentId, e.tool, input, raw)
    // A helper near its ceiling gets a pointer instead of output that would take it over.
    if (meter && resultOverflows(meter, (text ?? r.text).length, opts.haikuCeiling)) {
      ledger.ceiling.trimmed++
      text = TRIMMED_RESULT(approxTokens(raw), await saveOut($, e.tool, input, raw))
    }
    if (text === undefined) return r
    const result = rewrite(e.tool, r.result, text, !!r.isError)
    return result === undefined ? r : { result, ...(r.isError ? { isError: true } : {}) }
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (e.cost) ledger.measuredUsd = e.cost.usd
    return next(e)
  })

  for (const t of LEGION_TOOLS) {
    on('tool.call', { tool: `mcp__triad__${t.name}` }, async ($, e, next) => {
      if (e.agentId) return { deny: 'triad: the Legion workflow tools run in the main loop only.' }
      try {
        return { result: await legionTool($, t.name, e) }
      } catch (err) {
        return { result: `triad: ${t.name} failed: ${err instanceof Error ? err.message : String(err)}`, isError: true }
      }
    })
  }

  on('command.run', { command: 'triad' }, async ($, e) => {
    const args = String(e.args ?? '').trim()
    if (/^status\b/.test(args)) return { text: await statusText(ioOf($)) }
    if (/^validate\b/.test(args)) return validateText(ioOf($), args)
    await save($)
    return {
      text: render(ledger, {
        coders: [running.coder.size, opts.maxCoders],
        helpers: [running.helper.size, opts.maxHelpers],
        maxDepth: opts.maxDepth,
      }),
    }
  })
}
