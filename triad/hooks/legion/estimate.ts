// Cost estimate per phase, before anything is built (/triad:auto --estimate).
// Rates are fitted to the measured live runs in docs/results.md: the Tron
// workflow (2-3 plans a phase, full process: plan about $0.65, build $0.35-0.60,
// review $0.55-0.80 a phase) and the light-process converter run (2 plans,
// $0.77 for start, plan, build and review). Estimates, not quotes: the range is
// what those runs spread over.
import { loadPhase, loadProject, type Io } from './io.ts'
import { isLight } from './planning.ts'

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

export type PhaseEstimate = { phase: number; name: string; plans: number; planned: boolean; opusPlans: number; light: boolean; done: string[]; plan: number; build: number; review: number; total: number }

export async function estimate(io: Io, o: { lightPlans: number; allOpus?: boolean }): Promise<{ phases: PhaseEstimate[]; text: string }> {
  const p = await loadProject(io)
  if (!p.roadmap?.rows.length) return { phases: [], text: 'No Legion project here: run /triad:start (or /triad:auto with a goal) first.' }
  const k = o.allOpus ? ALL_OPUS : { other: 1, build: 1 }
  const phases: PhaseEstimate[] = []
  for (const row of p.roadmap.rows) {
    const ph = await loadPhase(io, p, row.phase)
    const planned = ph.plans.length > 0
    const plans = planned ? ph.plans.length : (row.plans ?? p.roadmap.phases.find(x => x.phase === row.phase)?.plans ?? 2)
    const opusPlans = ph.plans.filter(x => x.fm.model === 'opus').length
    const light = isLight(plans, o.lightPlans)
    const complete = /complete/i.test(row.status)
    const built = complete || (planned && ph.plans.every(x => ph.summaries[x.id] !== undefined))
    const done = [...(planned ? ['plan'] : []), ...(built ? ['build'] : []), ...(complete ? ['review'] : [])]
    const [pb, pp] = light ? RATES.plan.light : RATES.plan.full
    const [rb, rp] = light ? RATES.review.light : RATES.review.full
    const plan = planned ? 0 : (pb + pp * plans) * k.other
    const build = built ? 0 : ((plans - opusPlans) * RATES.build.sonnet + opusPlans * RATES.build.opus) * k.build
    const review = complete ? 0 : (rb + rp * plans + (light ? 0 : RATES.polish)) * k.other
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
    `Total: about ${usd(total)}, likely ${range(total)}. Rates are fitted to measured runs; open-ended work (a game AI, tuning) runs over, so plan it with model opus and expect the high end.`,
    total > 0 ? `To cap it: set the option maxProjectSpend (for example ${usd(Math.ceil(total * HIGH))}).` : 'Nothing is left to run.',
  ].join('\n')
  return { phases, text }
}
