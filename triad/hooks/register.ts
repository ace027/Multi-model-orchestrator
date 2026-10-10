import type { BuiltinToolName, Register } from 'claude-code'
import { DEFAULTS, MODEL_FOR, agentIdIn, approxTokens, mayWrite, pathsInBrief, parseReply, roleOfType, modelOfType, schemaProblems, type Options, type Role } from './policy.ts'
import { atom, update } from 'claude-code'
import { emptyLedger, ensureAgent, paneView, promptTokens, recordCompletion, recordStep, render, type Ledger } from './ledger.ts'
import { PANE, registerPane } from './pane.tsx'
import { PROGRESS_SYSTEM, TRIMMED_RESULT, WRAP_UP_NOTE, TIME_NOTE, apiChars, newMeter, parseProgress, partialReply, progressPrompt, project, resultOverflows, transcriptTail, type Meter } from './ceiling.ts'
import { LEGION_TOOLS } from './legion/tools.ts'
import { BUDGET_AGENT_NOTE, BUDGET_OVER, BUDGET_WARN, SPEND_FILE, bindingBudget, earlierSpend, parseSpend, spentOf } from './budget.ts'
import { personaRank, planCheck, planWrite, processLine, projectInit, statusText, validateText } from './legion/handlers.ts'
import { buildRun } from './legion/buildrun.ts'
import { estimate, phaseShape, type StepKind, type StepRecord } from './legion/estimate.ts'
import { review } from './legion/reviewrun.ts'
import { checkWrite, controlMode, controlModeLine, type Scope } from './legion/settings.ts'
import { checkMapping, loadKnowledgeIndex, logDecision, prepareRun } from './legion/authority.ts'
import { renderPersonaRuns, runPersonas } from './legion/personarun.ts'
import { EXTENDED, extendedTool } from './legion/extended.ts'
import { isWaitCommand, jobFiles, JOB_STOPPED, newJob, readJob, runnerBrief, startArgv } from './legion/runner.ts'
import { loadCustomPersonas } from './legion/custom.ts'
import { preBuildCheck, preShipAudit } from './legion/gates.ts'
import type { Io, RunResult } from './legion/io.ts'
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
const legion = new Set<string>()
const LEGION_MARK = 'triad legion: '
const LEGION_WAIT = 60 * 60_000

// Byte-stable (no dates, no per-session data) so it caches with the prefix.
const ORCHESTRATOR_GUIDE = `# Triad orchestration
You are the orchestrator. Decompose the work, make the architecture decisions, review results and decide retries. Each of your turns rereads the whole context, so keep them few: brief fully, wait, review once.
- A change of a few lines in files you already know: make it yourself.
- Well-specified implementation goes to triad:triad-coder (Sonnet); open-ended pieces (a game AI, architecture, tuning, visual polish) to triad:triad-opus-coder (Opus). Give one coder a whole cohesive deliverable in one complete brief: file paths, acceptance criteria, constraints and the verify command; no pasted code. Split only into independent tasks, launched in parallel.
- A quality goal tests do not capture (an AI's strength, speed, looks): name it in the brief with a budget (about 5 rounds or 10 minutes); the coder measures it and iterates within that budget.
- Fixes and follow-ups go to the same coder with SendMessage (its context is kept), not to a fresh agent. Retry a task at most once.
- Menial work (search, running a test suite and summarizing failures, log triage, a checklist, boilerplate you have designed) goes to triad:triad-helper (Haiku). Name the files it may write.
- Every agent returns status, summary, changes and verify. On blocked, rebrief, split the task, or take it over.
- A helper that reaches its token limit returns partial with what is done and what is left; give what is left to a fresh helper as a narrower job.
- Check results with the verify commands and git diff --stat, not by reading whole files.
- Long tool output may come back compressed, with the path of the full text in .triad/out/.
- /triad shows the agent tree and the tokens and cost per tier.
- Legion projects (.planning/) run through the /triad:* commands (start, plan, build, review, quick and the rest); each brings its coordination rules. /triad status and /triad validate are computed in code.`

