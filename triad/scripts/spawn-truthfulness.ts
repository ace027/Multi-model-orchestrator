// Commands that say they spawn agents must name how: an Agent( call, a triad
// agent type, persona_run or a spawning tool. Exits 1 on any untruthful file.
//
//   bun triad/scripts/spawn-truthfulness.ts [commands-dir | file.md]
import { readFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnProblems } from './checks.ts'
import { TRIAD, markdownFiles } from './files.ts'

const target = process.argv[2] ?? join(TRIAD, 'commands')
let files: Record<string, string>
try {
  files = statSync(target).isDirectory() ? markdownFiles(target) : { [basename(target)]: readFileSync(target, 'utf8') }
} catch (e) {
  console.error(`spawn-truthfulness: cannot read ${target}: ${(e as Error).message}`)
  process.exit(2)
}
const problems = spawnProblems(files)
if (problems.length) {
  console.error(`spawn-truthfulness: ${problems.length} of ${Object.keys(files).length} file(s) fail\n${problems.map(p => `  ${p}`).join('\n')}`)
  process.exit(1)
}
console.log(`spawn-truthfulness: ${Object.keys(files).length} file(s) OK`)
