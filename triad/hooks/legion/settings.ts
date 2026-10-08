// Settings and control modes (workflow-common-core), and the live authority
// check that replaces Legion's after-the-fact scope diff.
import { CONTROL_MODES, SCHEMAS, SETTINGS } from './data.ts'
import { validate } from './schema.ts'
import { parseYaml } from './yaml.ts'
import { overlaps } from './planning.ts'

export type Mode = 'autonomous' | 'guarded' | 'advisory' | 'surgical'
export type Profile = { authority_enforcement: boolean; domain_filtering: boolean; human_approval_required: boolean; file_scope_restriction: boolean; read_only: boolean }
export type Settings = typeof SETTINGS & { control_mode: Mode }

const MODES: Mode[] = ['autonomous', 'guarded', 'advisory', 'surgical']

function merge(base: any, over: any): any {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base
  const out: any = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = base && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v
  return out
}

// settings.json at the project root, over Legion's defaults. A project without
// one is new to Legion's settings, so its commit prefix is triad's.
export function loadSettings(text: string | undefined): { settings: Settings; warnings: string[]; existing: boolean } {
  const warnings: string[] = []
  let user: any
  if (text !== undefined) {
    try {
      user = JSON.parse(text)
    } catch {
      warnings.push('settings.json is not valid JSON; using defaults')
    }
  }
  const existing = !!user && ('control_mode' in user || 'execution' in user || 'review' in user)
  // integrations alone is a settings.json triad wrote (github mode), so it is ours but not Legion's
  if (user && !existing && !('integrations' in user)) user = undefined // some other tool's settings.json
  const settings = merge(SETTINGS, user ?? {}) as Settings
  // Legion fills missing keys from its defaults, so a partial file is valid: check the merged result.
  if (user) for (const e of validate(SCHEMAS.settings, settings)) warnings.push(`settings.json ${e}`)
  if (!user?.execution?.commit_prefix) settings.execution.commit_prefix = existing ? SETTINGS.execution.commit_prefix : 'triad'
  if (!MODES.includes(settings.control_mode)) {
    warnings.push(`control_mode "${settings.control_mode}" is not one of ${MODES.join(', ')}; using guarded`)
    settings.control_mode = 'guarded'
  }
  return { settings, warnings, existing }
}

const GUARDED: Profile = { authority_enforcement: true, domain_filtering: true, human_approval_required: true, file_scope_restriction: false, read_only: false }
const FLAGS = Object.keys(GUARDED) as (keyof Profile)[]

// workflow-common-core Mode Profile Resolution: the project's control-modes.yaml
// profile, its missing flags from the guarded defaults; a mode the file does not
// define is guarded. No file, or one that does not parse: the shipped profiles.
export function resolveProfile(mode: Mode, controlModesYaml?: string): { profile: Profile; warnings: string[] } {
  const warnings: string[] = []
  if (controlModesYaml) {
    let profiles: any
    try { profiles = (parseYaml(controlModesYaml) as any)?.profiles } catch { warnings.push('control-modes.yaml does not parse; using the shipped profiles') }
    if (profiles && typeof profiles === 'object') {
      const p = profiles[mode]
      if (!p || typeof p !== 'object') return { profile: { ...GUARDED }, warnings: [`control_mode '${mode}' not defined in control-modes.yaml; using guarded defaults`] }
      const missing = FLAGS.filter(f => typeof p[f] !== 'boolean')
      if (missing.length) warnings.push(`control-mode profile '${mode}' missing flags: ${missing.join(', ')}. Falling back to guarded defaults for missing flags.`)
      const profile = { ...GUARDED }
      for (const f of FLAGS) if (typeof p[f] === 'boolean') profile[f] = p[f]
      return { profile, warnings }
    }
  }
  const shipped = CONTROL_MODES[mode]
  return { profile: Object.fromEntries(FLAGS.map(f => [f, shipped?.[f] ?? GUARDED[f]])) as Profile, warnings }
}

export const profileOf = (mode: Mode, controlModesYaml?: string): Profile => resolveProfile(mode, controlModesYaml).profile

// Confirmation gates are off only in autonomous mode without human approval.
export type ControlMode = { mode: Mode; profile: Profile; gates: boolean; warnings: string[] }
export async function controlMode(io: { read(rel: string): Promise<string | undefined> }): Promise<ControlMode> {
  const s = loadSettings(await io.read('settings.json'))
  const mode = s.settings.control_mode
  const r = resolveProfile(mode, await io.read('.planning/config/control-modes.yaml'))
  return { mode, profile: r.profile, gates: !(mode === 'autonomous' && !r.profile.human_approval_required), warnings: [...s.warnings, ...r.warnings] }
}

const onOff = (b: boolean) => (b ? 'on' : 'off')
export const controlModeLine = (c: ControlMode) =>
  `Control mode: ${c.mode} (authority ${onOff(c.profile.authority_enforcement)}, domain filtering ${onOff(c.profile.domain_filtering)}, human approval ${onOff(c.profile.human_approval_required)}, file scope restriction ${onOff(c.profile.file_scope_restriction)}, read-only ${onOff(c.profile.read_only)}); confirmation gates ${c.gates ? 'on' : 'off (autonomous: skip them and take their defaults)'}.${c.warnings.length ? ` Warnings: ${c.warnings.join('; ')}` : ''}`

// profile: the mode's resolved flags (else the shipped ones); active: the
// co-agents whose authority the brief lists (a review panel).
export type Scope = { planId: string; mode: Mode; files_modified: string[]; files_forbidden: string[]; profile?: Profile; active?: string[] }
export type Decision = { action: 'allow' | 'warn' | 'log' | 'deny'; reason?: string }

// A write by an agent working a plan, outside its files_modified or into its
// files_forbidden (SPEC section 10), decided by the profile's flags: read_only
// refuses every write (advisory agents return suggestions), file_scope_restriction
// refuses out-of-scope ones (the executor reverts what got through another way),
// otherwise they warn (advisory: logged). Autonomous (user decision D4) only
// warns, logged and never blocked. Warned and logged writes become escalations.
export function checkWrite(rel: string, s: Scope): Decision {
  if (rel.startsWith('.triad/')) return { action: 'allow' }
  const p = s.profile ?? profileOf(s.mode)
  const auto = s.mode === 'autonomous'
  if (p.read_only && !auto) return { action: 'deny', reason: `control mode ${s.mode} is read-only: do not write ${rel}. Put the change in your answer as a suggestion (path, what, why) instead.` }
  const forbidden = s.files_forbidden.find(f => overlaps(rel, f))
  const outside = !s.files_modified.some(f => overlaps(rel, f))
  if (!forbidden && !outside) return { action: 'allow' }
  const why = forbidden ? `${rel} is in files_forbidden of plan ${s.planId} (${forbidden})` : `${rel} is not in files_modified of plan ${s.planId}`
  if (p.file_scope_restriction && !auto) return { action: 'deny', reason: `${why}. Control mode ${s.mode}: return status blocked, naming the file the plan needs.` }
  if (s.mode === 'advisory') return { action: 'log', reason: why }
  return { action: 'warn', reason: `${why}. Allowed under control mode ${s.mode} and recorded as an escalation; stay inside the plan's files unless the task cannot be done otherwise.` }
}
