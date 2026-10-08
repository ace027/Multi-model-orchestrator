// /map (codebase-mapper) in code: the file inventory, language and stack
// detection, conventions, complexity and debt, git hotspots, hygiene, import
// graph, test map, routes, config and env names (never values), symbols, the
// retrieval index (index.jsonl, symbols.json, search.md) and directory mappings.
// The narrative sections (architecture, inventory, ownership, risks, guidance,
// patterns, runbook) are the model's; `narrate` puts them into CODEBASE.md.
import { today, type Io } from './io.ts'
import { parseYaml } from './yaml.ts'
import { emitYaml } from './render.ts'

export const MAP_SCHEMA = '2.0'
const STALE_DAYS = 30
export const ARTIFACTS = ['.planning/CODEBASE.md', '.planning/codebase/index.jsonl', '.planning/codebase/symbols.json', '.planning/codebase/search.md', '.planning/config/directory-mappings.yaml']
const EXCLUDE_DIRS = ['.planning', '.claude', '.codex', '.cursor', '.windsurf', '.gemini', '.opencode', '.aider', '.kilo', '.kilocode', '.legion', '.git', '.triad', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor', '.venv', 'venv', '__pycache__', 'coverage', '.next']
const EXCLUDE_FILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.DS_Store)$|\.lock$/
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|swift|kt|c|cc|cpp|h|hpp|cs|php|scala)$/
const MANIFESTS = ['package.json', 'Gemfile', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml']
const BUILD_FILES = ['Makefile', 'Dockerfile', 'docker-compose.yml', 'tsconfig.json']
const MAX_FILES = 3000
const MAX_READ = 200_000

const LANG: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript', py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', swift: 'Swift', c: 'C', h: 'C', cpp: 'C++', cc: 'C++', hpp: 'C++', cs: 'C#', php: 'PHP', scala: 'Scala' }
const ext = (f: string) => f.match(/\.([^./]+)$/)?.[1] ?? ''
const lang = (f: string) => LANG[ext(f)] ?? ''

export type MapFile = { path: string; lines: number; text: string }
export type Symbol = { name: string; kind: string; path: string; line: number }
export type MapData = {
  date: string; generatedAt: string; commit: string; root: string; scope: string; fingerprint: string; fingerprintKind: string
  files: string[]; source: MapFile[]; languages: { ext: string; count: number; pct: number }[]; entryPoints: { type: string; path: string; evidence: string }[]
  stack: { layer: string; technology: string; evidence: string }[]; conventions: Record<string, string>; structure: string
  complexity: { path: string; lines: number; level: string }[]; debt: { density: number; level: string; top: { path: string; count: number }[] }
  hotspots: { path: string; changes: number }[]; hygiene: string[]; imports: { edges: Record<string, string[]>; external: Set<string>; fanOut: [string, number][]; fanIn: [string, number][] }
  tests: { convention: string; files: string[]; ratio: number; level: string; coverage?: { pct: number; source: string }; untested: { path: string; lines: number; fanIn: number; risk: number; level: string }[] }
  routes: { method: string; path: string; file: string }[]; framework: string; config: string[]; env: { name: string; source: string; sensitive: boolean }[]; exposure: string[]
  symbols: Symbol[]; mappings: { category: string; paths: string[]; priority: number; pattern: string }[]; monorepo: string[]; deps: string[]
}

const sh = async (io: Io, cmd: string) => (await io.run(['bash', '-c', cmd]).catch(() => ({ exitCode: 1, stdout: '', stderr: '' })))

async function listFiles(io: Io, scope?: string): Promise<string[]> {
  const prune = EXCLUDE_DIRS.map(d => `-name '${d}'`).join(' -o ')
  const where = scope ? `'${scope.replace(/'/g, '')}'` : '.'
  let r = await sh(io, `git ls-files -co --exclude-standard -- ${where} 2>/dev/null`)
  if (r.exitCode !== 0 || !r.stdout.trim()) r = await sh(io, `find ${where} \\( ${prune} \\) -prune -o -type f -print | sed 's#^\\./##'`)
  return r.stdout.split('\n').map(s => s.trim().replace(/^\.\//, '')).filter(Boolean)
    .filter(f => !f.split('/').some(seg => EXCLUDE_DIRS.includes(seg)) && !EXCLUDE_FILES.test(f)).sort().slice(0, MAX_FILES)
}

export async function isCodebase(io: Io, files?: string[]): Promise<boolean> {
  const fs = files ?? (await listFiles(io))
  return fs.some(f => SOURCE.test(f)) || fs.some(f => MANIFESTS.includes(f) || BUILD_FILES.includes(f) || /^webpack\.config\./.test(f))
}

function fnv(s: string): string {
  // Two 32-bit FNV-1a halves: a stable 16-hex fingerprint without a crypto import.
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c ^ (i & 0xff), 0x01000193) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

// Path, size and content of every source file and root manifest (no mtimes,
// so a fresh checkout of the same tree reads as fresh).
export function fingerprint(files: { path: string; text: string }[]): string {
  return fnv(files.map(f => `${f.path}|${f.text.length}|${fnv(f.text)}`).sort().join('\n'))
}

const IMPORT_RE: [RegExp, RegExp][] = [
  [/\.(ts|tsx|js|jsx|mjs|cjs)$/, /(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\s*\(\s*|^import\s*)['"]([^'"]+)['"]/gm],
  [/\.py$/, /^(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))/gm],
  [/\.go$/, /^\s*(?:import\s+)?"([^"]+)"/gm],
  [/\.rb$/, /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm],
  [/\.rs$/, /^\s*(?:use|extern crate)\s+([\w:]+)/gm],
  [/\.(java|kt)$/, /^import\s+([\w.]+)/gm],
]

const SYMBOL_RE: [RegExp, RegExp, string][] = [
  [/\.(ts|tsx|js|jsx|mjs|cjs)$/, /^export\s+(?:default\s+)?(?:async\s+)?(function|class|const|let|interface|type|enum)\s+(\w+)/gm, ''],
  [/\.py$/, /^(class|def|async def)\s+(\w+)/gm, ''],
  [/\.go$/, /^(func|type)\s+(?:\([^)]*\)\s*)?(\w+)/gm, ''],
  [/\.rb$/, /^\s*(class|module|def)\s+([\w:.]+)/gm, ''],
  [/\.rs$/, /^pub\s+(fn|struct|enum|trait)\s+(\w+)/gm, ''],
  [/\.(java|kt)$/, /^\s*(?:public\s+|private\s+|internal\s+)?(?:data\s+|abstract\s+|final\s+)*(class|interface|fun|object)\s+(\w+)/gm, ''],
]

const TEST_FILE = /(\.(test|spec)\.[a-z]+$)|(^|\/)(__tests__|tests?|spec)\/|(_test\.go$)|(^|\/)test_[^/]+\.py$|_test\.py$|(Test[^/]*\.java$)|([^/]*Test\.java$)|_spec\.rb$/