// Sent only with a /triad:* prompt (prompt.submit context), not in every request.
const LEGION_GUIDE = `## Legion coordination
You hold the agents-orchestrator role yourself; that persona is never spawned. The workflow is start, plan, build, review, ship, retro, then the next phase's plan.
- Nine divisions of specialist personas: Engineering, Design, Marketing, Testing, Product, Project Management, Support, Spatial Computing, Specialized. Pick personas with persona_brief (hybrid selection: recommend, the user confirms or overrides).
- Authority: each persona owns exclusive domains (.planning/config/authority-matrix.yaml). Briefs list them; reviews drop out-of-domain findings from non-owners, except blockers. Agents may decide alone only inside their plan's files_modified, tests for their code, declared dependencies and formatting.
- Escalate (an <escalation> block, then a human decision): architecture changes, unplanned dependencies, files outside the task's scope, schema or API contract changes, deletions, CI/CD or deployment changes, overriding review findings or skipping quality gates. Never rationalize a small exception.
- Control modes (settings.json control_mode; planning_status reports the flags and whether confirmation gates are on):
  - guarded (default): authority and domain filtering on, out-of-scope writes warned and escalated.
  - surgical: out-of-scope writes refused and reverted.
  - advisory: read-only; agents return suggestions, nothing is committed.
  - autonomous: checks only warn and log; confirmation gates are skipped with their defaults. Permissions are never loosened.
- Every question to the user (confirmation gates, choices, persona swaps) uses AskUserQuestion with a closed set of options, never a question in plain text.
- A turn resumed after a session restart, with a build_phase or review_phase call that never returned: call the same tool again. A build resumes where it stopped and verifies and commits an agent answer saved before the restart without running the agent again. Never verify or commit a plan by hand.`

// The Legion guide plus the knowledge index built at session start from the
// plugin's own files (byte-stable for a plugin version).
let legionGuide = LEGION_GUIDE

const depthOf = (id: string | undefined): number => (id ? 1 + depthOf(parents[id]) : 0)
const runDir = () => `${cwd}/.triad/run`
const busy = (role: 'coder' | 'helper') => running[role].size + reserved[role]
const capOf = (role: 'coder' | 'helper') => (role === 'coder' ? opts.maxCoders : opts.maxHelpers)

// Paths a helper may write: an explicit "Writable files:" line, else the paths its brief names.
function writableFrom(prompt: string): string[] {
  const line = prompt.match(/^Writable files:\s*(.*)$/im)
  if (line) return line[1]!.trim().toLowerCase().startsWith('none') ? [] : line[1]!.split(',').map(s => s.trim()).filter(Boolean)
  return pathsInBrief(prompt)
}

function refuse(reason: string) {
  ledger.refusals.push({ reason, at: new Date().toISOString() })
  return { deny: 'triad: ' + reason }
}

async function save($: any) {
  await $.fs.write(`${cwd}/.triad/ledger.json`, JSON.stringify(ledger, null, 2) + '\n')
  if (sessionId) await $.store.set(`ledger:${sessionId}`, ledger)
  await publish($)
}

// The pane's view (pane.tsx draws it); the state scan wants the atom in each file that uses it.
const paneState = atom({ plugin: 'triad', key: 'view' } as const, null)
const budgets = () => ({ coders: [running.coder.size, opts.maxCoders] as [number, number], helpers: [running.helper.size, opts.maxHelpers] as [number, number], maxDepth: opts.maxDepth, maxSpend: opts.maxSpend, ...(opts.maxProjectSpend > 0 ? { project: { spent: projectSpent(), max: opts.maxProjectSpend } } : {}) })

// The pane's view; a failed write never costs the ledger or the hook.
async function publish($: any) {
  try {
    const view = paneView(ledger, budgets())
    await update($, paneState, () => view)
  } catch { /* the pane shows the last view */ }
}

