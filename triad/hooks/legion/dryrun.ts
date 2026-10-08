// --dry-run: a deterministic prerequisite report with no side effects and no
// model (port of Legion's scripts/dry-run-report.js, extended to retro, ship
// and polish). Exit code 0 when every check passes, 2 when one fails, 1 for a
// command it does not know.
import { pad2 } from './planning.ts'
import type { Io } from './io.ts'

export const DRY_RUN_COMMANDS = ['plan', 'build', 'review', 'status', 'retro', 'ship', 'polish'] as const
export type DryRunReport = {
  command: string; dryRun: true; deterministic: true; noSideEffects: true; phase: number | null
  checks: { label: string; ok: boolean; detail: string }[]
  features: string[]; plannedActions: string[]; success: boolean; exitCode: 0 | 1 | 2
}

const phaseFromState = (s?: string) => Number(s?.match(/Phase:\s*\**\s*(\d+)/i)?.[1] ?? 1)

async function phaseDir(io: Io, n: number): Promise<string | undefined> {
  const d = (await io.list('.planning/phases')).find(e => e.dir && e.name.startsWith(`${pad2(n)}-`))
  return d ? `.planning/phases/${d.name}` : undefined
}

// Triad features that would join the run (Legion listed conditional skills).
async function features(io: Io, command: string, state: string, roadmap: string): Promise<string[]> {
  const f: string[] = []
  if ((await io.read('.planning/memory/OUTCOMES.md')) !== undefined) f.push('memory')
  if ((await io.read('.planning/CODEBASE.md')) !== undefined && ['plan', 'build', 'status'].includes(command)) f.push('codebase map')
  if (state.includes('## GitHub')) f.push('github sync')
  if ((command === 'plan' && /MKT-|marketing|DSN-|design/i.test(roadmap)) || command === 'review') f.push('domain conventions')
  return f.sort()
}

export async function dryRunReport(io: Io, command: string, phase?: number, target?: string): Promise<DryRunReport> {
  const r: DryRunReport = { command, dryRun: true, deterministic: true, noSideEffects: true, phase: null, checks: [], features: [], plannedActions: [], success: false, exitCode: 1 }
  if (!(DRY_RUN_COMMANDS as readonly string[]).includes(command)) {
    r.checks.push({ label: `known command`, ok: false, detail: `dry-run supports ${DRY_RUN_COMMANDS.join(', ')}` })
    return r
  }
  const project = await io.read('.planning/PROJECT.md')
  const roadmap = await io.read('.planning/ROADMAP.md')
  const state = await io.read('.planning/STATE.md')
  const check = (label: string, ok: boolean, detail: string) => r.checks.push({ label, ok, detail })
  const files = async (n: number, suffix: string) => {
    const d = await phaseDir(io, n)
    return { d, list: d ? (await io.list(d)).map(f => f.name).filter(f => f.endsWith(suffix)) : [] }
  }
  r.features = await features(io, command, state ?? '', roadmap ?? '')
  const base = () => {
    check('PROJECT.md exists', !!project, '.planning/PROJECT.md')
    check('ROADMAP.md exists', !!roadmap, '.planning/ROADMAP.md')
    check('STATE.md exists', !!state, '.planning/STATE.md')
    r.phase = phase ?? phaseFromState(state)
  }
  switch (command) {
    case 'status':
      check('PROJECT.md exists', !!project, '.planning/PROJECT.md')
      check('ROADMAP.md readable (optional for routing depth)', !!roadmap, '.planning/ROADMAP.md')
      check('STATE.md readable (optional for routing depth)', !!state, '.planning/STATE.md')
      r.phase = phase ?? phaseFromState(state)
      r.plannedActions.push('Render the progress dashboard from the planning files.', 'Route to the next /triad: command without writing files.')
      // the two optional reads do not fail status
      r.success = !!project
      r.exitCode = r.success ? 0 : 2
      return r
    case 'plan': {
      base()
      const h = `### Phase ${r.phase}:`
      check(`ROADMAP contains ${h}`, !!roadmap?.includes(h), h)
      r.plannedActions.push('Read the phase context and decompose it into wave-structured plans.', 'Write the plans, critique them in code, and refine up to twice.')
      break
    }
    case 'build': {
      base()
      const { d, list } = await files(r.phase!, '-PLAN.md')
      check(`Phase ${r.phase} directory exists`, !!d, d ?? 'missing phase directory')
      check('Plan files discovered', list.length > 0, `${list.length} plan file(s)`)
      r.plannedActions.push('Build the wave dependency map from the phase plan files.', 'Run each wave in parallel, verify, write summaries and commit.')
      break
    }
    case 'review':
    case 'retro': {
      base()
      const { d, list } = await files(r.phase!, '-SUMMARY.md')
      check(`Phase ${r.phase} directory exists`, !!d, d ?? 'missing phase directory')
      check('Execution summaries discovered', list.length > 0, `${list.length} summary file(s)`)
      r.plannedActions.push(...(command === 'review'
        ? ['Select the review panel (classic or panel).', 'Run the review cycle: reviewers, triage, fixes, re-review.']
        : ['Read the phase summaries, review and outcomes.', 'Write the retrospective and action items to .planning/memory/RETRO.md.']))
      break
    }
    case 'ship': {
      base()
      const { d, list } = await files(r.phase!, '-SUMMARY.md')
      check(`Phase ${r.phase} directory exists`, !!d, d ?? 'missing phase directory')
      check('Execution summaries discovered', list.length > 0, `${list.length} summary file(s)`)
      const row = roadmap?.split('\n').find(l => new RegExp(`^\\|\\s*${r.phase}\\b`).test(l)) ?? ''
      check('Review passed', /\|\s*(complete|shipped)\b/i.test(row) || /review passed/i.test(state ?? ''), row.trim() || 'no ROADMAP progress row')
      r.plannedActions.push('Run the six pre-ship gates and write the ship report.', 'Publish by PR, push or mark after the user chooses.')
      break
    }
    case 'polish': {
      r.phase = phase ?? (state ? phaseFromState(state) : null)
      if (target) check('Target given', true, target)
      else {
        const { d, list } = r.phase ? await files(r.phase, '-PLAN.md') : { d: undefined, list: [] }
        check('Phase plans to scope from', list.length > 0, d ? `${list.length} plan file(s) in ${d}` : 'no target and no phase plans')
      }
      r.plannedActions.push('Resolve the polish scope and take the test and type-check baseline.', 'Run the four polish passes and revert on a regression.')
      break
    }
  }
  r.success = r.checks.every(c => c.ok)
  r.exitCode = r.success ? 0 : 2
  return r
}

export function renderDryRun(r: DryRunReport): string {
  return [
    `Dry run: /triad:${r.command}${r.phase ? ` (phase ${r.phase})` : ''} — ${r.success ? 'READY' : 'NOT READY'} (exit ${r.exitCode})`,
    '', '| Check | Result | Detail |', '|-------|--------|--------|',
    ...r.checks.map(c => `| ${c.label} | ${c.ok ? 'PASS' : 'FAIL'} | ${c.detail} |`),
    '', `Features: ${r.features.join(', ') || 'none'}`,
    'Would do:', ...r.plannedActions.map(a => `- ${a}`),
    '', 'No files were written and no agents were spawned.',
  ].join('\n')
}
