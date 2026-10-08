// execution.use_worktrees (wave-executor Section 1.5), opt-in and experimental:
// each plan works in its own git worktree under .triad/worktrees/NN-PP on a
// temporary branch, is verified there, and is merged back with --no-ff. A merge
// conflict is aborted and the worktree kept for inspection.
import type { Io } from './io.ts'

export type Worktree = { path: string; branch: string }

export const worktreePath = (planId: string) => `.triad/worktrees/${planId}`

export async function addWorktree(io: Io, planId: string, stamp: string): Promise<Worktree | string> {
  const path = worktreePath(planId)
  if ((await io.list('.triad/worktrees')).some(e => e.name === planId)) return `a worktree from an earlier run is kept at ${path}; inspect it, then remove it (git worktree remove --force ${path}) and build again`
  const branch = `triad-wt-${planId}-${stamp}`
  const r = await io.run(['git', 'worktree', 'add', path, '-b', branch, 'HEAD']).catch(e => ({ exitCode: 1, stdout: '', stderr: String(e) }))
  return r.exitCode === 0 ? { path, branch } : `git worktree add failed: ${(r.stderr || r.stdout).trim()}`
}

// Paths changed in the worktree, relative to it.
export async function worktreeFiles(io: Io, wt: Worktree): Promise<string[]> {
  const r = await io.run(['git', '-C', wt.path, 'status', '--porcelain', '--untracked-files=all'])
  return r.stdout.split('\n').filter(l => l.trim()).map(l => {
    const p = l.slice(3)
    return (p.includes(' -> ') ? p.split(' -> ')[1]! : p).replace(/^"|"$/g, '')
  })
}

export const inWorktree = (wt: Worktree | undefined, command: string) => (wt ? `cd '${wt.path.replace(/'/g, `'\\''`)}' && ${command}` : command)

export type MergeResult = { ok: true } | { ok: false; conflicts: string[]; error: string }

export async function mergeWorktree(io: Io, wt: Worktree, planId: string, prefix: string): Promise<MergeResult> {
  if ((await worktreeFiles(io, wt)).length) {
    await io.run(['git', '-C', wt.path, 'add', '-A'])
    const c = await io.run(['git', '-C', wt.path, 'commit', '-q', '-m', `${prefix}: plan ${planId} execution`])
    if (c.exitCode !== 0) return { ok: false, conflicts: [], error: `commit in the worktree failed: ${(c.stderr || c.stdout).trim()}` }
  }
  const m = await io.run(['git', 'merge', '--no-ff', '-m', `${prefix}: merge plan ${planId}`, wt.branch])
  if (m.exitCode === 0) return { ok: true }
  const u = await io.run(['git', 'diff', '--name-only', '--diff-filter=U'])
  await io.run(['git', 'merge', '--abort'])
  return { ok: false, conflicts: u.stdout.split('\n').map(s => s.trim()).filter(Boolean), error: (m.stderr || m.stdout).trim().slice(0, 400) }
}

export async function removeWorktree(io: Io, wt: Worktree): Promise<void> {
  await io.run(['git', 'worktree', 'remove', '--force', wt.path]).catch(() => undefined)
  await io.run(['git', 'branch', '-D', wt.branch]).catch(() => undefined)
}