// Spending budget: one notice at 80%, and at the limit a note to every agent
// still running (new spawns and workflow steps are refused from then on).
// What earlier sessions spent on this project (.planning/SPEND.json), read at start.
let earlier = 0
let spendWritten = -1
const projectSpent = () => earlier + spentOf(ledger)
const budget = () => bindingBudget(spentOf(ledger), opts.maxSpend, projectSpent(), opts.maxProjectSpend)
const budgetLevel = () => budget().level
// Brings this session's line in SPEND.json up to date (once a project exists; to
// the cent). It runs as a workflow step starts, so the step's own commits carry
// it and the tree is clean after. The turns after a session's last step (its
// report, a few cents) are left out of the file; within the session the budget
// counts every request.
async function recordSpend($: any) {
  const spent = Math.round(spentOf(ledger) * 100) / 100
  if (!sessionId || spent === spendWritten) return
  const io = ioOf($)
  const text = await io.read(SPEND_FILE)
  if (text === undefined && (await io.read('.planning/ROADMAP.md')) === undefined) return
  const f = parseSpend(text)
  earlier = earlierSpend(f, sessionId)
  f.sessions[sessionId] = { usd: spent, at: new Date().toISOString() }
  try { await io.write(SPEND_FILE, JSON.stringify(f, null, 2) + '\n'); spendWritten = spent } catch { /* next step tries again */ }
}
// What each plan, build and review step cost, kept in the plugin store across
// projects (the last STEPS_KEPT), so estimates scale to the user's own runs.
// Not in SPEND.json: a step's cost is known only after its commits.
const STEPS_KEY = 'steps'
const STEPS_KEPT = 200
// Spend when this session's planning started (Skill triad:plan, /triad:plan).
let planMark: number | undefined
async function recordStepUsd($: any, step: StepKind, phase: number | undefined, usd: number) {
  if (!sessionId || !(usd > 0)) return
  try {
    const shape = await phaseShape(ioOf($), phase, opts.lightPlans)
    if (!shape?.plans) return
    const all = ((await $.store.get(STEPS_KEY)) as StepRecord[] | undefined) ?? []
    const rec: StepRecord = { project: cwd, session: sessionId, phase: shape.phase, step, plans: shape.plans, opusPlans: shape.opusPlans, light: shape.light, ...(opts.allOpus ? { allOpus: true } : {}), usd: Math.round(usd * 10000) / 10000, at: new Date().toISOString() }
    const i = all.findIndex(x => x.project === cwd && x.session === sessionId && x.phase === rec.phase && x.step === step)
    // Planning is measured from its start, so its line is replaced; a resumed
    // build or review adds to the line.
    if (i < 0) all.push(rec)
    else all[i] = step === 'plan' ? rec : { ...rec, usd: all[i]!.usd + rec.usd }
    await $.store.set(STEPS_KEY, all.slice(-STEPS_KEPT))
  } catch { /* a missed record only leaves the estimate less calibrated */ }
}
async function recordStepCost($: any, tool: string, input: any, before: number) {
  const phase = input.phase === undefined ? undefined : Number(input.phase)
  if (tool === 'build_phase' || tool === 'review_phase') {
    planMark = undefined
    if (!input.flags?.includes?.('--dry-run')) await recordStepUsd($, tool === 'build_phase' ? 'build' : 'review', phase, spentOf(ledger) - before)
  } else if ((tool === 'plan_write' || tool === 'plan_check') && planMark !== undefined && phase) {
    await recordStepUsd($, 'plan', phase, spentOf(ledger) - planMark)
  }
}
async function checkBudget($: any) {
  const level = budgetLevel()
  const b = (ledger.budget ??= {})
  // A raised limit (options reload) re-arms the notices.
  if (level !== 'over') b.over = false
  if (level === 'ok' || level === 'off') b.warned = false
  if (level === 'warn' && !b.warned) {
    b.warned = true
    try { $.ui.toast(BUDGET_WARN(budget())) } catch { /* the pane shows it too */ }
  }
  if (level === 'over' && !b.over) {
    b.over = true
    b.warned = true
    try { $.ui.toast(BUDGET_OVER(budget())) } catch { /* the refusals say it */ }
    for (const id of [...running.coder, ...running.helper]) {
      try { await $.session.send({ to: { agentId: id }, text: BUDGET_AGENT_NOTE(budget()) }) } catch { /* best effort */ }
    }
  }
}
// The line a workflow tool's result ends with once 80% is spent.
const budgetNote = () => (budgetLevel() === 'warn' ? `\n\n${BUDGET_WARN(budget())}` : '')

