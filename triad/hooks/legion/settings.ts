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
  if (user && !existing) user = undefined // some other tool's settings.json
  if (user) for (const e of validate(SCHEMAS.settings, user)) warnings.push(`settings.json ${e}`)
  const settings = merge(SETTINGS, user ?? {}) as Settings
  if (!user?.execution?.commit_prefix) settings.execution.commit_prefix = existing ? SETTINGS.execution.commit_prefix : 'triad'
  if (!MODES.includes(settings.control_mode)) {
    warnings.push(`control_mode "${settings.control_mode}" is not one of ${MODES.join(', ')}; using guarded`)
    settings.control_mode = 'guarded'
  }
  return { settings, warnings, existing }
}

export function profileOf(mode: Mode, controlModesYaml?: string): Profile {
  if (controlModesYaml) {
    try {
      const p = (parseYaml(controlModesYaml) as any)?.profiles?.[mode]
      if (p) return p
    } catch { /* fall back to the shipped profiles */ }
  }
  return CONTROL_MODES[mode]
}

export type Scope = { planId: string; mode: Mode; files_modified: string[]; files_forbidden: string[] }
export type Decision = { action: 'allow' | 'warn' | 'log' | 'deny'; reason?: string }

// A write by an agent working a plan, outside its files_modified or into its
// files_forbidden (SPEC section 10): surgical blocks (and the executor reverts
// what got through another way), guarded warns, advisory logs, autonomous warns
// (logged, never blocked). Warned and logged writes become escalations.
export function checkWrite(rel: string, s: Scope): Decision {
  if (rel.startsWith('.triad/')) return { action: 'allow' }
  const forbidden = s.files_forbidden.find(f => overlaps(rel, f))
  const outside = !s.files_modified.some(f => overlaps(rel, f))
  if (!forbidden && !outside) return { action: 'allow' }
  const why = forbidden ? `${rel} is in files_forbidden of plan ${s.planId} (${forbidden})` : `${rel} is not in files_modified of plan ${s.planId}`
  if (s.mode === 'surgical') return { action: 'deny', reason: `${why}. Control mode surgical: return status blocked, naming the file the plan needs.` }
  if (s.mode === 'advisory') return { action: 'log', reason: why }
  return { action: 'warn', reason: `${why}. Allowed under control mode ${s.mode} and recorded as an escalation; stay inside the plan's files unless the task cannot be done otherwise.` }
}
