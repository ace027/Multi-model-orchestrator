// Long shell commands (verification commands, test suites, a deploy) never run
// inside a workflow tool call as one silent child process: a remote session
// blocked that way, with nothing in its transcript, has been stopped and
// restarted mid-call (a ~10 minute suite inside ship check, a plan's suite
// inside build_phase). Instead the commands run as a detached job, and a Haiku
// runner agent calls the job's wait script with Bash until it finishes, so the
// session shows work the whole time, as it does while a coder works. The tool
// waits on the runner the way it waits on any agent, then reads each command's
// exit code and output back from the job's files. The runner only waits: it
// never sees the commands' results as something to act on.
import type { Io, RunResult } from './io.ts'

export const RUN_DIR = '.triad/run'
// A wait call returns within this (a foreground Bash call may run 10 minutes).
export const WAIT_SECONDS = 540
// One command may run this long before it is stopped (exit 124).
export const COMMAND_SECONDS = 60 * 60
export const JOB_DONE = 'JOB DONE'
export const STILL_RUNNING = 'STILL RUNNING'
export const JOB_STOPPED = 'JOB STOPPED'

export type Job = { id: string; dir: string; commands: string[] }

export function newJob(commands: string[], stamp: string): Job {
  const id = stamp.replace(/[^\w-]+/g, '-')
  return { id, dir: `${RUN_DIR}/${id}`, commands }
}

// Every file of the job, by path relative to the project root. The scripts find
// the root from their own path, so they run from any directory.
export function jobFiles(job: Job, commandSeconds = COMMAND_SECONDS, waitSeconds = WAIT_SECONDS): Record<string, string> {
  const n = job.commands.length
  const head = ['#!/usr/bin/env bash', 'cd "$(dirname "$0")/../../.." || exit 1', `D=${job.dir}`]
  const files: Record<string, string> = {}
  for (const [i, c] of job.commands.entries()) files[`${job.dir}/cmd/${i + 1}.sh`] = `${c}\n`
  files[`${job.dir}/run.sh`] = [...head,
    '# Runs each command in turn; its exit code goes to out/N.exit, its output to out/N.log.',
    'mkdir -p "$D/out"; echo $$ > "$D/pid"',
    `for i in $(seq 1 ${n}); do`,
    '  echo $i > "$D/current"',
    `  if command -v timeout >/dev/null 2>&1; then timeout -k 10 ${commandSeconds} bash "$D/cmd/$i.sh" > "$D/out/$i.log" 2>&1 < /dev/null; else bash "$D/cmd/$i.sh" > "$D/out/$i.log" 2>&1 < /dev/null; fi`,
    '  echo $? > "$D/out/$i.exit"',
    'done',
    'touch "$D/done"', ''].join('\n')
  files[`${job.dir}/wait.sh`] = [...head,
    `# Waits up to ${waitSeconds}s for the job, printing progress each minute. Run it again while it says ${STILL_RUNNING}.`,
    `n=${n}; end=$((SECONDS + ${waitSeconds})); next=0`,
    'finished() { ls "$D/out/" 2>/dev/null | grep -c "\\.exit$"; }',
    'while [ ! -e "$D/done" ] && [ $SECONDS -lt $end ]; do',
    '  pid=$(cat "$D/pid" 2>/dev/null)',
    `  if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null && [ ! -e "$D/done" ]; then echo "${JOB_STOPPED}: the job's process is gone after $(finished)/$n command(s)."; exit 0; fi`,
    '  if [ $SECONDS -ge $next ]; then cur=$(cat "$D/current" 2>/dev/null); echo "$(finished)/$n finished${cur:+; running $cur: $(head -c 100 "$D/cmd/$cur.sh" | tr "\\n" " ")}"; next=$((SECONDS + 60)); fi',
    '  sleep 2',
    'done',
    `if [ -e "$D/done" ]; then echo "${JOB_DONE}: $n command(s) finished."; else echo "${STILL_RUNNING}: $(finished)/$n finished. Run this same command again."; fi`, ''].join('\n')
  return files
}

// The command that starts the job detached from the tool's own process.
export const startArgv = (root: string, job: Job) => ['bash', '-c', 'setsid nohup bash "$1" > /dev/null 2>&1 < /dev/null &', 'start', `${root}/${job.dir}/run.sh`]

export function runnerBrief(root: string, job: Job, label: string): string {
  return [`You are a Triad runner for: ${label}. Your only job is to wait for a job that is already running.`,
    '',
    `Run this exact command with the Bash tool, with timeout 600000: \`bash ${root}/${job.dir}/wait.sh\``,
    `- If its output ends with "${STILL_RUNNING}", run the same command again. Repeat until it prints "${JOB_DONE}" or "${JOB_STOPPED}".`,
    '- Run no other command and use no other tool. Do not read, judge or fix anything: Triad reads the results itself.',
    '',
    'Then reply with exactly:',
    'status: done',
    `summary: the job printed ${JOB_DONE} (or ${JOB_STOPPED})`,
    'changes: none',
    'verify: none'].join('\n')
}

// Only the wait script of a job, run by its runner, is allowed without asking.
export function isWaitCommand(command: string, root: string): boolean {
  const m = command.trim().match(/^bash\s+(\S+)$/)
  if (!m) return false
  const path = m[1]!.replace(/^'(.*)'$/, '$1')
  return new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\.triad/run/[\\w-]+/wait\\.sh$`).test(path)
}

// Whether every command has an exit code, and the results (a command that never
// finished reads as exit 124).
export async function readJob(io: Io, job: Job): Promise<{ done: boolean; results: RunResult[] }> {
  const results: RunResult[] = []
  let done = true
  for (const i of job.commands.keys()) {
    const code = (await io.read(`${job.dir}/out/${i + 1}.exit`))?.trim()
    const log = ((await io.read(`${job.dir}/out/${i + 1}.log`)) ?? '').slice(-8000)
    if (code === undefined || !/^\d+$/.test(code)) { done = false; results.push({ exitCode: 124, stdout: log, stderr: '\ndid not finish: the job stopped before this command ended' }); continue }
    results.push({ exitCode: Number(code), stdout: log, stderr: code === '124' ? `\nstopped after ${COMMAND_SECONDS}s` : '' })
  }
  return { done, results }
}