// Waits for an agent's turn.complete without spending the hook's own budget:
// the wait runs in a child process that polls for the marker the turn.complete
// hook writes (SPIKE.md, hook budget).
const startedAt: Record<string, number> = {}
async function nowMs($: any): Promise<number> {
  try { return Number(await $.clock.now()) } catch { return Date.now() }
}

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

function ioOf($: any, root = cwd): Io {
  return {
    root,
    read: async r => { try { return String(await $.fs.read(`${root}/${r}`)) } catch { return undefined } },
    write: async (r, text) => { await $.fs.write(`${root}/${r}`, text) },
    list: async r => {
      try { return ((await $.fs.list(`${root}/${r}`)) as any[]).filter(x => x.kind !== 'other').map(x => ({ name: x.name, dir: x.kind === 'dir' })) } catch { return [] }
    },
    run: async (argv, o) => {
      const r: any = await $.process.run(argv, { cwd: root, timeoutMs: Math.min(600_000, o?.timeoutMs ?? 120_000) })
      return { exitCode: r.exitCode ?? 1, stdout: String(r.stdout ?? ''), stderr: String(r.stderr ?? '') }
    },
    long: (commands, label) => longRun($, root, commands, label),
    github: (tool, args) => githubCall($, tool, args),
    now: () => new Date(),
  }
}

// The session's GitHub MCP server: the one with both create_pull_request and
// list_pull_requests (named by its tool prefix, which $.mcp.call accepts).
async function githubCall($: any, tool: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  try {
    const names = new Set(((await $.tool.list()) as { name: string; mcp: boolean }[]).filter(t => t.mcp).map(t => t.name))
    const server = [...names].map(n => n.match(/^mcp__(.+)__create_pull_request$/)?.[1]).find(s => s && names.has(`mcp__${s}__list_pull_requests`))
    if (!server) return { ok: false, text: 'no GitHub MCP server is connected' }
    const r: any = await $.mcp.call(server, tool, args)
    return { ok: !r.isError, text: ((r.content ?? []) as any[]).filter(b => b.type === 'text').map(b => String(b.text)).join('\n') }
  } catch (e) {
    return { ok: false, text: String(e) }
  }
}

// Long commands (runner.ts): start the job detached, then a Haiku runner calls
// its wait script with Bash until it is done, while this call waits on the
// runner as on any agent. A runner that cannot start, or stops early, is
// replaced (up to RUNNER_TRIES); after that the call waits on the job itself.
const RUNNER_MARK = 'triad runner: '
const RUNNER_TRIES = 3
const runners = new Set<string>()
const activeJobs = new Set<string>() // absolute wait-script paths of jobs this session started
let progress: (line: string) => void = () => {}
async function longRun($: any, root: string, commands: string[], label: string): Promise<RunResult[]> {
  const io = ioOf($, root)
  const job = newJob(commands, `${Date.now().toString(36)}-${++seq}`)
  for (const [path, text] of Object.entries(jobFiles(job))) await io.write(path, text)
  const started = await io.run(startArgv(root, job), { timeoutMs: 30_000 })
  if (started.exitCode !== 0) return commands.map(() => ({ exitCode: 1, stdout: '', stderr: `the job could not start: ${started.stderr.trim()}` }))
  progress(`${label}: ${commands.length} command(s) running as job ${job.id}`)
  const waitPath = `${root}/${job.dir}/wait.sh`
  activeJobs.add(waitPath)
  try {
    for (let i = 0; i < RUNNER_TRIES && !(await readJob(io, job)).done; i++) {
      const pid = (await io.read(`${job.dir}/pid`))?.trim()
      if (i > 0 && pid && (await io.run(['bash', '-c', `kill -0 ${pid}`])).exitCode !== 0) break
      const s: any = await $.agent.spawn({ subagentType: HELPER_TYPE, prompt: runnerBrief(root, job, label), description: `${RUNNER_MARK}${label}`.slice(0, 80), model: 'haiku' }).catch((e: unknown) => ({ deny: String(e) }))
      if (!s?.agentId) { progress(`${label}: no runner agent (${s?.deny ?? 'not spawned'}); waiting on the job directly`); break }
      runners.add(s.agentId)
      try { await waitForAnswer($, s.agentId, 6 * 60 * 60_000) } finally { runners.delete(s.agentId) }
    }
    // No runner (or none finished it): wait on the job here, a wait call at a time.
    for (let i = 0; i < 40 && !(await readJob(io, job)).done; i++) {
      const w = await io.run(['bash', `${root}/${job.dir}/wait.sh`], { timeoutMs: 600_000 })
      if (w.stdout.includes(JOB_STOPPED)) break
    }
  } finally { activeJobs.delete(waitPath) }
  const { done, results } = await readJob(io, job)
  // The results are read; a job that never finished keeps its files to look at.
  if (done) await io.run(['rm', '-rf', `${root}/${job.dir}`]).catch(() => undefined)
  progress(`${label}: ${done ? `${results.filter(r => r.exitCode === 0).length}/${results.length} passed` : 'the job stopped before it finished'}`)
  return results
}

