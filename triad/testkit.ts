// Test helpers shared by the Legion suites.
import type { Io, RunResult } from './hooks/legion/io.ts'
import type { Agents } from './hooks/legion/build.ts'

// An in-memory project with just enough git: dirty files since the last commit,
// and the commit messages.
export function memIo(seed: Record<string, string> = {}) {
  const files = new Map(Object.entries(seed))
  const dirty = new Set<string>()
  const commits: string[] = []
  const ok = (stdout = ''): RunResult => ({ exitCode: 0, stdout, stderr: '' })
  const io: Io & { files: typeof files; dirty: typeof dirty; commits: string[] } = {
    root: '/repo', files, dirty, commits,
    read: async r => files.get(r),
    write: async (r, t) => { files.set(r, t); dirty.add(r) },
    list: async r => {
      const pre = r.replace(/\/$/, '') + '/'
      const out = new Map<string, boolean>()
      for (const k of files.keys()) if (k.startsWith(pre)) { const rest = k.slice(pre.length); const i = rest.indexOf('/'); out.set(i < 0 ? rest : rest.slice(0, i), i >= 0) }
      return [...out].map(([name, dir]) => ({ name, dir }))
    },
    run: async argv => {
      if (argv[0] === 'rm') { files.delete(argv[2]!); return ok() }
      if (argv[0] === 'bash' && /git ls-files/.test(argv[2]!)) return ok([...files.keys()].join('\n'))
      if (argv[0] === 'bash') { const m = argv[2]!.match(/^test -f (\S+)$/); return m ? { exitCode: files.has(m[1]!) ? 0 : 1, stdout: '', stderr: '' } : ok() }
      const mv = argv[0] === 'mv' ? argv.slice(1) : argv[0] === 'git' && argv[1] === 'mv' ? argv.slice(2) : undefined
      if (mv) {
        const [from, to] = mv as [string, string]
        let moved = 0
        for (const k of [...files.keys()]) if (k.startsWith(from + '/')) { files.set(to + k.slice(from.length), files.get(k)!); files.delete(k); dirty.add(to + k.slice(from.length)); moved++ }
        return moved ? ok() : { exitCode: 1, stdout: '', stderr: 'no such directory' }
      }
      if (argv[0] !== 'git') return ok()
      if (argv[1] === 'branch') return ok('main\n')
      if (argv[1] === 'status') return ok([...dirty].map(f => `?? ${f}`).join('\n'))
      if (argv[1] === 'diff') return { exitCode: dirty.size ? 1 : 0, stdout: '', stderr: '' }
      if (argv[1] === 'commit') { commits.push(argv[argv.indexOf('-m') + 1]!); dirty.clear() }
      return ok()
    },
    now: () => new Date('2026-10-08T12:00:00Z'),
  }
  return io
}

export const REPLY = 'status: done\nsummary: did it\nchanges:\n- src/x | added | x\nverify: ok'

export function fakeAgents(io: ReturnType<typeof memIo>, review: (cycle: number) => string = () => '**Verdict**: PASS') {
  let n = 0
  const cycles: Record<string, number> = {}
  const spawned: string[] = []
  const agents: Agents & { spawned: string[] } = {
    maxParallel: 4, spawned,
    async run({ persona, scope, label }) {
      const id = `a${++n}`
      spawned.push(`${label} @${persona.tier}`)
      if (label.startsWith('review')) { cycles[persona.id] = (cycles[persona.id] ?? 0) + 1; return { agentId: id, answer: review(cycles[persona.id]!) } }
      for (const f of scope.files_modified) await io.write(f, `// ${label}\n`)
      return { agentId: id, answer: REPLY }
    },
    followUp: async () => REPLY,
    writesOf: () => ({ files: [], warnings: [] }),
    usageOf: () => '1 request',
  }
  return agents
}