function resolveImport(from: string, spec: string, files: Set<string>): string | undefined {
  if (from.endsWith('.py')) {
    const mod = spec.replace(/^\.+/, m => '../'.repeat(Math.max(0, m.length - 1)) + (m.length ? './' : '')).replace(/\./g, '/')
    const base = spec.startsWith('.') ? join(dir(from), mod) : mod
    for (const c of [`${base}.py`, `${base}/__init__.py`]) if (files.has(c)) return c
    return undefined
  }
  if (!spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/') && !spec.startsWith('~/')) return undefined
  const base = spec.startsWith('@/') || spec.startsWith('~/') ? `src/${spec.slice(2)}` : join(dir(from), spec)
  for (const c of [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.rb', '.go'].map(e => base + e), ...['/index.ts', '/index.js', '/index.tsx'].map(e => base + e)]) if (files.has(c)) return c
  return undefined
}
const dir = (p: string) => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''
function join(a: string, b: string): string {
  const out: string[] = []
  for (const seg of `${a}/${b}`.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

export async function collect(io: Io, opts: { scope?: string; networkChecks?: boolean } = {}): Promise<MapData> {
  const files = await listFiles(io, opts.scope)
  const fileSet = new Set(files)
  const source: MapFile[] = []
  for (const path of files.filter(f => SOURCE.test(f))) {
    const text = ((await io.read(path)) ?? '').slice(0, MAX_READ)
    source.push({ path, lines: text ? text.split('\n').length : 0, text })
  }
  const manifests: { path: string; text: string }[] = []
  for (const m of [...MANIFESTS, 'package-lock.json', 'poetry.lock', 'Cargo.lock', 'go.sum', 'Gemfile.lock']) {
    const t = await io.read(m)
    if (t !== undefined) manifests.push({ path: m, text: t })
  }
  const now = io.now()
  const commit = (await sh(io, 'git rev-parse --short HEAD 2>/dev/null')).stdout.trim() || 'unknown'

  // Languages (extensions with 2+ files).
  const counts = new Map<string, number>()
  for (const f of source) counts.set(ext(f.path), (counts.get(ext(f.path)) ?? 0) + 1)
  const languages = [...counts].filter(([, c]) => c >= 2 || counts.size === 1).sort((a, b) => b[1] - a[1]).map(([e, c]) => ({ ext: `.${e}`, count: c, pct: Math.round(c / Math.max(1, source.length) * 100) }))

  // Entry points.
  const entryPoints: MapData['entryPoints'] = []
  const pkgText = manifests.find(m => m.path === 'package.json')?.text
  let pkg: any
  try { pkg = pkgText ? JSON.parse(pkgText) : undefined } catch { pkg = undefined }
  if (pkg) for (const k of ['main', 'module']) if (pkg[k]) entryPoints.push({ type: 'Node', path: pkg[k], evidence: `package.json ${k}` })
  if (pkg?.bin) for (const [n, p] of Object.entries(typeof pkg.bin === 'string' ? { [pkg.name ?? 'bin']: pkg.bin } : pkg.bin)) entryPoints.push({ type: 'Node CLI', path: String(p), evidence: `package.json bin ${n}` })
  if (pkg?.scripts?.start) entryPoints.push({ type: 'Node', path: '-', evidence: `scripts.start: ${pkg.scripts.start}` })
  for (const f of files) {
    const base = f.split('/').pop()!
    if (/^(__main__|manage|app|main|wsgi)\.py$/.test(base)) entryPoints.push({ type: 'Python', path: f, evidence: base })
    else if (/^(config\.ru|Rakefile)$/.test(f) || f === 'bin/rails') entryPoints.push({ type: 'Ruby', path: f, evidence: base })
    else if (f === 'main.go' || /^cmd\/[^/]+\/main\.go$/.test(f)) entryPoints.push({ type: 'Go', path: f, evidence: 'package main' })
    else if (f === 'src/main.rs' || f === 'src/lib.rs') entryPoints.push({ type: 'Rust', path: f, evidence: base })
    else if (/^src\/index\.\w+$|^app\/main\.\w+$/.test(f)) entryPoints.push({ type: 'Generic', path: f, evidence: 'conventional entry file' })
  }
  const pyproject = manifests.find(m => m.path === 'pyproject.toml')?.text ?? ''
  for (const m of pyproject.matchAll(/^\s*([\w-]+)\s*=\s*"([\w.]+):(\w+)"/gm)) if (/\[project\.scripts\]|\[tool\.poetry\.scripts\]/.test(pyproject)) entryPoints.push({ type: 'Python CLI', path: m[2]!.replace(/\./g, '/') + '.py', evidence: `pyproject script ${m[1]}` })

  // Stack: indicator file and a marker in it.
  const stack: MapData['stack'] = []
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) }
  const has = (d: string) => Object.prototype.hasOwnProperty.call(deps, d)
  let framework = ''
  if (pkg) {
    const fw = ['next', 'express', 'fastify', 'react', 'vue', '@angular/core', 'svelte'].find(has)
    framework = fw ? fw.replace('@angular/core', 'angular') : 'Vanilla Node'
    stack.push({ layer: 'Runtime', technology: 'Node.js', evidence: 'package.json' }, { layer: 'Framework', technology: framework, evidence: fw ? `package.json dependency ${fw}` : 'no framework dependency' })
    const t = ['vitest', 'jest', 'mocha', 'cypress', '@playwright/test', 'playwright'].find(has)
    if (t) stack.push({ layer: 'Testing', technology: t, evidence: 'package.json devDependency' })
    if (has('typescript') || fileSet.has('tsconfig.json')) stack.push({ layer: 'Language', technology: 'TypeScript', evidence: fileSet.has('tsconfig.json') ? 'tsconfig.json' : 'typescript dependency' })
  }
  const py = source.filter(f => f.path.endsWith('.py'))
  if (py.length) {
    const reqs = (manifests.find(m => m.path === 'requirements.txt')?.text ?? '') + pyproject
    const all = reqs + py.map(f => f.text.slice(0, 3000)).join('\n')
    const fw = ['django', 'flask', 'fastapi'].find(d => new RegExp(`\\b${d}\\b`, 'i').test(all))
    if (fw) framework ||= fw
    stack.push({ layer: 'Language', technology: 'Python', evidence: `${py.length} .py files` }, ...(fw ? [{ layer: 'Framework', technology: fw, evidence: 'import or requirement' }] : []))
    if (/\bpytest\b/.test(all) || files.some(f => /(^|\/)test_[^/]+\.py$|conftest\.py$/.test(f))) stack.push({ layer: 'Testing', technology: 'pytest', evidence: 'test_*.py / pytest reference' })
    else if (/\bunittest\b/.test(all)) stack.push({ layer: 'Testing', technology: 'unittest', evidence: 'import unittest' })
  }
  const gem = manifests.find(m => m.path === 'Gemfile')?.text
  if (gem) { const fw = ['rails', 'sinatra'].find(d => gem.includes(`'${d}'`) || gem.includes(`"${d}"`)); if (fw) framework ||= fw; stack.push({ layer: 'Framework', technology: fw ?? 'Ruby', evidence: 'Gemfile' }) }
  const gomod = manifests.find(m => m.path === 'go.mod')?.text
  if (gomod) { const fw = ['gin-gonic/gin', 'labstack/echo', 'gorilla/mux'].find(d => gomod.includes(d)); if (fw) framework ||= fw; stack.push({ layer: 'Language', technology: 'Go', evidence: 'go.mod' }, ...(fw ? [{ layer: 'Framework', technology: fw, evidence: 'go.mod' }] : [])) }
  const cargo = manifests.find(m => m.path === 'Cargo.toml')?.text
  if (cargo) { const fw = ['actix-web', 'rocket', 'tokio'].find(d => cargo.includes(d)); stack.push({ layer: 'Language', technology: 'Rust', evidence: 'Cargo.toml' }, ...(fw ? [{ layer: 'Framework', technology: fw, evidence: 'Cargo.toml' }] : [])) }
  if (!stack.length && source.length) stack.push({ layer: 'Language', technology: `Custom / Unknown (primary extensions: ${languages.slice(0, 3).map(l => l.ext).join(', ')})`, evidence: 'file extensions' })

  // Structure and conventions.
  const dirs = new Set(files.flatMap(f => f.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))))
  const names = new Set([...dirs].map(d => d.split('/').pop()!))
  const monorepo = files.filter(f => /(^|\/)(package\.json|go\.mod|Cargo\.toml|pyproject\.toml)$/.test(f) && f.includes('/')).map(dir)
  const structure = (monorepo.length >= 2 || names.has('packages') || names.has('apps') || pkg?.workspaces) ? 'Monorepo'
    : ['controllers', 'models', 'views'].every(n => names.has(n)) ? 'MVC'
    : ['domain', 'application', 'infrastructure'].every(n => names.has(n)) ? 'Clean architecture'
    : names.has('api') && names.has('services') && (names.has('repositories') || names.has('data')) ? 'Layered'
    : ['components', 'modules', 'features'].some(n => names.has(n)) ? 'Component-based' : 'Flat'
  const sample = source.slice(0, 10).map(f => f.path.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/\.(test|spec)$/, ''))
  const style = (n: string) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(n) ? 'kebab-case' : /^[a-z0-9]+(_[a-z0-9]+)+$/.test(n) ? 'snake_case' : /^[A-Z][A-Za-z0-9]+$/.test(n) ? 'PascalCase' : /^[a-z]+[A-Z]\w*$/.test(n) ? 'camelCase' : /^[a-z0-9]+$/.test(n) ? 'lowercase' : 'mixed'
  const styles = new Map<string, number>()
  for (const n of sample) styles.set(style(n), (styles.get(style(n)) ?? 0) + 1)
  const naming = [...styles].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'n/a'
  const testFiles = files.filter(f => TEST_FILE.test(f))
  const colocated = testFiles.filter(f => !/(^|\/)(__tests__|tests?|spec)\//.test(f)).length
  const lint = ['.eslintrc', 'eslint.config', '.prettierrc', 'prettier.config', '.rubocop.yml', '.editorconfig', 'ruff.toml', '.flake8'].filter(n => files.some(f => f.split('/').pop()!.startsWith(n)))
  if (/\[tool\.(black|ruff)\]/.test(pyproject)) lint.push(pyproject.match(/\[tool\.(black|ruff)\]/)![1]!)
  const importStyle = source.some(f => /from\s+['"]@\//.test(f.text)) ? 'path aliases (@/)' : files.some(f => /(^|\/)index\.(ts|js)$/.test(f)) ? 'barrel files (index)' : source.some(f => /from\s+['"]\.\.?\//.test(f.text) || /^from\s+\./m.test(f.text)) ? 'relative' : 'package / absolute'
  const conventions = {
    'File naming': naming, 'Module structure': structure,
    'Config location': [files.some(f => f.startsWith('.env')) ? '.env files' : '', dirs.has('config') ? 'config/' : '', files.some(f => /\.config\.\w+$/.test(f)) ? '*.config files' : ''].filter(Boolean).join(', ') || 'none detected',
    'Test approach': testFiles.length ? `${colocated > testFiles.length / 2 ? 'co-located' : 'separate test directories'} (${testFiles.length} test files)` : 'no tests detected',
    'Import style': importStyle, 'Linting/formatting': lint.join(', ') || 'none detected',
  }

  // Complexity and debt.
  const prod = source.filter(f => !TEST_FILE.test(f.path))
  const complexity = [...prod].sort((a, b) => b.lines - a.lines).slice(0, 5).map(f => ({ path: f.path, lines: f.lines, level: f.lines > 500 ? 'HIGH' : f.lines >= 200 ? 'MEDIUM' : 'LOW' }))
  const debtFiles = source.map(f => ({ path: f.path, count: (f.text.match(/\b(TODO|FIXME|HACK|XXX)\b/g) ?? []).length })).filter(x => x.count)
  const density = debtFiles.reduce((s, x) => s + x.count, 0) / Math.max(1, source.length)
  const debt = { density: Math.round(density * 100) / 100, level: density > 1 ? 'HIGH' : density >= 0.3 ? 'MEDIUM' : 'LOW', top: debtFiles.sort((a, b) => b.count - a.count).slice(0, 5) }

  // Git hotspots (90 days, 10+ commits).
  const log = await sh(io, 'git log --since="90 days ago" --name-only --format="@@" 2>/dev/null')
  const hot = new Map<string, number>()
  const commits = (log.stdout.match(/^@@$/gm) ?? []).length
  for (const l of log.stdout.split('\n')) if (l.trim() && l !== '@@' && fileSet.has(l.trim())) hot.set(l.trim(), (hot.get(l.trim()) ?? 0) + 1)
  const hotspots = commits >= 10 ? [...hot].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([path, changes]) => ({ path, changes })) : []

  // Hygiene.
  const hygiene: string[] = []
  const lockFor: Record<string, string[]> = { 'package.json': ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'], 'Gemfile': ['Gemfile.lock'], 'Cargo.toml': ['Cargo.lock'], 'go.mod': ['go.sum'], 'pyproject.toml': ['poetry.lock', 'uv.lock', 'requirements.txt'] }
  for (const [m, locks] of Object.entries(lockFor)) if (manifests.some(x => x.path === m) && !locks.some(l => manifests.some(x => x.path === l) || fileSet.has(l))) hygiene.push(`${m} has no lockfile`)
  if (!fileSet.has('.gitignore')) hygiene.push('no .gitignore')
  if (!files.some(f => /^(\.github\/workflows\/|\.gitlab-ci\.yml|Jenkinsfile|\.circleci\/|\.travis\.yml)/.test(f))) hygiene.push('no CI configuration')
  if (!files.some(f => /^README/i.test(f))) hygiene.push('no README')

  // Import graph.
  const edges: Record<string, string[]> = {}
  const external = new Set<string>()
  for (const f of source) {
    const rule = IMPORT_RE.find(([re]) => re.test(f.path))
    if (!rule) continue
    for (const m of f.text.matchAll(rule[1])) {
      const spec = m[1] ?? m[2]
      if (!spec) continue
      const target = resolveImport(f.path, spec, fileSet)
      if (target) (edges[f.path] ??= []).includes(target) || edges[f.path]!.push(target)
      else if (!spec.startsWith('.')) external.add(spec.split('/')[0]!.split('.')[0]!)
    }
  }
  const fanInMap = new Map<string, number>()
  for (const ts of Object.values(edges)) for (const t of ts) fanInMap.set(t, (fanInMap.get(t) ?? 0) + 1)
  const fanOut = Object.entries(edges).map(([k, v]) => [k, v.length] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const fanIn = [...fanInMap].sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Test map.
  const conventionsT: [string, RegExp][] = [['*.test.* / *.spec.*', /\.(test|spec)\.[a-z]+$/], ['__tests__/', /(^|\/)__tests__\//], ['test_*.py / *_test.py', /(^|\/)test_[^/]+\.py$|_test\.py$/], ['tests/ or test/ directory', /(^|\/)tests?\//], ['*_test.go', /_test\.go$/], ['*Test.java', /Test[^/]*\.java$|[^/]*Test\.java$/], ['spec/*_spec.rb', /_spec\.rb$/]]
  const dominant = conventionsT.map(([n, re]) => [n, testFiles.filter(f => re.test(f)).length] as [string, number]).sort((a, b) => b[1] - a[1])[0]
  const stem = (p: string) => p.split('/').pop()!.replace(/\.[^.]+$/, '').replace(/^test_|_test$|\.(test|spec)$|_spec$|Test$|^Test/g, '').toLowerCase()
  const testStems = new Set(testFiles.map(stem))
  const testText = testFiles.map(t => source.find(s => s.path === t)?.text ?? '').join('\n')
  const tested = (p: string) => testStems.has(stem(p)) || testText.includes(stem(p))
  const sampled = prod.slice(0, Math.max(10, prod.length)).slice(0, 10)
  const ratio = sampled.length ? sampled.filter(f => tested(f.path)).length / sampled.length : 0
  let coverage: MapData['tests']['coverage']
  const cs = await io.read('coverage/coverage-summary.json')
  if (cs) { try { coverage = { pct: Number(JSON.parse(cs).total.lines.pct), source: 'coverage/coverage-summary.json' } } catch { /* unreadable */ } }
  const lcov = coverage ? undefined : (await io.read('coverage/lcov.info')) ?? (await io.read('lcov.info'))
  if (lcov) { const lh = [...lcov.matchAll(/^LH:(\d+)/gm)].reduce((s, m) => s + Number(m[1]), 0); const lf = [...lcov.matchAll(/^LF:(\d+)/gm)].reduce((s, m) => s + Number(m[1]), 0); if (lf) coverage = { pct: Math.round(lh / lf * 1000) / 10, source: 'lcov.info' } }
  const cob = coverage ? undefined : (await io.read('coverage.xml'))
  if (cob) { const m = cob.match(/<coverage[^>]*line-rate="([\d.]+)"/); if (m) coverage = { pct: Math.round(Number(m[1]) * 1000) / 10, source: 'coverage.xml' } }
  const untested = prod.filter(f => !tested(f.path)).map(f => {
    const fi = fanInMap.get(f.path) ?? 0
    const risk = Math.round((fi * 10 + f.lines / 100) * 10) / 10
    return { path: f.path, lines: f.lines, fanIn: fi, risk, level: risk >= 30 ? 'CRITICAL' : risk >= 10 ? 'HIGH' : risk > 0 ? 'MEDIUM' : 'LOW' }
  }).sort((a, b) => b.risk - a.risk).slice(0, 5)
  const level = coverage ? (coverage.pct >= 80 ? 'HIGH' : coverage.pct >= 50 ? 'MEDIUM' : 'LOW') : ratio >= 0.8 ? 'HIGH' : ratio >= 0.4 ? 'MEDIUM' : 'LOW'

  // Routes.
  const routes: MapData['routes'] = []
  const ROUTE: RegExp[] = [/\b(?:app|router|server|fastify)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)/g, /@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)/g, /\.(GET|POST|PUT|DELETE|PATCH)\s*\(\s*"([^"]+)/g, /http\.HandleFunc\s*\(\s*"([^"]+)"/g]
  for (const f of source) for (const re of ROUTE) for (const m of f.text.matchAll(re)) routes.push({ method: m[2] ? m[1]!.toUpperCase() : 'ANY', path: m[2] ?? m[1]!, file: f.path })
  for (const f of files) {
    const nx = f.match(/^(?:src\/)?app\/(.*)\/route\.(ts|js)$/) ?? f.match(/^(?:src\/)?pages\/api\/(.*)\.(ts|js)$/)
    if (nx) routes.push({ method: 'ANY', path: `/${nx[1]!.replace(/^api\//, 'api/')}`.replace(/^\/(?!api)/, '/api/'), file: f })
    if (/(^|\/)urls\.py$/.test(f)) for (const m of (source.find(s => s.path === f)?.text ?? '').matchAll(/path\s*\(\s*['"]([^'"]*)['"]/g)) routes.push({ method: 'ANY', path: `/${m[1]}`, file: f })
  }

  // Config and environment (names only).
  const config = files.filter(f => /(^|\/)\.env[^/]*$|\.config\.(ts|js|json|ya?ml|mjs|cjs)$|(^|\/)tsconfig[^/]*\.json$|(^|\/)Dockerfile[^/]*$|docker-compose[^/]*\.ya?ml$|^\.github\/workflows\//.test(f))
  const SENS = /SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL|API_KEY|PRIVATE|AUTH/
  const envMap = new Map<string, string>()
  const ENV: RegExp[] = [/process\.env\.([A-Z_][A-Z0-9_]*)/g, /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, /os\.(?:environ\.get|getenv)\(\s*['"]([A-Z_][A-Z0-9_]*)['"]/g, /os\.environ\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, /ENV\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g, /os\.Getenv\(\s*"([A-Z_][A-Z0-9_]*)"/g]
  for (const f of source) for (const re of ENV) for (const m of f.text.matchAll(re)) if (!envMap.has(m[1]!)) envMap.set(m[1]!, f.path)
  const example = (await io.read('.env.example')) ?? ''
  for (const m of example.matchAll(/^([A-Z_][A-Z0-9_]*)=/gm)) if (!envMap.has(m[1]!)) envMap.set(m[1]!, '.env.example')
  const env = [...envMap].map(([name, src]) => ({ name, source: src, sensitive: SENS.test(name) })).sort((a, b) => a.name.localeCompare(b.name))
  const exposure: string[] = []
  const tracked = await sh(io, 'git ls-files .env 2>/dev/null')
  if (tracked.stdout.trim()) exposure.push('HIGH: .env is tracked by git')
  for (const f of source) if (/(key|secret|token|password)\w*\s*[:=]\s*['"][A-Za-z0-9_\-+/]{20,}['"]/i.test(f.text)) exposure.push(`MEDIUM: ${f.path} has a long literal assigned to a key/secret/token name (value not shown)`)
  const gi = (await io.read('.gitignore')) ?? ''
  if (fileSet.has('.gitignore') && !/^\.env\b/m.test(gi) && files.some(f => f.startsWith('.env'))) exposure.push('MEDIUM: .gitignore does not ignore .env')

  // Symbols.
  const symbols: Symbol[] = []
  for (const f of source) {
    const rule = SYMBOL_RE.find(([re]) => re.test(f.path))
    if (!rule) continue
    for (const m of f.text.matchAll(rule[1])) {
      const name = m[2]!
      if (f.path.endsWith('.py') && name.startsWith('_') && !name.startsWith('__')) continue
      symbols.push({ name, kind: m[1]!.replace('async def', 'def'), path: f.path, line: f.text.slice(0, m.index).split('\n').length })
    }
  }

  // Directory mappings.
  const CATS: [string, RegExp, number][] = [['tests', /^(tests?|spec|__tests__)$/, 10], ['routes', /^(routes|api|controllers|handlers)$/, 10], ['components', /^(components|ui|widgets)$/, 10], ['pages', /^(pages|views|screens|app)$/, 10], ['services', /^services?$/, 5], ['utils', /^(utils|helpers|lib|common)$/, 5], ['types', /^(types|interfaces|models|schemas)$/, 5], ['config', /^(config|settings|conf)$/, 5], ['middleware', /^middlewares?$/, 5], ['assets', /^(assets|static|public)$/, 5], ['styles', /^(styles|css|scss)$/, 5], ['hooks', /^hooks$/, 5], ['stores', /^(stores?|state|redux)$/, 5], ['scripts', /^(scripts|bin|tools)$/, 5], ['docs', /^docs?$/, 5]]
  const mappings: MapData['mappings'] = []
  for (const [category, re, priority] of CATS) {
    const paths = [...dirs].filter(d => d.split('/').length <= 3 && re.test(d.split('/').pop()!)).sort((a, b) => files.filter(f => f.startsWith(b + '/')).length - files.filter(f => f.startsWith(a + '/')).length)
    if (paths.length) mappings.push({ category, paths: paths.slice(0, 3), priority, pattern: `${paths[0]}/**` })
  }
  const pkgSource = source.filter(f => !f.path.includes('/')).length && !mappings.length ? [{ category: 'source', paths: ['.'], priority: 1, pattern: '*' }] : []
  mappings.push(...pkgSource)

  const scopeLabel = opts.scope ?? 'project-root'
  return {
    date: today(io), generatedAt: now.toISOString().replace(/\.\d+Z$/, 'Z'), commit, root: io.root, scope: scopeLabel,
    fingerprint: fingerprint([...source, ...manifests]), fingerprintKind: 'content', files, source, languages, entryPoints, stack, conventions, structure,
    complexity, debt, hotspots, hygiene, imports: { edges, external, fanOut, fanIn }, tests: { convention: dominant && dominant[1] ? dominant[0] : '', files: testFiles, ratio, level, coverage, untested },
    routes, framework, config, env, exposure, symbols, mappings, monorepo: [...new Set(monorepo)], deps: Object.keys(pkg?.dependencies ?? {}),
  }
}

const table = (head: string[], rows: (string | number)[][], empty = '_None detected_') => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(h => '-'.repeat(h.length + 2)).join('|')}|`, ...rows.map(r => `| ${r.map(c => String(c).replace(/\|/g, '/')).join(' | ')} |`)].join('\n') : empty
const NARRATIVE = ['Architecture Overview', 'Functionality Inventory', 'Module Ownership', 'Risk Areas', 'Agent Guidance', 'Setup / Runbook', 'Pattern Library']
const PENDING = (s: string) => `_Pending: ${s} is written by the model from the data below (map action narrate)._`

export function renderCodebase(d: MapData, narrative: Record<string, string> = {}, confidence = 'MEDIUM'): string {
  const n = (s: string) => narrative[s]?.trim() || PENDING(s)
  const chains = d.imports.fanOut.slice(0, 3).map(([f]) => [f, ...(d.imports.edges[f] ?? []).slice(0, 2)].join(' → '))
  const out = [
    '# Codebase Map', '',
    `**Analyzed:** ${d.date}`, `**Generated At:** ${d.generatedAt}`, `**Map Schema Version:** ${MAP_SCHEMA}`, `**Analyzed Commit:** ${d.commit}`,
    `**Source File Count:** ${d.source.length}`, `**Source Fingerprint:** ${d.fingerprint}`, `**Scope:** ${d.scope}${d.scope !== 'project-root' ? ' (scoped, not full-project)' : ''}`, `**Root:** ${d.root}`, `**Confidence:** ${narrative.Confidence?.trim() || confidence}`, '',
    '```yaml', emitYaml({ map_schema_version: MAP_SCHEMA, generated_at: d.generatedAt, analyzed_commit: d.commit, source_file_count: d.source.length, source_fingerprint: d.fingerprint, source_fingerprint_kind: d.fingerprintKind, scope: d.scope }).trimEnd(), '```', '',
    '## Architecture Overview', n('Architecture Overview'), '',
    '## Language Distribution', table(['Extension', 'File Count', '% of Codebase'], d.languages.map(l => [l.ext, l.count, `${l.pct}%`])), '',
    '## Detected Stack', table(['Layer', 'Technology', 'Evidence'], d.stack.map(s => [s.layer, s.technology, s.evidence])), '',
    '## Conventions Detected', ...Object.entries(d.conventions).map(([k, v]) => `- **${k}**: ${v}`), '',
    '## Entry Points', table(['Type', 'Path', 'Evidence'], d.entryPoints.map(e => [e.type, `\`${e.path}\``, e.evidence])), '',
    '## Functionality Inventory', n('Functionality Inventory'), '',
    '## Module Ownership', n('Module Ownership'), '',
    '## Risk Areas', n('Risk Areas'), '',
    '## Technical Debt Signals', `**TODO/FIXME/HACK/XXX density**: ${d.debt.density} per source file — ${d.debt.level}`, '',
    table(['File', 'Markers'], d.debt.top.map(t => [`\`${t.path}\``, t.count])), '',
    '### Complexity (largest files)', table(['File', 'Lines', 'Level'], d.complexity.map(c => [`\`${c.path}\``, c.lines, c.level])), '',
    '### Git Hotspots (90 days)', d.hotspots.length ? table(['File', 'Changes'], d.hotspots.map(h => [`\`${h.path}\``, h.changes])) : '_Skipped: fewer than 10 commits in 90 days, or not a git repository._', '',
    '### Hygiene', d.hygiene.length ? d.hygiene.map(h => `- ${h}`).join('\n') : '_None detected_', '',
    '## Dependency Risk', d.deps.length || d.files.some(f => MANIFESTS.includes(f)) ? `Direct dependencies: ${d.deps.length || 'see manifest'}. Package manager not available or no lockfile found. Dependency currency check skipped. (Network checks are off: run \`npm outdated\` or the ecosystem equivalent to check currency.)` : 'No package manifest detected (package.json, requirements.txt, Gemfile, Cargo.toml, go.mod). Dependency risk analysis requires a recognized package ecosystem.', '',
    '## Agent Guidance', n('Agent Guidance'), '',
    '## Dependency Graph', Object.keys(d.imports.edges).length || d.imports.external.size ? [
      `**Files analyzed**: ${d.source.length} | **Internal edges**: ${Object.values(d.imports.edges).reduce((s, v) => s + v.length, 0)} | **External deps**: ${d.imports.external.size}`, '',
      '### Fan-out (most imports)', table(['File', 'Imports'], d.imports.fanOut.map(([f, c]) => [`\`${f}\``, c])), '',
      '### Fan-in (most imported)', table(['File', 'Imported by'], d.imports.fanIn.map(([f, c]) => [`\`${f}\``, c])), '',
      '### Key Dependency Chains', chains.length ? chains.map(c => `- ${c}`).join('\n') : '_None detected_',
    ].join('\n') : 'No recognized import patterns detected. Import analysis requires source files with standard import syntax.', '',
    '## Test Coverage Map', d.tests.files.length ? [
      `**Test convention**: ${d.tests.convention}`, `**Coverage**: ${d.tests.coverage ? `${d.tests.coverage.pct}%` : `${Math.round(d.tests.ratio * 100)}% of sampled source files have a matching test`} — ${d.tests.level}`, `**Source**: ${d.tests.coverage?.source ?? 'file-name matching (no coverage report read)'}`, '',
      '### Critical Untested Files', table(['File', 'Lines', 'Fan-in', 'Risk Score', 'Risk Level'], d.tests.untested.map(u => [`\`${u.path}\``, u.lines, u.fanIn, u.risk, u.level]), '_No untested critical files detected_'),
    ].join('\n') : 'No test convention detected. No files matching common test patterns (.test., .spec., __tests__/, test/, _test.go, Test*.java) were found.', '',
    '## API Surface', d.routes.length ? [`**Framework**: ${d.framework || 'unknown'} | **Routes detected**: ${d.routes.length} | **Resources**: ${new Set(d.routes.map(r => r.path.split('/').filter(Boolean)[r.path.startsWith('/api/') ? 1 : 0] ?? '/')).size}`, '', table(['Method', 'Path', 'File'], d.routes.slice(0, 40).map(r => [r.method, `\`${r.path}\``, `\`${r.file}\``]))].join('\n') : 'No web framework detected or no HTTP route definitions found.', '',
    '## Config & Environment', d.config.length || d.env.length ? [
      `**Config files**: ${d.config.length} detected | **Env variables**: ${d.env.length} referenced | **Sensitive vars**: ${d.env.filter(e => e.sensitive).length}`, '',
      '### Config Files', table(['File'], d.config.map(c => [`\`${c}\``])), '',
      '### Environment Variables', table(['Variable', 'Source', 'Sensitive'], d.env.map(e => [e.name, `\`${e.source}\``, e.sensitive ? 'yes' : 'no'])), '',
      '### Secret Exposure Warnings', d.exposure.length ? d.exposure.map(e => `- ${e}`).join('\n') : '_None detected_',
    ].join('\n') : 'No configuration files or environment variable patterns detected.', '',
    '## Setup / Runbook', n('Setup / Runbook'), '',
    '## Pattern Library', n('Pattern Library'), '',
    ...(d.monorepo.length >= 2 ? ['## Monorepo Structure', table(['Package', 'Path'], d.monorepo.map(m => [m.split('/').pop()!, `\`${m}\``])), ''] : []),
    '## Directory Mappings', table(['Category', 'Primary Location', 'Priority', 'Pattern'], d.mappings.map(m => [m.category, `\`${m.paths[0]}\``, m.priority === 10 ? 'explicit' : m.priority === 5 ? 'inferred' : 'default', `\`${m.pattern}\``])), '',
    '### Path Enforcement Rules', 'Strictness: warn (writes outside a category\'s location are reported, not blocked).', '',
    '## Retrieval Artifacts', '- Chunk index: `.planning/codebase/index.jsonl`', '- Symbols: `.planning/codebase/symbols.json`', '- Search guide: `.planning/codebase/search.md`', '',
  ]
  return out.join('\n')
}

const slug = (p: string) => p.replace(/\.[^./]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const kindOf = (p: string) => TEST_FILE.test(p) ? 'test' : /(^|\/)(routes?|api|controllers|handlers)\//.test(p) ? 'route' : /(^|\/)components?\//.test(p) ? 'component' : /\.config\.|(^|\/)config\//.test(p) ? 'config' : /\.md$/.test(p) ? 'doc' : /(^|\/)(scripts|bin)\//.test(p) ? 'script' : /\.(json|ya?ml|csv|toml)$/.test(p) ? 'data' : SOURCE.test(p) ? 'module' : 'unknown'

// One chunk per top-level symbol run, at most 150 lines.
export function indexChunks(d: MapData): object[] {
  const out: object[] = []
  const docs = d.files.filter(f => /^(README|ARCHITECTURE|docs\/)[^/]*\.md$/i.test(f) || /^docs\/[^/]+\.md$/.test(f)).slice(0, 10)
  const files = [...d.source, ...docs.map(p => ({ path: p, lines: 0, text: '' }))]
  for (const f of files) {
    const syms = d.symbols.filter(s => s.path === f.path)
    const total = Math.max(1, f.lines)
    const bounds: number[] = [1]
    for (const s of syms) if (s.line - bounds[bounds.length - 1]! >= 150 || (s.line > 1 && s.line - bounds[bounds.length - 1]! >= 60)) bounds.push(s.line)
    for (let b = bounds[bounds.length - 1]! + 150; b < total; b += 150) bounds.push(b)
    bounds.sort((a, b) => a - b)
    bounds.forEach((start, i) => {
      const end = i + 1 < bounds.length ? bounds[i + 1]! - 1 : total
      const inChunk = syms.filter(s => s.line >= start && s.line <= end).map(s => s.name)
      const words = [...new Set(f.path.split(/[/._-]+/).filter(w => w.length > 2).map(w => w.toLowerCase()))]
      out.push({
        id: `map:${slug(f.path)}:${String(i + 1).padStart(3, '0')}`, path: f.path, start_line: start, end_line: end, kind: kindOf(f.path),
        summary: inChunk.length ? `${kindOf(f.path)} defining ${inChunk.slice(0, 6).join(', ')}${inChunk.length > 6 ? ', …' : ''}` : `${kindOf(f.path)} ${f.path}`,
        keywords: [...words, ...inChunk.map(s => s.toLowerCase())].slice(0, 12), aliases: [], symbols: inChunk,
        related_files: [...(d.imports.edges[f.path] ?? []), ...Object.entries(d.imports.edges).filter(([, v]) => v.includes(f.path)).map(([k]) => k)].slice(0, 8),
        risk: d.tests.untested.find(u => u.path === f.path)?.level.toLowerCase().replace('critical', 'high') ?? (d.complexity.find(c => c.path === f.path)?.level === 'HIGH' ? 'medium' : 'low'),
        confidence: 'medium',
      })
    })
  }
  return out
}

export function symbolsJson(d: MapData, chunks: any[]): object {
  const chunkOf = (path: string, line?: number) => chunks.filter(c => c.path === path && (line === undefined || (c.start_line <= line && c.end_line >= line))).map(c => c.id)
  return {
    metadata: { map_schema_version: MAP_SCHEMA, generated_at: d.generatedAt, analyzed_commit: d.commit, source_file_count: d.source.length, source_fingerprint: d.fingerprint, scope: d.scope },
    entry_points: d.entryPoints.map(e => ({ name: e.evidence, path: e.path, kind: 'entry_point', summary: `${e.type} entry point`, related_chunks: chunkOf(e.path) })),
    routes: d.routes.map(r => ({ name: `${r.method} ${r.path}`, path: r.file, kind: 'route', summary: `${r.method} ${r.path}`, related_chunks: chunkOf(r.file) })),
    apis: d.symbols.filter(s => /^(function|def|fn|func|fun)$/.test(s.kind) && !TEST_FILE.test(s.path)).map(s => ({ name: s.name, path: s.path, kind: s.kind, line: s.line, summary: `${s.kind} ${s.name}`, related_chunks: chunkOf(s.path, s.line) })),
    modules: d.source.filter(f => !TEST_FILE.test(f.path)).map(f => ({ name: f.path.split('/').pop(), path: f.path, kind: 'module', summary: `${lang(f.path)} module, ${f.lines} lines`, related_chunks: chunkOf(f.path) })),
    tests: d.tests.files.map(t => ({ name: t.split('/').pop(), path: t, kind: 'test', summary: 'test file', related_chunks: chunkOf(t) })),
    config: d.config.map(c => ({ name: c.split('/').pop(), path: c, kind: 'config', summary: 'configuration file', related_chunks: [] })),
    dependencies: [...d.imports.external].sort().map(x => ({ name: x, path: '', kind: 'external', summary: 'external import', related_chunks: [] })),
    ownership: d.mappings.map(m => ({ name: m.category, path: m.paths[0], kind: 'area', summary: `${m.category} code`, related_chunks: [] })),
    risk_areas: d.tests.untested.filter(u => u.level !== 'LOW').map(u => ({ name: u.path, path: u.path, kind: 'untested', summary: `untested, fan-in ${u.fanIn}, risk ${u.risk}`, related_chunks: chunkOf(u.path) })),
    classes: d.symbols.filter(s => /^(class|struct|interface|type|trait|enum|module|object)$/.test(s.kind)).map(s => ({ name: s.name, path: s.path, kind: s.kind, line: s.line, summary: `${s.kind} ${s.name}`, related_chunks: chunkOf(s.path, s.line) })),
  }
}

export const SEARCH_MD = `# Codebase Search Guide

Artifacts: \`.planning/CODEBASE.md\`, \`.planning/codebase/index.jsonl\` (chunks), \`.planning/codebase/symbols.json\` (entry points, routes, APIs, modules, tests, config, dependencies, ownership, risk areas).

## Query planning
Turn a question into \`{terms, path_hints, symbol_hints, domain_hints}\`.

## Retrieval order
1. Path hints (exact or partial paths in index.jsonl)
2. Symbol hints (symbols.json and chunk \`symbols\`)
3. Terms and aliases (chunk \`keywords\` and \`aliases\`)
4. CODEBASE.md headings
5. Read the original source

Always read the original source before acting on a result.

## Example
\`/triad:map --query "auth session lifecycle"\`

## Map Search Results

| Rank | Chunk | Path | Lines | Kind | Why it matched |
|------|-------|------|-------|------|----------------|
| 1 | map:src-auth-session:001 | src/auth/session.ts | 1-120 | module | path + symbol "createSession" |

### Read Next
- \`src/auth/session.ts\` lines 1-120

## Safety rules
- Summaries are not truth; the source is.
- Check freshness (\`/triad:map --check\`) before relying on the map.
- Do not load the whole index; query it.
- When the map and the source disagree, the source wins.
`

export function mappingsYaml(d: MapData): string {
  const mappings: Record<string, unknown> = {}
  for (const m of d.mappings) mappings[m.category] = { paths: m.paths, priority: m.priority, pattern: m.pattern, description: `${m.category} files` }
  return emitYaml({
    generated: d.date, source: 'CODEBASE.md', version: '1.0', mappings, packages: {},
    rules: { strictness: 'warn', exceptions: [] },
    autoUpdate: { enabled: true, mode: 'prompt', threshold: { newDirectoryFiles: 3, newCategoryFiles: 10, categoryChangePercent: 20 }, backup: { enabled: true, keepCount: 5 } },
  })
}

export type Freshness = { status: 'absent' | 'partial' | 'stale' | 'fresh'; ageDays?: number; commit?: string; missing: string[]; fingerprintMatch?: boolean; reason?: string }

export async function freshness(io: Io, d?: MapData): Promise<Freshness> {
  const present: string[] = []
  for (const a of ARTIFACTS) if ((await io.read(a)) !== undefined) present.push(a)
  const missing = ARTIFACTS.filter(a => !present.includes(a))
  if (!present.length) return { status: 'absent', missing }
  const cb = (await io.read('.planning/CODEBASE.md')) ?? ''
  const gen = cb.match(/^\*\*Generated At:\*\*\s*(\S+)/m)?.[1] ?? cb.match(/^\*\*Analyzed:\*\*\s*(\S+)/m)?.[1]
  const ageDays = gen && Number.isFinite(Date.parse(gen)) ? Math.floor((io.now().getTime() - Date.parse(gen)) / 86_400_000) : undefined
  const schema = cb.match(/^\*\*Map Schema Version:\*\*\s*(\S+)/m)?.[1]
  const fp = cb.match(/^\*\*Source Fingerprint:\*\*\s*(\S+)/m)?.[1]
  const commit = cb.match(/^\*\*Analyzed Commit:\*\*\s*(\S+)/m)?.[1]
  const data = d ?? (await collect(io))
  const fingerprintMatch = fp === data.fingerprint
  if (missing.length) return { status: 'partial', ageDays, commit, missing, fingerprintMatch }
  const why = [ageDays === undefined || ageDays > STALE_DAYS ? `older than ${STALE_DAYS} days` : '', schema !== MAP_SCHEMA ? `schema ${schema ?? 'unknown'}` : '', !fingerprintMatch ? 'source changed since the map' : ''].filter(Boolean)
  return { status: why.length ? 'stale' : 'fresh', ageDays, commit, missing, fingerprintMatch, reason: why.join(', ') || undefined }
}

export const renderFreshness = (f: Freshness) => [
  `status: ${f.status}`, ...(f.reason ? [`reason: ${f.reason}`] : []), ...(f.ageDays !== undefined ? [`age: ${f.ageDays} days`] : []), ...(f.commit ? [`analyzed_commit: ${f.commit}`] : []),
  ...(f.missing.length && f.status !== 'absent' ? [`missing: ${f.missing.join(', ')}`] : []), ...(f.fingerprintMatch !== undefined ? [`fingerprint match: ${f.fingerprintMatch ? 'y' : 'n'}`] : []),
  `recommended: ${f.status === 'fresh' ? 'none' : f.status === 'absent' ? '/triad:map' : '/triad:map --refresh'}`,
].join('\n')

export async function mapBuild(io: Io, opts: { scope?: string } = {}): Promise<string> {
  if (opts.scope) {
    const s = opts.scope.replace(/^\.\//, '')
    if (s.startsWith('/') || s.split('/').includes('..')) return `--scope must be a path inside the project (got ${opts.scope}).`
    if (!(await io.list(s)).length && (await io.read(s)) === undefined) return `--scope path ${opts.scope} does not exist.`
  }
  const d = await collect(io, opts)
  if (!(await isCodebase(io, d.files))) return 'No source code detected, so no codebase map was generated.'
  const chunks = indexChunks(d)
  // Keep narrative sections from an earlier map (a refresh only replaces data sections).
  const old = (await io.read('.planning/CODEBASE.md')) ?? ''
  const kept: Record<string, string> = {}
  for (const s of NARRATIVE) { const b = sectionBody(old, s); if (b && !b.startsWith('_Pending:')) kept[s] = b }
  await io.write('.planning/CODEBASE.md', renderCodebase(d, kept))
  await io.write('.planning/codebase/index.jsonl', chunks.map(c => JSON.stringify(c)).join('\n') + '\n')
  await io.write('.planning/codebase/symbols.json', JSON.stringify(symbolsJson(d, chunks), null, 2) + '\n')
  await io.write('.planning/codebase/search.md', SEARCH_MD)
  const yaml = mappingsYaml(d)
  try { parseYaml(yaml) } catch (e) { return `directory-mappings.yaml did not parse: ${(e as Error).message}` }
  await io.write('.planning/config/directory-mappings.yaml', yaml)
  const pending = NARRATIVE.filter(s => !kept[s])
  return [
    `Codebase map ${old ? 'refreshed' : 'generated'}${d.scope !== 'project-root' ? ` (scoped to ${d.scope}, not full-project)` : ''}: ${d.source.length} source files of ${d.files.length}.`,
    `Languages: ${d.languages.map(l => `${l.ext} ${l.pct}%`).join(', ') || 'none'}; stack: ${d.stack.map(s => s.technology).join(', ') || 'unknown'}.`,
    `Artifacts: ${ARTIFACTS.join(', ')} (${chunks.length} chunks, ${d.symbols.length} symbols).`,
    `Top risks: ${d.tests.untested.filter(u => u.level !== 'LOW').slice(0, 3).map(u => `${u.path} (${u.level}, untested)`).join('; ') || '_None detected_'}${d.exposure.length ? `; ${d.exposure.length} secret exposure warning(s)` : ''}.`,
    '', pending.length ? `Narrative sections to write (map action narrate): ${pending.join(', ')}. Facts for them:` : 'Narrative sections kept from the previous map.',
    ...(pending.length ? [factsFor(d)] : []),
  ].join('\n')
}

// A compact fact sheet the narrative writer works from.
export function factsFor(d: MapData): string {
  const tree = [...new Set(d.files.map(f => f.split('/').slice(0, 2).join('/')))].slice(0, 80)
  return [
    `Structure: ${d.structure}; entry points: ${d.entryPoints.map(e => e.path).join(', ') || 'none found'}`,
    `Tree (depth 2): ${tree.join(', ')}`,
    `Stack: ${d.stack.map(s => `${s.layer} ${s.technology}`).join('; ')}`,
    `Conventions: ${Object.entries(d.conventions).map(([k, v]) => `${k} ${v}`).join('; ')}`,
    `Largest files: ${d.complexity.map(c => `${c.path} (${c.lines})`).join(', ')}`,
    `Fan-in: ${d.imports.fanIn.map(([f, c]) => `${f} (${c})`).join(', ') || 'n/a'}; untested: ${d.tests.untested.map(u => `${u.path} (${u.level})`).join(', ') || 'none'}`,
    `Symbols: ${d.symbols.slice(0, 60).map(s => `${s.path}:${s.name}`).join(', ')}`,
    `Routes: ${d.routes.slice(0, 20).map(r => `${r.method} ${r.path}`).join(', ') || 'none'}; env vars: ${d.env.map(e => e.name).join(', ') || 'none'}`,
    `Debt: ${d.debt.level}; hygiene: ${d.hygiene.join(', ') || 'ok'}; hotspots: ${d.hotspots.map(h => h.path).join(', ') || 'n/a'}`,
  ].join('\n')
}

function sectionBody(text: string, heading: string): string | undefined {
  const lines = text.split('\n')
  const s = lines.findIndex(l => l.trim() === `## ${heading}`)
  if (s < 0) return undefined
  let e = s + 1
  while (e < lines.length && !/^## /.test(lines[e]!)) e++
  return lines.slice(s + 1, e).join('\n').trim()
}

export async function mapNarrate(io: Io, sections: Record<string, string>): Promise<string> {
  let text = await io.read('.planning/CODEBASE.md')
  if (!text) return 'No CODEBASE.md. Run map action build first.'
  const done: string[] = []
  for (const [k, v] of Object.entries(sections)) {
    if (k === 'Confidence') { text = text.replace(/^\*\*Confidence:\*\*.*$/m, `**Confidence:** ${v.trim()}`); done.push(k); continue }
    if (!NARRATIVE.includes(k)) continue
    const lines = text.split('\n')
    const s = lines.findIndex(l => l.trim() === `## ${k}`)
    if (s < 0) continue
    let e = s + 1
    while (e < lines.length && !/^## /.test(lines[e]!)) e++
    lines.splice(s + 1, e - s - 1, v.trim(), '')
    text = lines.join('\n')
    done.push(k)
  }
  await io.write('.planning/CODEBASE.md', text)
  const left = NARRATIVE.filter(s => (sectionBody(text, s) ?? '').startsWith('_Pending:'))
  return `Wrote ${done.join(', ') || 'nothing (unknown section names)'} into .planning/CODEBASE.md.${left.length ? ` Still pending: ${left.join(', ')}.` : ''}`
}

// Retrieval over the existing index (no generation): path 5, symbol 4, keyword 1 each.
export async function mapQuery(io: Io, query: string): Promise<string> {
  const idx = await io.read('.planning/codebase/index.jsonl')
  if (idx === undefined || (await io.read('.planning/codebase/symbols.json')) === undefined) return 'No map index exists. Run `/triad:map` first.'
  const terms = query.toLowerCase().split(/[^a-z0-9_./-]+/).filter(t => t.length > 1)
  const chunks = idx.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return undefined } }).filter(Boolean) as any[]
  const scored = chunks.map(c => {
    const why: string[] = []
    let s = 0
    for (const t of terms) {
      if (String(c.path).toLowerCase().includes(t)) { s += 5; why.push(`path "${t}"`) }
      if ((c.symbols ?? []).some((x: string) => x.toLowerCase().includes(t))) { s += 4; why.push(`symbol "${t}"`) }
      if ([...(c.keywords ?? []), ...(c.aliases ?? [])].some((x: string) => String(x).toLowerCase() === t)) { s += 1; why.push(`keyword "${t}"`) }
      if (String(c.kind) === t) s += 1
    }
    return { c, s, why: [...new Set(why)] }
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 5)
  const f = await freshness(io)
  const warn = f.status === 'fresh' ? [] : [`Warning: the map is ${f.status}${f.reason ? ` (${f.reason})` : ''}; read the source before acting.`, '']
  if (!scored.length) return [...warn, `No chunks match "${query}". Try other terms, or read CODEBASE.md.`].join('\n')
  return [...warn, '## Map Search Results', '', '| Rank | Chunk | Path | Lines | Kind | Why it matched |', '|------|-------|------|-------|------|----------------|',
    ...scored.map((x, i) => `| ${i + 1} | ${x.c.id} | ${x.c.path} | ${x.c.start_line}-${x.c.end_line} | ${x.c.kind} | ${x.why.join(', ')} |`),
    '', '### Read Next', ...scored.map(x => `- \`${x.c.path}\` lines ${x.c.start_line}-${x.c.end_line}`), '', 'Read the source before acting: summaries are not truth.'].join('\n')
}
