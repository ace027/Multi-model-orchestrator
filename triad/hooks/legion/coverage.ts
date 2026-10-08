// review.coverage_thresholds: coverage reports parsed in code (never by running
// the tests): istanbul coverage-summary.json, lcov.info, cobertura coverage.xml
// and pytest-cov's text table. Files are classed as business logic or API
// routes by path, as the codebase mapper does. Thresholds are advisory: a gap
// within 10 points is NEEDS WORK (advisory), a wider one FAIL (minor); neither
// blocks the review.
import type { Io } from './io.ts'
import type { Finding } from './review.ts'

export type Thresholds = { overall: number; business_logic: number; api_routes: number }
export const DEFAULT_THRESHOLDS: Thresholds = { overall: 70, business_logic: 90, api_routes: 80 }
type Count = { covered: number; total: number }
export type Coverage = { source: string; overall: number; files: Record<string, Count> }

export const COVERAGE_FILES = ['coverage/coverage-summary.json', 'coverage-summary.json', 'coverage/lcov.info', 'lcov.info', 'coverage.xml', 'coverage/cobertura-coverage.xml', 'coverage/coverage.xml', 'coverage.txt', 'coverage/coverage.txt']

export const isBusiness = (f: string) => /(^|\/)(services?|domain|use-?cases|business|core)\//i.test(f)
export const isApi = (f: string) => /(^|\/)(api|routes?|controllers?|endpoints?|handlers?)\//i.test(f)

const pct = (c: Count) => (c.total ? Math.round((c.covered / c.total) * 1000) / 10 : 100)
const sum = (cs: Count[]) => cs.reduce((a, c) => ({ covered: a.covered + c.covered, total: a.total + c.total }), { covered: 0, total: 0 })

export function parseIstanbul(text: string): Omit<Coverage, 'source'> | undefined {
  let j: any
  try { j = JSON.parse(text) } catch { return undefined }
  if (!j?.total?.lines) return undefined
  const files: Record<string, Count> = {}
  for (const [k, v] of Object.entries<any>(j)) if (k !== 'total' && v?.lines) files[k] = { covered: Number(v.lines.covered) || 0, total: Number(v.lines.total) || 0 }
  return { overall: Number(j.total.lines.pct), files }
}

export function parseLcov(text: string): Omit<Coverage, 'source'> | undefined {
  const files: Record<string, Count> = {}
  for (const rec of text.split(/^end_of_record\s*$/m)) {
    const sf = rec.match(/^SF:(.+)$/m)?.[1]?.trim()
    if (!sf) continue
    files[sf] = { covered: Number(rec.match(/^LH:(\d+)/m)?.[1] ?? 0), total: Number(rec.match(/^LF:(\d+)/m)?.[1] ?? 0) }
  }
  if (!Object.keys(files).length) return undefined
  return { overall: pct(sum(Object.values(files))), files }
}

export function parseCobertura(text: string): Omit<Coverage, 'source'> | undefined {
  const rate = text.match(/<coverage\b[^>]*\bline-rate="([\d.]+)"/)?.[1]
  if (rate === undefined) return undefined
  const files: Record<string, Count> = {}
  for (const m of text.matchAll(/<class\b[^>]*\bfilename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g)) {
    const lines = [...m[2]!.matchAll(/<line\b[^>]*\bhits="(\d+)"/g)]
    const c = files[m[1]!] ?? { covered: 0, total: 0 }
    files[m[1]!] = { covered: c.covered + lines.filter(l => Number(l[1]) > 0).length, total: c.total + lines.length }
  }
  return { overall: Math.round(Number(rate) * 1000) / 10, files }
}

