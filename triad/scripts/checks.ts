// Release checks as pure functions over file text, so `claude plugin test`
// (no fs) can test them; release-check.ts and spawn-truthfulness.ts read the
// files and call them.
import { splitFrontmatter } from '../hooks/legion/yaml.ts'

// Byte budgets: today's sizes plus headroom. The guide is in every main-loop
// prompt (1,420 bytes at 0.7.1, 1,833 at 0.8.0; the Legion rules and the knowledge index, which
// took it past 3,000 and cost more than Opus alone in the Phase 7 benchmark, now
// ride with /triad:* prompts only); a command file loads when it runs (largest
// plan.md, 6,858 bytes at 0.6.0). Raise a budget only with a reason in the PR.
export const BUDGETS = { guide: 2048, command: 9216 }

const bytes = (s: string) => new TextEncoder().encode(s).length

// Legion's lint-commands for plugin commands: frontmatter with a description,
// an argument-hint when the body takes $ARGUMENTS, no orphan closing tags.
export function lintCommand(file: string, text: string): string[] {
  const out: string[] = []
  const { data, body } = splitFrontmatter(text)
  if (!data) return [`${file}: no YAML frontmatter between --- lines`]
  if (typeof data.description !== 'string' || !data.description.trim()) out.push(`${file}: no description`)
  if (/\$ARGUMENTS\b/.test(body) && (typeof data['argument-hint'] !== 'string' || !data['argument-hint'].trim())) out.push(`${file}: uses $ARGUMENTS but has no argument-hint`)
  for (const m of body.matchAll(/<\/([a-z_]+)>/g)) {
    const open = body.indexOf(`<${m[1]}>`)
    if (open < 0 || open > m.index!) out.push(`${file}: </${m[1]}> has no <${m[1]}> before it`)
  }
  return out
}

export function commandRefs(text: string): { tools: string[]; commands: string[] } {
  return {
    tools: [...new Set([...text.matchAll(/\bmcp__triad__([a-z_]+)/g)].map(m => m[1]!))],
    commands: [...new Set([...text.matchAll(/\/triad:([a-z][a-z-]*)/g)].map(m => m[1]!))],
  }
}

// Every mcp__triad__* tool and /triad:* command a command file names exists.
export function crossRefProblems(commands: Record<string, string>, tools: Iterable<string>): string[] {
  const known = new Set(tools)
  const out: string[] = []
  for (const [file, text] of Object.entries(commands)) {
    const r = commandRefs(text)
    for (const t of r.tools) if (!known.has(t)) out.push(`${file}: mcp__triad__${t} is not a Triad tool`)
    for (const c of r.commands) if (!(`${c}.md` in commands)) out.push(`${file}: /triad:${c} is not a command`)
  }
  return out
}

// Spawn truthfulness (Legion's validate-command-spawn-truthfulness): a command
// that says it spawns agents names the way it spawns them.
export const SPAWN_CLAIM = /\b(?:spawn|dispatch|launch)\b[^.!?\n]{0,80}\b(?:agents?|polymath|specialists?|reviewers?|helpers?|coders?)\b|spawn agent:|takes over the conversation/i
export const SPAWN_MEANS = /\bAgent\s*\(\s*[{"']|\bAgent tool\b|\btriad:triad-(?:coder|helper)\b|\bpersona_run\b|\bdelegate_menial\b|\bmcp__triad__(?:persona_run|build_phase|review_phase|board|polish)\b|adapter\.spawn_agent/

export type SpawnResult = { valid: boolean; exempt?: boolean; reason: string }

export function spawnCheck(text: string): SpawnResult {
  const { data, body } = splitFrontmatter(text)
  if (!SPAWN_CLAIM.test(body)) return { valid: true, exempt: true, reason: 'no spawn language' }
  if (SPAWN_MEANS.test(body)) return { valid: true, reason: 'spawn language with an Agent call, agent type or spawning tool' }
  if (data?.mode === 'inline-persona') return { valid: false, reason: 'mode: inline-persona, but the body claims to spawn an agent without an Agent() call; reword it as inline' }
  return { valid: false, reason: 'claims to spawn an agent but names no Agent( call, triad agent type, persona_run or spawning tool; add one or set mode: inline-persona' }
}

export function spawnProblems(commands: Record<string, string>): string[] {
  return Object.entries(commands).flatMap(([file, text]) => { const r = spawnCheck(text); return r.valid ? [] : [`${file}: ${r.reason}`] })
}

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function guideOf(registerTs: string): string | undefined {
  return registerTs.match(/const ORCHESTRATOR_GUIDE = `([\s\S]*?)`/)?.[1]
}

export type ReleaseInput = { pluginJson: string; readme: string; registerTs: string; commands: Record<string, string>; tools: Iterable<string> }

export function releaseProblems(r: ReleaseInput): string[] {
  const out: string[] = []
  let version: unknown
  try { version = JSON.parse(r.pluginJson).version } catch { out.push('plugin.json is not valid JSON') }
  if (typeof version !== 'string' || !version) out.push('plugin.json has no version')
  else {
    if (!SEMVER.test(version)) out.push(`plugin.json version ${version} is not semver`)
    if (!r.readme.includes(version)) out.push(`README.md does not mention version ${version}`)
  }
  for (const [file, text] of Object.entries(r.commands)) {
    out.push(...lintCommand(file, text))
    if (bytes(text) > BUDGETS.command) out.push(`${file} is ${bytes(text)} bytes; the budget is ${BUDGETS.command}`)
  }
  const guide = guideOf(r.registerTs)
  if (guide === undefined) out.push('register.ts has no ORCHESTRATOR_GUIDE template literal')
  else if (bytes(guide) > BUDGETS.guide) out.push(`ORCHESTRATOR_GUIDE is ${bytes(guide)} bytes; the budget is ${BUDGETS.guide}`)
  out.push(...crossRefProblems(r.commands, r.tools))
  return out
}

// The test fixture bundle (tests run without fs): one module, keyed by path
// under triad/tests/fixtures.
export function fixtureBundle(files: Record<string, string>): string {
  const sorted = Object.keys(files).sort().map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(files[k])},`)
  return `// Generated by triad/scripts/bundle-fixtures.ts from triad/tests/fixtures (Legion's test data, MIT; see triad/LEGION-NOTICE.md). Do not edit.\nexport const FIXTURES: Record<string, string> = {\n${sorted.join('\n')}\n}\n`
}
