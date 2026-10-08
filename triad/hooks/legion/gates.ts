// Legion's opt-in hooks, always on in Triad: STATE.md validation before an
// agent starts, and the npm audit gate before a PR is created. (Legion's
// pre-ship hook read the tool input from an unset variable and lost npm's
// non-zero exit, so it never fired; these read the real input.)
import type { Io } from './io.ts'

export async function preBuildCheck(io: Io): Promise<string | undefined> {
  const s = await io.read('.planning/STATE.md')
  if (s === undefined || s.includes('Current')) return undefined
  return 'STATE.md malformed (no "Current Position" section). Run `/triad validate --fix` or restore it before starting agents.'
}

export const CRITICAL_AUDIT = 'CRITICAL vulnerabilities found. Run npm audit fix before shipping.'

export async function preShipAudit(io: Io, command: string): Promise<string | undefined> {
  if (!/\bgh\s+pr\s+create\b/.test(command)) return undefined
  if ((await io.read('package-lock.json')) === undefined) return undefined
  const has = await io.run(['bash', '-c', 'command -v npm >/dev/null 2>&1'])
  if (has.exitCode !== 0) return undefined
  const r = await io.run(['bash', '-c', 'npm audit --audit-level=critical 2>&1'], { timeoutMs: 120_000 })
  return r.exitCode !== 0 && /critical/i.test(r.stdout + r.stderr) ? CRITICAL_AUDIT : undefined
}
