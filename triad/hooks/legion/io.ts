// I/O seam for the `.planning/` layer: the mod passes one built on `$.fs` and
// `$.process`; tests pass an in-memory one.
import { findPhaseDir, isPlanFile, pad2, parsePlan, parseRoadmap, parseState, type Plan, type Roadmap, type State } from './planning.ts'
import { loadSettings, type Settings } from './settings.ts'

export type RunResult = { exitCode: number; stdout: string; stderr: string }
export interface Io {
  root: string // the project directory (holds .planning/)
  read(rel: string): Promise<string | undefined>
  write(rel: string, text: string): Promise<void>
  list(rel: string): Promise<{ name: string; dir: boolean }[]> // [] when missing
  run(argv: string[], opts?: { timeoutMs?: number }): Promise<RunResult>
  // Long shell commands (runner.ts): run as a job a runner agent waits on, one
  // result per command. Absent (tests), they run one by one through run.
  long?(commands: string[], label: string): Promise<RunResult[]>
  now(): Date
}

export type Project = {
  hasPlanning: boolean
  project?: string
  roadmapText?: string
  stateText?: string
  roadmap?: Roadmap
  state?: State
  settings: Settings
  settingsWarnings: string[]
  phaseDirs: string[]
}

export async function loadProject(io: Io): Promise<Project> {
  const dirs = await io.list('.planning')
  const s = loadSettings(await io.read('settings.json'))
  const roadmapText = await io.read('.planning/ROADMAP.md')
  const stateText = await io.read('.planning/STATE.md')
  return {
    hasPlanning: dirs.length > 0,
    project: await io.read('.planning/PROJECT.md'),
    roadmapText,
    stateText,
    roadmap: roadmapText === undefined ? undefined : parseRoadmap(roadmapText),
    state: stateText === undefined ? undefined : parseState(stateText),
    settings: s.settings,
    settingsWarnings: s.warnings,
    phaseDirs: (await io.list('.planning/phases')).filter(e => e.dir).map(e => e.name).sort(),
  }
}

export type PhaseFiles = { n: number; dir?: string; rel?: string; files: string[]; plans: Plan[]; summaries: Record<string, string>; context?: string; review?: string }

export async function loadPhase(io: Io, p: Project, n: number): Promise<PhaseFiles> {
  const dir = findPhaseDir(p.phaseDirs, n)
  if (!dir) return { n, files: [], plans: [], summaries: {} }
  const rel = `.planning/phases/${dir}`
  const files = (await io.list(rel)).filter(e => !e.dir).map(e => e.name).sort()
  const plans: Plan[] = []
  for (const f of files.filter(isPlanFile)) plans.push(parsePlan(f, (await io.read(`${rel}/${f}`)) ?? '', n))
  const summaries: Record<string, string> = {}
  for (const f of files.filter(f => /^\d+-\d+-SUMMARY\.md$/.test(f))) summaries[f.replace(/-SUMMARY\.md$/, '')] = (await io.read(`${rel}/${f}`)) ?? ''
  return {
    n, dir, rel, files, plans, summaries,
    context: await io.read(`${rel}/${pad2(n)}-CONTEXT.md`),
    review: await io.read(`${rel}/${pad2(n)}-REVIEW.md`),
  }
}

export const today = (io: Io) => io.now().toISOString().slice(0, 10)
