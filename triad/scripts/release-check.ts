// Release gate (Legion's release-check, lint-commands, cross-reference and
// context-budget checks). Exits 1 on any problem.
//
//   bun triad/scripts/release-check.ts
//
// Checks: plugin.json version is semver and README.md mentions it; every
// command passes the lint and its byte budget; the orchestrator guide stays in
// its budget (BUDGETS in checks.ts); every mcp__triad__* tool and /triad:*
// command a command names exists; the test fixture bundle matches the fixtures.
import { join } from 'node:path'
import { LEGION_TOOLS } from '../hooks/legion/tools.ts'
import { fixtureBundle, releaseProblems } from './checks.ts'
import { TRIAD, fixtureFiles, markdownFiles, read } from './files.ts'

const problems = releaseProblems({
  pluginJson: read('.claude-plugin/plugin.json'),
  readme: read('README.md'),
  registerTs: read('hooks/register.ts'),
  commands: markdownFiles(join(TRIAD, 'commands')),
  tools: ['delegate_menial', ...LEGION_TOOLS.map(t => t.name)],
})
let bundle = ''
try { bundle = read('tests/fixtures/index.ts') } catch { /* stale below */ }
if (bundle !== fixtureBundle(fixtureFiles())) problems.push('tests/fixtures/index.ts is out of date: run bun triad/scripts/bundle-fixtures.ts')

if (problems.length) {
  console.error(`release-check: ${problems.length} problem(s)\n${problems.map(p => `  ${p}`).join('\n')}`)
  process.exit(1)
}
console.log('release-check: OK')
