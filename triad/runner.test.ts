import { describe, expect, test } from 'claude-code/testing'
import { memIo } from './testkit.ts'
import { JOB_DONE, JOB_STOPPED, STILL_RUNNING, isWaitCommand, jobFiles, newJob, readJob, runnerBrief, startArgv } from './hooks/legion/runner.ts'
import { runVerification } from './hooks/legion/build.ts'

describe('runner jobs', () => {
  const job = newJob(['npm test', 'test -f "src/a b.ts"'], 'mv1:x 1')

  test('a job lives under .triad/run, one script per command, run and wait scripts beside them', () => {
    expect(job.dir).toBe('.triad/run/mv1-x-1')
    const f = jobFiles(job, 3600, 540)
    expect(Object.keys(f).sort()).toEqual(['.triad/run/mv1-x-1/cmd/1.sh', '.triad/run/mv1-x-1/cmd/2.sh', '.triad/run/mv1-x-1/run.sh', '.triad/run/mv1-x-1/wait.sh'])
    expect(f['.triad/run/mv1-x-1/cmd/2.sh']).toBe('test -f "src/a b.ts"\n')
    const run = f['.triad/run/mv1-x-1/run.sh']!
    expect(run).toContain('cd "$(dirname "$0")/../../.." || exit 1')
    expect(run).toContain('for i in $(seq 1 2); do')
    expect(run).toContain('timeout -k 10 3600 bash "$D/cmd/$i.sh"')
    expect(run).toContain('echo $? > "$D/out/$i.exit"')
    expect(run.trim().split('\n').at(-1)).toBe('touch "$D/done"')
    const wait = f['.triad/run/mv1-x-1/wait.sh']!
    expect(wait).toContain('end=$((SECONDS + 540))')
    for (const word of [JOB_DONE, STILL_RUNNING, JOB_STOPPED]) expect(wait).toContain(word)
  })

  test('the start command detaches the run script', () => {
    expect(startArgv('/repo', job)).toEqual(['bash', '-c', 'setsid nohup bash "$1" > /dev/null 2>&1 < /dev/null &', 'start', '/repo/.triad/run/mv1-x-1/run.sh'])
  })

  test("the runner's brief names the wait script and nothing to judge", () => {
    const b = runnerBrief('/repo', job, 'plan 01-01 verification')
    expect(b).toContain('`bash /repo/.triad/run/mv1-x-1/wait.sh`')
    expect(b).toContain('Run no other command and use no other tool.')
    expect(b).toMatch(/status: done\nsummary: .*\nchanges: none\nverify: none$/)
  })

  test('only a bare wait script under this root counts as the wait command', () => {
    expect(isWaitCommand('bash /repo/.triad/run/mv1-x-1/wait.sh', '/repo')).toBe(true)
    expect(isWaitCommand("  bash '/repo/.triad/run/mv1-x-1/wait.sh' ", '/repo')).toBe(true)
    for (const c of ['bash /repo/.triad/run/mv1-x-1/wait.sh; rm -rf /', 'bash /repo/.triad/run/mv1-x-1/run.sh', 'bash /other/.triad/run/x/wait.sh', 'bash /repo/.triad/run/../x/wait.sh', 'sh /repo/.triad/run/x/wait.sh'])
      expect(isWaitCommand(c, '/repo')).toBe(false)
  })

  test('results come back from the out files; a command with no exit code did not finish', async () => {
    const io = memIo({ [`${job.dir}/out/1.exit`]: '0\n', [`${job.dir}/out/1.log`]: 'ok' })
    const part = await readJob(io, job)
    expect(part.done).toBe(false)
    expect(part.results[0]).toEqual({ exitCode: 0, stdout: 'ok', stderr: '' })
    expect(part.results[1]!.exitCode).toBe(124)
    expect(part.results[1]!.stderr).toContain('did not finish')
    io.files.set(`${job.dir}/out/2.exit`, '124\n')
    const all = await readJob(io, job)
    expect(all.done).toBe(true)
    expect(all.results[1]!.stderr).toContain('stopped after 3600s')
  })

  test('verification goes to the long runner when the io has one', async () => {
    const io = memIo()
    const seen: [string[], string][] = []
    io.long = async (commands, label) => { seen.push([commands, label]); return commands.map(c => ({ exitCode: c === 'bad' ? 2 : 0, stdout: c, stderr: '' })) }
    const runs = await runVerification(io, ['good', 'bad'], undefined, 'plan 01-01 verification')
    expect(seen).toEqual([[['good', 'bad'], 'plan 01-01 verification']])
    expect(runs.map(r => r.passed)).toEqual([true, false])
  })
})
