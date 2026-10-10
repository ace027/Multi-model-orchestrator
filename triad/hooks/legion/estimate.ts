// Cost estimate per phase, before anything is built (/triad:auto --estimate).
// Rates are fitted to the measured live runs in docs/results.md: the Tron
// workflow (2-3 plans a phase, full process: plan about $0.65, build $0.35-0.60,
// review $0.55-0.80 a phase) and the light-process converter run (2 plans,
// $0.77 for start, plan, build and review). Estimates, not quotes: the range is
// what those runs spread over. Once the user's own runs have recorded what their
// steps cost (StepRecord, kept in the plugin store), the rates scale to match.
import { loadPhase, loadProject, type Io } from './io.ts'
import { isLight, phaseDone } from './planning.ts'

export const RATES = {
  plan: { full: [0.45, 0.1], light: [0.15, 0.05] },
  build: { sonnet: 0.2, opus: 1.2 },
  review: { full: [0.35, 0.15], light: [0.1, 0.05] },
  polish: 0.1,
} as const
export const LOW = 0.6
export const HIGH = 1.6
// Every agent on Opus (option allOpus): the measured all-Opus run cost about
// 1.6x the tiered one outside the builds and 3x on the builds.
const ALL_OPUS = { other: 1.6, build: 3 }

export type StepKind = 'plan' | 'build' | 'review'
export type Shape = { plans: number; opusPlans: number; light: boolean }
// One workflow step's measured cost, with the phase's shape to predict it from.
export type StepRecord = Shape & { project: string; session: string; phase: number; step: StepKind; allOpus?: boolean; usd: number; at: string }
export type Calibration = Record<StepKind, number> & { n: number }

// The phase's plan count and process (phase undefined: the one in STATE.md).
export async function phaseShape(io: Io, phase: number | undefined, lightPlans: number): Promise<(Shape & { phase: number }) | undefined> {
  const p = await loadProject(io)
  const n = phase ?? p.state?.phase
  if (n === undefined || !(n > 0)) return undefined
  const ph = await loadPhase(io, p, n)
  const plans = ph.plans.length
  return { phase: n, plans, opusPlans: ph.plans.filter(x => x.fm.model === 'opus').length, light: isLight(plans, lightPlans) }
}

// The uncalibrated rate for one step (review without polish, which runs apart).
export function predicted(step: StepKind, s: Shape & { allOpus?: boolean }): number {
  const k = s.allOpus ? ALL_OPUS : { other: 1, build: 1 }
  if (step === 'build') return ((s.plans - s.opusPlans) * RATES.build.sonnet + s.opusPlans * RATES.build.opus) * k.build
  const [b, per] = step === 'plan' ? (s.light ? RATES.plan.light : RATES.plan.full) : s.light ? RATES.review.light : RATES.review.full
  return (b + per * s.plans) * k.other
}

// Per step kind: the median of measured over predicted across past phases,
// pulled toward 1 while there are few of them (two count as one half), and
// kept within 0.3x-3x so one odd run cannot swing it far.
export function calibrate(history: StepRecord[] | undefined): Calibration {
  const out: Calibration = { plan: 1, build: 1, review: 1, n: 0 }
  const byPhase = new Map<string, StepRecord & { total: number }>()
  for (const r of history ?? []) {
    if (!r || !(Number(r.usd) > 0) || !(r.plans > 0)) continue
    const key = `${r.project}\0${r.phase}\0${r.step}`
    const seen = byPhase.get(key)
    byPhase.set(key, { ...r, total: (seen?.total ?? 0) + Number(r.usd) })
  }
  for (const step of ['plan', 'build', 'review'] as StepKind[]) {
    const ratios = [...byPhase.values()].filter(r => r.step === step).map(r => r.total / predicted(step, r)).filter(Number.isFinite).sort((a, b) => a - b)
    if (!ratios.length) continue
    const m = ratios.length
    const median = m % 2 ? ratios[(m - 1) / 2]! : (ratios[m / 2 - 1]! + ratios[m / 2]!) / 2
    out[step] = Math.min(3, Math.max(0.3, 1 + (median - 1) * m / (m + 2)))
    out.n += m
  }
  return out
}

