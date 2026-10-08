// Bundles triad/tests/fixtures/** into tests/fixtures/index.ts: `claude plugin
// test` runs without fs, so the parity tests import their fixtures. Run after
// changing a fixture; release-check fails while the bundle is stale.
//
//   bun triad/scripts/bundle-fixtures.ts
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixtureBundle } from './checks.ts'
import { FIXTURE_DIR, fixtureFiles } from './files.ts'

const files = fixtureFiles()
writeFileSync(join(FIXTURE_DIR, 'index.ts'), fixtureBundle(files))
console.log(`bundled ${Object.keys(files).length} fixture files into tests/fixtures/index.ts`)