function agentsOf($: any, log: (line: string) => void = () => {}): Agents {
  return {
    maxParallel: opts.maxCoders,
    async run(o) {
      const { persona, label, timeoutMs } = o
      const prep = await prepareRun(ioOf($), persona, o.brief, o.scope)
      if ('deny' in prep) {
        log(`${label}: not started (${prep.deny})`)
        return { deny: prep.deny }
      }
      const { brief, scope } = prep
      const helper = persona.tier === 'haiku'
      const description = `${LEGION_MARK}${label} #${++seq}`
      if (persona.tier === 'opus') modelFor[description] = 'opus'
      const s: any = await $.agent.spawn({ subagentType: helper ? HELPER_TYPE : persona.tier === 'opus' ? 'triad:triad-opus-coder' : 'triad:triad-coder', prompt: brief, description, model: helper ? 'haiku' : persona.tier === 'opus' ? 'opus' : 'sonnet' })
      delete modelFor[description]
      if (!s?.agentId) {
        log(`${label}: not started (${s?.deny ?? JSON.stringify(s)})`)
        return { deny: s?.deny ?? 'the agent could not be spawned' }
      }
      const id: string = s.agentId
      log(`${label}: agent ${id} started`)
      scopes[id] = scope
      scopeLog[id] ??= { files: new Set(), warnings: [] }
      try {
        const answer = await waitForAnswer($, id, timeoutMs ?? LEGION_WAIT)
        log(`${label}: agent ${id} answered (${answer === undefined ? 'no answer' : `${answer.length} chars`})`)
        if (answer === undefined && timeoutMs !== undefined) return { agentId: id, deny: `no answer within ${timeoutMs} ms (timed out)` }
        // Kept for audit: what the executor parsed for this plan or review.
        await $.fs.write(`${cwd}/.triad/legion/${label.replace(/[^\w.-]+/g, '-')}-${id}.md`, answer ?? '(no answer)')
        return { agentId: id, answer }
      } catch (err) {
        log(`${label}: agent ${id} failed: ${err instanceof Error ? err.message : String(err)}`)
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
// A build or review is one long tool call: its progress also goes into the
// transcript, with a line every HEARTBEAT while it runs, so the session shows
// what it is doing (a remote session that looked idle has been stopped mid-build).
const HEARTBEAT = 5 * 60_000
const LONG_TOOLS = new Set(['build_phase', 'review_phase', 'persona_run', 'polish', 'ship'])
async function legionTool($: any, name: string, input: any): Promise<string> {
  const io = ioOf($)
  // Progress goes to .triad/legion.log (tail -f it during a long build).
  const lines: string[] = []
  const long = LONG_TOOLS.has(name)
  const log = (line: string) => {
    lines.push(`${new Date().toISOString().slice(11, 19)} ${line}`)
    void $.fs.write(`${cwd}/.triad/legion.log`, lines.join('\n') + '\n').catch(() => {})
    if (long) try { $.ui.log(`triad ${name}: ${line}`); $.ui.status(`triad ${name}: ${line}`.slice(0, 200)) } catch { /* the log file has it */ }
  }
  if (!long) return legionStep($, io, name, input, log)
  progress = log
  const t0 = Date.now()
  let beat: { cancel(): void } | undefined
  try {
    beat = $.clock.every(HEARTBEAT, () => {
      try { $.ui.log(`triad ${name}: still running (${Math.round((Date.now() - t0) / 60_000)} min)${lines.length ? `; last: ${lines[lines.length - 1]!.slice(9)}` : ''}`) } catch { /* best effort */ }
    })
  } catch { beat = undefined }
  try {
    return await legionStep($, io, name, input, log)
  } finally {
    try { beat?.cancel() } catch { /* already gone */ }
    try { $.ui.status(undefined) } catch { /* best effort */ }
    progress = () => {}
  }
}

async function legionStep($: any, io: Io, name: string, input: any, log: (line: string) => void): Promise<string> {
  await loadCustomPersonas(io).catch(() => [])
  if (EXTENDED.has(name)) {
    const registry = async () => ioOf($, `${String((await $.env.get('HOME')) ?? '~')}/.claude/legion`)
    return extendedTool(io, { agents: () => agentsOf($, log), ioAt: root => ioOf($, root), registry, schedule: (ms, fn) => { $.clock.after(ms, fn) }, notify: text => { void $.prompt.submit({ text }) } }, name, input)
  }
  switch (name) {
    case 'planning_status': {
      const v = await validateText(io, '--ci')
      const b = budget()
      const lines = [
        opts.maxSpend > 0 ? `$${spentOf(ledger).toFixed(2)} of $${opts.maxSpend.toFixed(2)} spent this session (maxSpend)` : '',
        opts.maxProjectSpend > 0 ? `$${projectSpent().toFixed(2)} of $${opts.maxProjectSpend.toFixed(2)} spent on the project (maxProjectSpend)` : '',
      ].filter(Boolean)
      const spend = lines.length ? `\nBudget: ${lines.join('; ')}${b.level === 'over' ? `: ${b.option} reached, stop` : ''}.` : ''
      return `${await statusText(io)}\n\nValidate: ${v.text}\n${controlModeLine(await controlMode(io))}\n${await processLine(io, opts.lightPlans)}${spend}${opts.notify ? '' : '\nNotify: off (option notify).'}`
    }
    case 'estimate': return (await estimate(io, { lightPlans: opts.lightPlans, allOpus: opts.allOpus, history: (await $.store.get(STEPS_KEY)) as StepRecord[] | undefined })).text
    case 'project_init': return projectInit(io, input)
    case 'plan_write': return planWrite(io, input)
    case 'plan_check': return planCheck(io, Number(input.phase))
    case 'persona_brief': return personaRank(io, input)
    case 'build_phase': return buildRun(io, agentsOf($, log), input, log)
    case 'persona_run': return renderPersonaRuns(await runPersonas(io, agentsOf($, log), input, log))
    case 'review_phase': return (await review(io, agentsOf($, log), { phase: input.phase, mode: input.mode, intent: input.intent, lightPlans: opts.lightPlans, fixMinor: opts.fixMinor, log })).text
  }
  return `unknown tool ${name}`
}

export const register: Register = (on, options) => {
  opts = { ...DEFAULTS, ...(options as Partial<Options>) }
  // Comparison baseline: the same workflow with every agent on Opus. The Haiku
  // ceiling exists for Haiku's pricing line, so it is off too.
  if (opts.allOpus) opts.haikuCeiling = 0
  registerPane(on)

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    cwd = r.cwd ?? e.cwd
    sessionId = await $.session.id()
    ledger = { ...emptyLedger(), ...((await $.store.get(`ledger:${sessionId}`)) as Partial<Ledger> | undefined) }
    ledger.options = { ...opts }
    earlier = earlierSpend(parseSpend(await ioOf($).read(SPEND_FILE)), sessionId)
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
    try {
      legionGuide = `${LEGION_GUIDE}\n\n${await loadKnowledgeIndex(ioOf($, $.plugin.root))}`
    } catch { legionGuide = LEGION_GUIDE }
    await $.command.register({ name: 'triad', description: 'Triad agent tree, tokens and cost per tier; `pane` opens it as a live pane; `status` and `validate [--ci] [--fix]` for a Legion .planning/ project', argumentHint: '[pane | status | validate [--ci] [--fix]]' })
    await publish($)
    if (opts.openPane) void $.ui.open({ id: PANE, title: 'Triad' })
    return r
  })

  // System prompt sections other than env_info_model are built for the main loop
  // only, so the guidance never reaches subagents (unlike prompt.context blocks).
  on('prompt.section', { name: 'communication' }, async ($, e, next) => {
    const r = await next(e)
    ledger.contextInjections = (ledger.contextInjections ?? 0) + 1
    return { text: (r.text ? r.text + '\n\n' : '') + ORCHESTRATOR_GUIDE }
  })

  // The Legion coordination rules and the command and persona index ride with
  // the /triad:* prompt that needs them, so plain sessions never pay for them.
  // (Context a command.run hook adds to a markdown command does not reach the
  // model; prompt.submit context does.)
  on('prompt.submit', async ($, e, next) => {
    if (!/^\/triad:/.test(e.text.trimStart())) return next(e)
    if (/^\/triad:plan\b/.test(e.text.trimStart())) planMark = spentOf(ledger)
    return next({ ...e, context: [...(e.context ?? []), legionGuide] })
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
      if (opts.strictMenu) return refuse(`agent type "${type}" bypasses the tiers. Use triad:triad-coder (Sonnet, a well-specified task), triad:triad-opus-coder (Opus, open-ended design or tuning) or triad:triad-helper (Haiku, menial work).`)
      return next(e)
    }
    // A delegate_menial spawn runs in the main loop, so the caller rides in the description.
    const parent = e.description.startsWith(DELEGATE_MARK) ? e.description.slice(DELEGATE_MARK.length).split(/\s/)[0] : e.parentAgentId
    const depth = depthOf(parent) + 1
    if (budgetLevel() === 'over') return refuse(BUDGET_OVER(budget()).replace(/^triad: /, ''))
    if (depth > opts.maxDepth) return refuse(`depth ${depth} is over the limit of ${opts.maxDepth}; do this step yourself or return blocked.`)
    if (role === 'helper' && approxTokens(e.prompt) > PREFLIGHT_TOKENS) {
      ledger.ceiling.refusedBriefs++
      return refuse(`the brief is about ${approxTokens(e.prompt)} tokens, too large to start a Haiku helper (limit ${PREFLIGHT_TOKENS}). Give it to triad:triad-coder, or split it into narrower helper jobs.`)
    }
    if (busy(role) >= capOf(role)) return refuse(`${busy(role)} ${role}s are already running (limit ${capOf(role)}). Wait for one to finish, or batch the work.`)
    reserved[role]++
    let r
    try {
      r = await next({ ...e, model: opts.allOpus ? 'opus' : modelFor[e.description] ?? modelOfType(type) ?? MODEL_FOR[role], background: false })
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
      if (role === 'coder') startedAt[id] = await nowMs($)
      if (e.description.startsWith(LEGION_MARK)) legion.add(id)
      ensureAgent(ledger, id, { role, type, parent: parent ?? 'main', depth, status: 'running' })
      await publish($)
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
    if (r?.usage) {
      recordStep(ledger, id, r.usage.model || e.model, r.usage)
      await checkBudget($)
      await publish($)
    }
    // Coder time budget: one note once the coder has worked coderMinutes, so an
    // open-ended tuning loop ends with a report instead of running on.
    const t0 = id && roles[id] === 'coder' && opts.coderMinutes > 0 ? startedAt[id] : undefined
    if (t0 !== undefined && (await nowMs($)) - t0 >= opts.coderMinutes * 60_000) {
      delete startedAt[id!]
      try { await $.session.send({ to: { agentId: id! }, text: TIME_NOTE(opts.coderMinutes) }) } catch { /* best effort */ }
    }
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
      } else if (roles[id]) finished[id] = e.answer // a plugin spawn can resolve after its agent has answered
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
    // The Legion executor's own agents reply in their brief's format (plan return
    // block, review findings), which the executor parses itself.
    if (legion.has(id) || String((e as any).description ?? '').startsWith(LEGION_MARK)) return r
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
  on('tool.call', { tool: WRITE_TOOLS as BuiltinToolName[] }, async ($, e, next) => {
    const id = e.agentId
    const input = e as unknown as { file_path?: string; notebook_path?: string }
    const target = input.file_path ?? input.notebook_path ?? ''
    const scope = id ? scopes[id] : undefined
    // Directory mappings (when the project has them) for Legion plan agents and coders.
    const mapped = id && target && (scope || roles[id] === 'coder') ? await checkMapping(ioOf($), rel(target)) : { action: 'ok' as const }
    if (mapped.action !== 'ok') {
      await logDecision(ioOf($), { agents: [id!], topic: 'directory-mapping', decision: mapped.action === 'deny' ? 'write denied' : 'write warned', reason: mapped.reason! })
      if (mapped.action === 'deny') return { deny: `triad: ${mapped.reason}. Directory mappings are strict: write it there, or return blocked naming the path the task needs.` }
      if (scope && !scopeLog[id!]!.warnings.includes(mapped.reason!)) scopeLog[id!]!.warnings.push(mapped.reason!)
    }
    if (id && scope && target) {
      const d = checkWrite(rel(target), scope)
      if (d.action !== 'allow') await logDecision(ioOf($), { agents: [id], topic: `write ${rel(target)}`, decision: d.action, reason: `${scope.planId} (${scope.mode}): ${d.reason ?? ''}` })
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

  // A job's wait script (runner.ts) runs without asking, for the runner waiting
  // on it; a runner may run nothing else.
  on('tool.check', async ($, e, next) => {
    const cmd = e.tool === 'Bash' ? String((e.input as any)?.command ?? '').trim() : ''
    const path = cmd.replace(/^bash\s+/, '').replace(/^'(.*)'$/, '$1')
    if (cmd && activeJobs.has(path) && isWaitCommand(cmd, path.slice(0, path.indexOf('/.triad/run/')))) return { decision: 'allow', reason: 'triad: a runner waiting on its job' }
    if (e.agentId && runners.has(e.agentId)) return { decision: 'deny', reason: 'triad: a runner only runs its wait script; Triad reads the results itself.' }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Legion's hooks, always on: STATE.md must be sane before an agent starts, and
  // `gh pr create` waits on a clean npm audit (critical level).
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const cmd = String((e as any).command ?? '')
    if (!/\bgh\s+pr\s+create\b/.test(cmd)) return next(e)
    const block = await preShipAudit(ioOf($), cmd)
    return block ? { deny: `triad: ${block}` } : next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const block = await preBuildCheck(ioOf($))
    return block ? { deny: `triad: ${block}` } : next(e)
  }).catch(($, e, next) => next(e))

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
    await checkBudget($)
    return next(e)
  })

  // Planning's cost runs from here to its last plan_write or plan_check.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    if (!e.agentId && (e as any).skill === 'triad:plan') planMark = spentOf(ledger)
    return next(e)
  })

  // Read-only tools that spend nothing stay open once a budget is reached.
  const FREE_TOOLS = new Set(['planning_status', 'estimate'])
  for (const t of LEGION_TOOLS) {
    on('tool.call', { tool: `mcp__triad__${t.name}` }, async ($, e, next) => {
      if (e.agentId) return { deny: 'triad: the Legion workflow tools run in the main loop only.' }
      if (budgetLevel() === 'over' && !FREE_TOOLS.has(t.name)) return { result: BUDGET_OVER(budget()), isError: true }
      try {
        await recordSpend($)
        const before = spentOf(ledger)
        const result = await legionTool($, t.name, e)
        await recordStepCost($, t.name, e, before)
        return { result: result + budgetNote() }
      } catch (err) {
        return { result: `triad: ${t.name} failed: ${err instanceof Error ? err.message : String(err)}`, isError: true }
      }
    })
  }

  on('command.run', { command: 'triad' }, async ($, e) => {
    const args = String(e.args ?? '').trim()
    if (/^status\b/.test(args)) return { text: `${await statusText(ioOf($), { dryRun: /--dry-run\b/.test(args) })}\n${controlModeLine(await controlMode(ioOf($)))}` }
    if (/^validate\b/.test(args)) return validateText(ioOf($), args)
    await save($)
    if (/^pane\b/.test(args)) {
      await $.ui.open({ id: PANE, title: 'Triad' })
      return { text: 'Triad pane opened: the agent tree and spend, updated as agents run.' }
    }
    return { text: render(ledger, budgets()) }
  })
}