export type PhaseEstimate = { phase: number; name: string; plans: number; planned: boolean; opusPlans: number; light: boolean; done: string[]; plan: number; build: number; review: number; total: number }

export async function estimate(io: Io, o: { lightPlans: number; allOpus?: boolean; history?: StepRecord[] }): Promise<{ phases: PhaseEstimate[]; text: string }> {
  const p = await loadProject(io)
  if (!p.roadmap?.rows.length) return { phases: [], text: 'No Legion project here: run /triad:start (or /triad:auto with a goal) first.' }
  const c = calibrate(o.history)
  const phases: PhaseEstimate[] = []
  for (const row of p.roadmap.rows) {
    const ph = await loadPhase(io, p, row.phase)
    const planned = ph.plans.length > 0
    const plans = planned ? ph.plans.length : (row.plans ?? p.roadmap.phases.find(x => x.phase === row.phase)?.plans ?? 2)
    const opusPlans = ph.plans.filter(x => x.fm.model === 'opus').length
    const light = isLight(plans, o.lightPlans)
    const complete = phaseDone(row.status)
    const built = complete || (planned && ph.plans.every(x => ph.summaries[x.id] !== undefined))
    const done = [...(planned ? ['plan'] : []), ...(built ? ['build'] : []), ...(complete ? ['review'] : [])]
    const shape = { plans, opusPlans, light, allOpus: o.allOpus }
    const plan = planned ? 0 : predicted('plan', shape) * c.plan
    const build = built ? 0 : predicted('build', shape) * c.build
    const review = complete ? 0 : predicted('review', shape) * c.review + (light ? 0 : RATES.polish * (o.allOpus ? ALL_OPUS.other : 1))
    phases.push({ phase: row.phase, name: row.name || (p.roadmap.phases.find(x => x.phase === row.phase)?.name ?? ''), plans, planned, opusPlans, light, done, plan, build, review, total: plan + build + review })
  }
  const usd = (n: number) => '$' + n.toFixed(2)
  const range = (n: number) => (n ? `${usd(n * LOW)}–${usd(n * HIGH)}` : '—')
  const total = phases.reduce((n, x) => n + x.total, 0)
  const text = [
    `Estimated cost of what is left${o.allOpus ? ' (allOpus: every agent on Opus)' : ''}:`,
    '',
    '| Phase | Plans | Process | Plan | Build | Review | Phase total (range) |',
    '|-------|-------|---------|------|-------|--------|---------------------|',
    ...phases.map(x => `| ${x.phase}. ${x.name} | ${x.plans}${x.planned ? '' : ' (roadmap)'}${x.opusPlans ? `, ${x.opusPlans} on Opus` : ''} | ${x.light ? 'light' : 'full'} | ${x.done.includes('plan') ? 'done' : usd(x.plan)} | ${x.done.includes('build') ? 'done' : usd(x.build)} | ${x.done.includes('review') ? 'done' : usd(x.review)} | ${usd(x.total)} (${range(x.total)}) |`),
    '',
    `Total: about ${usd(total)}, likely ${range(total)}. ${c.n ? `Rates are calibrated from ${c.n} past steps of your own runs (plan x${c.plan.toFixed(2)}, build x${c.build.toFixed(2)}, review x${c.review.toFixed(2)}); ` : 'Rates are fitted to measured runs (your own runs calibrate them as they finish steps); '}open-ended work (a game AI, tuning) runs over, so plan it with model opus and expect the high end.`,
    total > 0 ? `To cap it: set the option maxProjectSpend (for example ${usd(Math.ceil(total * HIGH))}).` : 'Nothing is left to run.',
  ].join('\n')
  return { phases, text }
}