// pytest-cov: "Name  Stmts  Miss  [Branch  BrPart]  Cover" rows and a TOTAL row.
export function parsePytestCov(text: string): Omit<Coverage, 'source'> | undefined {
  const total = text.match(/^TOTAL\s+(\d+)\s+(\d+)(?:\s+\d+\s+\d+)?\s+(\d+(?:\.\d+)?)%/m)
  if (!total) return undefined
  const files: Record<string, Count> = {}
  for (const m of text.matchAll(/^(\S+\.\w+)\s+(\d+)\s+(\d+)(?:\s+\d+\s+\d+)?\s+\d+(?:\.\d+)?%/gm)) files[m[1]!] = { covered: Number(m[2]) - Number(m[3]), total: Number(m[2]) }
  return { overall: Number(total[3]), files }
}

export async function readCoverage(io: Io): Promise<Coverage | undefined> {
  for (const source of COVERAGE_FILES) {
    const text = await io.read(source)
    if (text === undefined) continue
    const r = source.endsWith('.json') ? parseIstanbul(text) : source.endsWith('.info') ? parseLcov(text) : source.endsWith('.xml') ? parseCobertura(text) : parsePytestCov(text)
    if (r) {
      // Absolute paths (istanbul, lcov) are keyed project-relative.
      const files = Object.fromEntries(Object.entries(r.files).map(([k, v]) => [k.startsWith(io.root + '/') ? k.slice(io.root.length + 1) : k, v]))
      return { source, overall: r.overall, files }
    }
  }
  return undefined
}

export type CoverageCheck = { metric: keyof Thresholds; actual: number; threshold: number; files: number; rating: 'PASS' | 'NEEDS WORK' | 'FAIL' }

export function coverageChecks(c: Coverage, t: Partial<Thresholds> = {}): CoverageCheck[] {
  const th = { ...DEFAULT_THRESHOLDS, ...t }
  const files = Object.entries(c.files)
  const out: CoverageCheck[] = []
  const add = (metric: keyof Thresholds, actual: number, n: number) => {
    const threshold = th[metric]
    out.push({ metric, actual, threshold, files: n, rating: actual >= threshold ? 'PASS' : threshold - actual <= 10 ? 'NEEDS WORK' : 'FAIL' })
  }
  add('overall', c.overall, files.length)
  const biz = files.filter(([f]) => isBusiness(f))
  if (biz.length) add('business_logic', pct(sum(biz.map(([, v]) => v))), biz.length)
  const api = files.filter(([f]) => isApi(f))
  if (api.length) add('api_routes', pct(sum(api.map(([, v]) => v))), api.length)
  return out
}

const LABEL: Record<keyof Thresholds, string> = { overall: 'Overall', business_logic: 'Business logic', api_routes: 'API routes' }

export function coverageFindings(c: Coverage, checks: CoverageCheck[], cycle = 1): Finding[] {
  return checks.filter(k => k.rating !== 'PASS').map(k => ({
    id: '', severity: k.rating === 'FAIL' ? 'minor' : 'advisory', category: `tests:coverage:${k.metric}`, file: c.source, confidence: 90, agent: 'coverage', cycle, status: 'open', reviewers: ['coverage'],
    description: `${LABEL[k.metric]} line coverage ${k.actual}% is below the ${k.threshold}% threshold (${k.files} file(s))`,
    why: 'review.coverage_thresholds (advisory; does not block the review)',
    suggested_fix: `Add tests until ${LABEL[k.metric].toLowerCase()} coverage reaches ${k.threshold}%.`,
  }))
}

export function renderCoverage(c: Coverage | undefined, checks: CoverageCheck[]): string[] {
  if (!c) return [`No coverage data found (looked for ${COVERAGE_FILES.join(', ')}). Advisory only: run the test suite with coverage to check review.coverage_thresholds.`]
  return [`Source: \`${c.source}\``, '', '| Metric | Actual | Threshold | Files | Rating |', '|--------|--------|-----------|-------|--------|',
    ...checks.map(k => `| ${LABEL[k.metric]} | ${k.actual}% | ${k.threshold}% | ${k.files} | ${k.rating} |`)]
}
