// Execution resilience (workflow-common Auto-Remediation, build.md step 5.a2):
// BLOCKER/ENVIRONMENT classification of a failed check or a blocked agent, and
// detection of the user's manual edits to agent-written files, stored as
// corrective preferences.
import type { Io } from './io.ts'
import type { Settings } from './settings.ts'
import { storeKnowledge } from './memory.ts'
import { BY_ID } from './registry.ts'

export type FailureKind = 'BLOCKER' | 'ENVIRONMENT'
export type Failure = { kind: FailureKind; reason: string; retried?: boolean; remediated?: boolean }

// Business logic, API contracts, schemas, test assertions, dependency conflicts:
// these win over environment indicators in the same output.
const BLOCKER_SIGNS: RegExp[] = [
  /AssertionError|assertion failed/i,
  /\bExpected\b[\s\S]{0,200}\bReceived\b/,
  /\bexpect\(.*\)\.\w+/,
  /ERESOLVE|peer dep(endency)? conflict|conflicting peer|dependency conflict/i,
  /schema mismatch|does not match (the )?schema/i,
  /error TS\d+|SyntaxError|is not assignable to/,
  /\b(404|405)\b.*\b(endpoint|route)\b|\bendpoint\b.*\bnot found\b/i,
]
// Missing packages or tools, wrong versions, missing directories or config,
// ports, network, permissions, flaky infrastructure.
const ENV_SIGNS: RegExp[] = [
  /MODULE_NOT_FOUND|Cannot find module ['"][^./'"]|ModuleNotFoundError|No module named|Cannot find package/i,
  /command not found|: not found$|is not recognized as an internal or external command|executable file not found/im,
  /(missing|no such file or directory|not found|ENOENT)[^\n]*node_modules|node_modules[^\n]*(missing|not found|does not exist)/i,
  /\.env\b.*(not found|missing|no such file)|missing (a )?\.env/i,
  /EADDRINUSE|address already in use|port \d+ (is )?(already )?in use/i,
  /unsupported engine|engine "?node"? is incompatible|requires (node|python|ruby|go) ?[><=v\d]|wrong (node|python) version|version mismatch/i,
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|getaddrinfo|network is unreachable|could not resolve host|socket hang up|TLS handshake|connection (timed out|refused|reset)/i,
  /EACCES|EPERM|permission denied|operation not permitted/i,
  /ENOSPC|No space left on device|out of memory|ENOMEM|\bKilled\b|ETXTBSY|EMFILE|too many open files|resource temporarily unavailable/i,
  /too many requests|rate limit|service unavailable|bad gateway|gateway time-?out/i,
  /did not finish|timed out|timeout exceeded/i,
  /no such file or directory.*\b(build|dist|out|tmp|logs?)\b|missing (build|output) directory/i,
]

export function classifyFailure(text: string): Failure {
  const find = (signs: RegExp[]) => {
    for (const re of signs) {
      const m = text.match(re)
      if (m) return (text.split('\n').find(l => re.test(l)) ?? m[0]).trim().slice(0, 200)
    }
    return undefined
  }
  const b = find(BLOCKER_SIGNS)
  if (b) return { kind: 'BLOCKER', reason: b }
  const e = find(ENV_SIGNS)
  if (e) return { kind: 'ENVIRONMENT', reason: e }
  return { kind: 'BLOCKER', reason: text.trim().split('\n').find(l => l.trim())?.trim().slice(0, 200) || 'failed with no output' }
}

// The escalation type a BLOCKER failure is raised under.
export function blockerType(text: string): string {
  if (/ERESOLVE|peer dep|dependency conflict|unplanned (package|dependency)/i.test(text)) return 'dependency'
  if (/schema|migration/i.test(text)) return 'schema'
  if (/endpoint|\bapi\b|contract/i.test(text)) return 'api'
  if (/files_modified|outside (the )?plan|not in files/i.test(text)) return 'scope'
  return 'quality'
}

export const envRetryBrief = (f: Failure, detail: string) => [
  `ENVIRONMENT ISSUE: ${f.reason}. Triad allows one automatic remediation and retry.`,
  detail,
  '',
  'Remediate inside the autonomous scope only: install dependencies already declared in the manifests (npm install, pip install -r requirements.txt, ...), create directories the code expects, set environment variables the project documents, clear caches that are safe to regenerate. Do not add new dependencies, change code to work around the environment, or edit build, CI or deployment configuration; if the fix needs that, reply status blocked with "ENVIRONMENT issue requires human approval: <the fix>".',
  'Then finish the plan, run its verification commands, and reply again with the full return block.',
].join('\n')

// ---- manual edits ----------------------------------------------------------

export const AGENT_FILES = '.triad/legion/agent-files.json'
type FileRecord = { hash: string; commit?: string; plan: string; agent: string; phase: number }

// FNV-1a, 32 bit, with the length: enough to tell "changed since the build".
export function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${h.toString(16).padStart(8, '0')}-${s.length}`
}

async function loadRecords(io: Io): Promise<Record<string, FileRecord>> {
  try { return JSON.parse((await io.read(AGENT_FILES)) ?? '{}') } catch { return {} }
}

// After a plan: committed files get their new hash; files of a plan that did not commit are dropped
// (their next state is not the agent's committed output).
export async function recordAgentFiles(io: Io, o: { files: string[]; plan: string; agent: string; phase: number; committed: boolean }): Promise<void> {
  if (!o.files.length) return
  const recs = await loadRecords(io)
  const head = o.committed ? (await io.run(['git', 'rev-parse', 'HEAD']).catch(() => undefined))?.stdout.trim() || undefined : undefined
  for (const f of o.files) {
    const text = o.committed ? await io.read(f) : undefined
    if (text === undefined) delete recs[f]
    else recs[f] = { hash: hashText(text), commit: head, plan: o.plan, agent: o.agent, phase: o.phase }
  }
  await io.write(AGENT_FILES, JSON.stringify(recs, null, 1) + '\n')
}

async function diffExcerpt(io: Io, file: string, rec: FileRecord): Promise<string> {
  const r = await io.run(['git', 'diff', '--no-color', '-U0', rec.commit ?? 'HEAD', '--', file]).catch(() => undefined)
  const lines = (r?.stdout ?? '').split('\n').filter(l => /^[+-]/.test(l) && !/^(\+\+\+|---)\s/.test(l))
  if (!lines.length) return 'content changed since the build'
  const add = lines.filter(l => l.startsWith('+')).length
  const del = lines.length - add
  return `+${add}/-${del} lines: ${lines.slice(0, 3).map(l => l.slice(0, 60).trim()).join(' / ')}${lines.length > 3 ? ' / ...' : ''}`
}

// At build start: agent-written files whose content changed since their plan's
// commit become corrective preferences (memory-manager Store Preference).
export async function detectManualEdits(io: Io, settings: Settings): Promise<string[]> {
  if ((settings as any).memory?.enabled === false) return []
  const recs = await loadRecords(io)
  const out: string[] = []
  let changed = false
  for (const [file, rec] of Object.entries(recs).sort()) {
    const text = await io.read(file)
    if (text !== undefined && hashText(text) === rec.hash) continue
    const what = text === undefined ? 'deleted the file' : await diffExcerpt(io, file, rec)
    const ext = file.match(/\.([\w]+)$/)?.[1] ?? 'none'
    const division = BY_ID.get(rec.agent)?.division.toLowerCase() ?? 'unknown'
    const id = await storeKnowledge(io, settings, 'preference', [
      'manual-edit', `Phase ${rec.phase}, post-build manual edit to ${file}`, `Agent output for ${file} (see plan ${rec.plan} SUMMARY.md)`,
      `User edited ${file} — ${what}`, 'corrective', rec.agent, ['manual-edit', ext, division].join(', '),
    ]).catch(() => undefined)
    if (!id) continue
    out.push(`${id} ${file} (${what})`)
    if (text === undefined) delete recs[file]
    else recs[file] = { ...rec, hash: hashText(text) }
    changed = true
  }
  if (changed) await io.write(AGENT_FILES, JSON.stringify(recs, null, 1) + '\n')
  return out
}
