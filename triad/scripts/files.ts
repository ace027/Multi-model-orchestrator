// File reading for the scripts (bun); checks.ts stays pure for the tests.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TRIAD = join(dirname(fileURLToPath(import.meta.url)), '..')
export const FIXTURE_DIR = join(TRIAD, 'tests', 'fixtures')
export const read = (p: string) => readFileSync(join(TRIAD, p), 'utf8')

export function markdownFiles(dir: string): Record<string, string> {
  return Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => [f, readFileSync(join(dir, f), 'utf8')]))
}

// Every fixture file but the bundle itself, keyed by path under tests/fixtures.
export function fixtureFiles(dir = FIXTURE_DIR): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (relative(dir, p) !== 'index.ts') out[relative(dir, p)] = readFileSync(p, 'utf8')
    }
  }
  walk(dir)
  return out
}
