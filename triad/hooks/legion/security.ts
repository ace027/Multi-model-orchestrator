// Security review: the trigger, secret scan, dependency audit and supply-chain
// checks run in code; the OWASP and STRIDE judgment is the security engineer's
// (persona_run). `save` assigns SEC ids, computes the verdict and writes
// {NN}-SECURITY-REVIEW.md plus a section in the phase review. Unresolved
// CRITICAL/HIGH findings block /triad:ship.
import { loadPhase, loadProject, type Io } from './io.ts'
import { pad2 } from './planning.ts'
import { listFiles } from './map.ts'

export type SecFinding = { id?: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'; category: string; finding: string; files: string; remediation: string; status?: string; source?: string }

const SENSITIVE = /(^|[._/-])(auth|login|session|token|jwt|password|credential|secret|encrypt|crypto|permission|rbac|acl|role|middleware|guard|policy)s?([._/-]|$)/i
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|php|cs|scala|swift)$/
const CONFIG = /(^|\/)\.env|\.(ya?ml|toml|ini|json)$/
const AUTH_DECORATORS = /@(login_required|requires_auth|PreAuthorize|Secured|RolesAllowed|UseGuards|Authorized?)\b|\bauthenticate\(|\bpassport\./

const SECRET_PATTERNS: [string, RegExp, SecFinding['severity']][] = [
  ['AWS access key', /AKIA[0-9A-Z]{16}/, 'CRITICAL'],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9_]{36,255}/, 'CRITICAL'],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{10,}/, 'CRITICAL'],
  ['Stripe key', /[sr]k_(live|test)_[A-Za-z0-9]{20,}/, 'CRITICAL'],
  ['Google API key', /AIza[0-9A-Za-z\-_]{35}/, 'CRITICAL'],
  ['Bearer token', /[Bb]earer\s+[A-Za-z0-9\-._~+/]{20,}=*/, 'CRITICAL'],
  ['Database URL with password', /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^:\s/]+:[^@\s]+@/, 'CRITICAL'],
  ['Password or secret assignment', /\b(password|passwd|secret|api_?key|access_?token|client_?secret)\b\s*[:=]\s*['"][^'"\s]{8,}['"]/i, 'CRITICAL'],
  ['Private key', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/, 'CRITICAL'],
  ['JWT secret', /\bjwt[_-]?secret\b\s*[:=]\s*['"][^'"]{6,}['"]/i, 'CRITICAL'],
  ['IP:port', /\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/, 'LOW'],
]
const redact = (s: string) => s.length <= 12 ? `${s.slice(0, 4)}…` : `${s.slice(0, 8)}…${s.slice(-4)}`

export function securityTrigger(files: string[], texts: Record<string, string>, extra: { risk?: string; phaseType?: string } = {}): string[] {
  const why: string[] = []
  for (const f of files) {
    if (SOURCE.test(f) && SENSITIVE.test(f)) why.push(`${f}: security-sensitive path`)
    else if (CONFIG.test(f) && SECRET_PATTERNS.some(([, re]) => re.test(texts[f] ?? ''))) why.push(`${f}: config with a secret pattern`)
    else if (SOURCE.test(f) && AUTH_DECORATORS.test(texts[f] ?? '')) why.push(`${f}: auth decorator or middleware`)
    else if (extra.risk && extra.risk.includes(f)) why.push(`${f}: listed in CODEBASE.md Risk Areas`)
  }
  if (/\b(api|security)\b/i.test(extra.phaseType ?? '')) why.push(`phase type ${extra.phaseType}`)
  return why
}

export async function secretScan(io: Io, files: string[]): Promise<SecFinding[]> {
  const out: SecFinding[] = []
  for (const f of files) {
    if (/(^|\/)\.env(\.|$)/.test(f) && !/\.example$|\.sample$|\.template$/.test(f)) out.push({ severity: 'HIGH', category: 'Secret', finding: `.env file committed (${f})`, files: f, remediation: 'Remove it from git, rotate its values, add it to .gitignore.', source: 'secret-scan' })
    const text = await io.read(f)
    if (!text || text.length > 500_000) continue
    text.split('\n').forEach((line, i) => {
      for (const [type, re, severity] of SECRET_PATTERNS) {
        const m = line.match(re)
        if (!m) continue
        if (type === 'IP:port' && /\b(127\.0\.0\.1|0\.0\.0\.0|localhost)\b/.test(m[0])) continue
        out.push({ severity, category: 'Secret', finding: `${type}: ${redact(m[0])}`, files: `${f}:${i + 1}`, remediation: severity === 'LOW' ? 'Move the address to configuration.' : 'Remove the secret, rotate it, load it from the environment or a secret manager.', source: 'secret-scan' })
        break
      }
    })
  }
  return out
}

const AUDITS: [string, string, string][] = [
  ['package-lock.json', 'npm', 'npm audit --json'],
  ['poetry.lock', 'pip-audit', 'pip-audit --format=json'],
  ['requirements.txt', 'pip-audit', 'pip-audit -r requirements.txt --format=json'],
  ['composer.lock', 'composer', 'composer audit --format=json'],
  ['go.sum', 'govulncheck', 'govulncheck ./...'],
  ['Gemfile.lock', 'bundle-audit', 'bundle audit check --format=json'],
  ['Cargo.lock', 'cargo-audit', 'cargo audit --json'],
]

export async function dependencyScan(io: Io): Promise<{ findings: SecFinding[]; rows: string[]; notes: string[] }> {
  const findings: SecFinding[] = []
  const rows: string[] = []
  const notes: string[] = []
  for (const [lock, tool, cmd] of AUDITS) {
    if ((await io.read(lock)) === undefined) continue
    const has = await io.run(['bash', '-c', `command -v ${tool.split(' ')[0]} >/dev/null 2>&1`])
    if (has.exitCode !== 0) { findings.push({ severity: 'MEDIUM', category: 'A9:Known Vulnerabilities', finding: `${tool} not installed; ${lock} dependencies not audited`, files: lock, remediation: `Install ${tool} and re-run the security review.`, source: 'dependency-scan' }); notes.push(`${tool} unavailable (verdict at most CAUTION)`); continue }
    const r = await io.run(['bash', '-c', `${cmd} 2>/dev/null`], { timeoutMs: 180_000 })
    if (tool === 'npm') {
      let j: any
      try { j = JSON.parse(r.stdout) } catch { notes.push('npm audit output did not parse'); continue }
      for (const [name, v] of Object.entries<any>(j.vulnerabilities ?? {})) {
        const sev = String(v.severity ?? 'low').toUpperCase()
        const severity = (sev === 'MODERATE' ? 'MEDIUM' : ['CRITICAL', 'HIGH', 'LOW'].includes(sev) ? sev : 'LOW') as SecFinding['severity']
        const adv = (v.via ?? []).find((x: any) => typeof x === 'object')
        rows.push(`| ${severity} | ${name} | ${v.range ?? '?'} | ${v.fixAvailable ? (typeof v.fixAvailable === 'object' ? v.fixAvailable.version : 'yes') : 'none'} | ${adv?.url ?? adv?.title ?? '-'} |`)
        if (severity === 'CRITICAL' || severity === 'HIGH') findings.push({ severity, category: 'A9:Known Vulnerabilities', finding: `${name} ${v.range ?? ''}: ${adv?.title ?? 'vulnerable dependency'}`, files: lock, remediation: v.fixAvailable ? 'npm audit fix (or upgrade the package).' : 'No fix available; replace or mitigate.', source: 'dependency-scan' })
      }
    } else if (r.exitCode !== 0) {
      findings.push({ severity: 'HIGH', category: 'A9:Known Vulnerabilities', finding: `${tool} reported vulnerabilities`, files: lock, remediation: `Read \`${cmd}\` output and upgrade the affected packages.`, source: 'dependency-scan' })
      rows.push(`| HIGH | (see ${tool}) | - | - | ${tool} exit ${r.exitCode} |`)
    }
  }
  return { findings, rows, notes }
}

export async function supplyChain(io: Io): Promise<SecFinding[]> {
  const out: SecFinding[] = []
  const pkg = await io.read('package.json')
  if (pkg !== undefined) {
    let any = false
    for (const l of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) if ((await io.read(l)) !== undefined) any = true
    if (!any) out.push({ severity: 'HIGH', category: 'Supply Chain', finding: 'package.json without a lockfile', files: 'package.json', remediation: 'Commit a lockfile so installs are reproducible.', source: 'supply-chain' })
  }
  const req = await io.read('requirements.txt')
  if (req !== undefined) {
    const loose = req.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.startsWith('-') && !/==/.test(l))
    if (loose.length) out.push({ severity: 'MEDIUM', category: 'Supply Chain', finding: `unpinned Python requirements: ${loose.slice(0, 5).join(', ')}${loose.length > 5 ? '…' : ''}`, files: 'requirements.txt', remediation: 'Pin exact versions (==) or use a lockfile.', source: 'supply-chain' })
  }
  return out
}

const secPath = (rel: string, n: number) => `${rel}/${pad2(n)}-SECURITY-REVIEW.md`

async function phaseFiles(io: Io, n: number): Promise<{ rel?: string; files: string[]; context?: string }> {
  const p = await loadProject(io)
  const ph = await loadPhase(io, p, n)
  const files = [...new Set([...ph.plans.flatMap(pl => pl.fm.files_modified ?? []), ...Object.values(ph.summaries).flatMap(s => [...(s.match(/^## Files Modified\n([\s\S]*?)(\n## |$)/m)?.[1] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]!))])]
  return { rel: ph.rel, files, context: ph.context }
}

export type SecMode = 'phase' | 'project' | 'audit'
const REVIEW_BRIEF = 'the OWASP Top 10 checklist (category severities A1 Injection CRITICAL, A2 Broken Auth CRITICAL, A3 Sensitive Data HIGH, A4 XXE HIGH, A5 Access Control CRITICAL, A6 Misconfiguration MEDIUM, A7 XSS HIGH, A8 Deserialization HIGH, A9 Known Vulns MEDIUM, A10 Logging MEDIUM; each PASS/FAIL/WARN), a STRIDE table per trust boundary (`| Boundary | Threat | Category | Attack Vector | Mitigation | Status |`, MITIGATED/PARTIAL/UNMITIGATED), an attack surface map, false positives among the secret matches above, and findings (severity, OWASP category, finding, file:line, remediation)'

// Deterministic scans; returns the facts and the files for the security engineer.
// With no phase (or mode project/audit) the whole tracked tree is the scope.
export async function securityScan(io: Io, opts: { phase?: number; full_scan?: boolean; mode?: SecMode }): Promise<string> {
  const p = await loadProject(io)
  const n = opts.mode === 'project' || opts.mode === 'audit' ? undefined : opts.phase ?? p.state?.phase
  if (!n) {
    const mode: SecMode = opts.mode === 'audit' ? 'audit' : 'project'
    const files = await listFiles(io)
    const secrets = await secretScan(io, files)
    const deps = await dependencyScan(io)
    const chain = await supplyChain(io)
    await io.write('.triad/security-scan.json', JSON.stringify({ mode, files: files.length, secrets, deps, chain }))
    const focus = files.filter(f => SENSITIVE.test(f) || (CONFIG.test(f) && !/lock|package\.json$/.test(f))).slice(0, 30)
    return [`Project ${mode === 'audit' ? 'security audit' : 'security review'} scan (${files.length} tracked files).`,
      `Secrets: ${secrets.length} match(es)${secrets.length ? `:\n${secrets.map(s => `- ${s.severity} ${s.files} ${s.finding}`).join('\n')}` : ''}`,
      `Dependencies: ${deps.findings.length} high/critical or tooling finding(s); ${deps.rows.length} advisory row(s)${deps.notes.length ? ` (${deps.notes.join('; ')})` : ''}`,
      `Supply chain: ${chain.map(c => `${c.severity} ${c.finding}`).join('; ') || 'ok'}`,
      '', `Have engineering-security-engineer and testing-api-tester (persona_run, read-only) review the project's entry points, auth and configuration${focus.length ? ` (start with ${focus.join(', ')})` : ''}: ${REVIEW_BRIEF}. Then call security action \`save\` with mode ${mode}.`].join('\n')
  }
  const ph = await phaseFiles(io, n)
  if (!ph.rel) return `Phase ${n} has no directory; plan and build it first.`
  const scanFiles = opts.full_scan ? await listFiles(io) : ph.files
  const texts: Record<string, string> = {}
  for (const f of ph.files) texts[f] = (await io.read(f)) ?? ''
  const risk = ((await io.read('.planning/CODEBASE.md')) ?? '').match(/^## Risk Areas\n([\s\S]*?)(\n## |$)/m)?.[1]
  const why = securityTrigger(ph.files, texts, { risk, phaseType: ph.context?.match(/phase[_ ]type:?\s*\**\s*(\w+)/i)?.[1] })
  const secrets = await secretScan(io, scanFiles)
  const deps = await dependencyScan(io)
  const chain = await supplyChain(io)
  await io.write('.triad/security-scan.json', JSON.stringify({ phase: n, mode: 'phase', secrets, deps, chain }))
  return [`Security scan for Phase ${n} (${opts.full_scan ? 'all tracked files' : `${ph.files.length} phase files`}).`,
    `Triggers: ${why.length ? why.join('; ') : 'none (a review is still allowed when asked)'}`,
    `Secrets: ${secrets.length} match(es)${secrets.length ? `:\n${secrets.map(s => `- ${s.severity} ${s.files} ${s.finding}`).join('\n')}` : ''}`,
    `Dependencies: ${deps.findings.length} high/critical or tooling finding(s); ${deps.rows.length} advisory row(s)${deps.notes.length ? ` (${deps.notes.join('; ')})` : ''}`,
    `Supply chain: ${chain.map(c => `${c.severity} ${c.finding}`).join('; ') || 'ok'}`,
    '', 'Files for the OWASP/STRIDE review:', ...ph.files.map(f => `- ${f}`),
    '', `Have engineering-security-engineer (persona_run, read-only) review those files: ${REVIEW_BRIEF}. Then call security action \`save\`.`].join('\n')
}

export function verdictOf(findings: SecFinding[]): { verdict: 'PASS' | 'CAUTION' | 'FAIL'; overrides: string[] } {
  const open = findings.filter(f => (f.status ?? 'OPEN') === 'OPEN')
  const overrides: string[] = []
  const crit = open.filter(f => f.severity === 'CRITICAL')
  const highCve = open.filter(f => f.severity === 'HIGH' && f.source === 'dependency-scan')
  if (crit.some(f => f.source === 'dependency-scan')) overrides.push('[VERDICT-OVERRIDE] critical CVE')
  if (crit.some(f => f.source === 'secret-scan')) overrides.push('[VERDICT-OVERRIDE] critical secret')
  if (highCve.length >= 3) overrides.push('[VERDICT-OVERRIDE] 3+ high CVEs')
  if (open.some(f => /typosquat|malicious/i.test(f.finding))) overrides.push('[VERDICT-OVERRIDE] suspected malicious package')
  if (overrides.length || crit.length) return { verdict: 'FAIL', overrides }
  if (open.some(f => f.severity === 'HIGH') || open.some(f => /not installed/.test(f.finding))) return { verdict: 'CAUTION', overrides }
  return { verdict: 'PASS', overrides }
}

const ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']
type SaveInput = { phase?: number; mode?: SecMode; owasp?: string; stride?: string; attack_surface?: string; findings?: SecFinding[]; false_positives?: string[] }
type Scan = { mode?: SecMode; files?: number; secrets: SecFinding[]; deps: { findings: SecFinding[]; rows: string[]; notes: string[] }; chain: SecFinding[] }

async function lastScan(io: Io): Promise<Scan> {
  try { return JSON.parse((await io.read('.triad/security-scan.json')) ?? '') } catch { return { secrets: [], deps: { findings: [], rows: [], notes: [] }, chain: [] } }
}

function merged(input: SaveInput, scan: Scan): SecFinding[] {
  const fp = new Set(input.false_positives ?? [])
  return [...(input.findings ?? []).map(f => ({ ...f, severity: String(f.severity).toUpperCase() as SecFinding['severity'], source: f.source ?? 'review' })), ...scan.secrets.filter(s => !fp.has(s.files)), ...scan.deps.findings, ...scan.chain]
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
    .map((f, i) => ({ ...f, id: `SEC-${String(i + 1).padStart(3, '0')}`, status: f.status ?? 'OPEN' }))
}

// Legion's names: --just-security writes .planning/security-review-{timestamp}.md,
// the --just-harden audit .planning/security-audit-{timestamp}.md.
export const stamp = (d: Date) => d.toISOString().slice(0, 19).replace(/:/g, '-')
const LEVEL: Record<SecFinding['severity'], string> = { CRITICAL: 'BLOCKER', HIGH: 'WARNING', MEDIUM: 'WARNING', LOW: 'SUGGESTION', INFO: 'SUGGESTION' }
// Categories are matched by name (Triad's checklist numbers them the 2017 way, the report the 2021 way).
const OWASP: [string, RegExp][] = [['A01: Broken Access Control', /access control|authoriz|permission|rbac/i], ['A02: Cryptographic Failures', /crypt|sensitive data/i], ['A03: Injection', /injection|xss|xxe/i], ['A04: Insecure Design', /insecure design/i], ['A05: Security Misconfiguration', /misconfig/i], ['A06: Vulnerable Components', /known vuln|vulnerable|supply chain/i], ['A07: Auth Failures', /broken auth|authenticat|session/i], ['A08: Software and Data Integrity', /integrity|deserial/i], ['A09: Logging and Monitoring Failures', /logging|monitor/i], ['A10: Server-Side Request Forgery', /ssrf|request forgery/i], ['Secrets', /secret/i]]

async function projectSave(io: Io, input: SaveInput, scan: Scan, mode: 'project' | 'audit'): Promise<string> {
  const all = merged(input, scan)
  const v = verdictOf(all)
  const now = io.now()
  const path = `.planning/security-${mode === 'audit' ? 'audit' : 'review'}-${stamp(now)}.md`
  const cell = (s: string) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
  const block = (f: SecFinding) => [`### ${f.id} [${LEVEL[f.severity]}] ${cell(f.finding)}`, `- **Severity**: ${f.severity}`, `- **Category**: ${f.category}`, `- **File**: ${f.files}`, `- **Remediation**: ${f.remediation}`, `- **Source**: ${f.source ?? 'review'}`, '']
  const count = (l: string) => all.filter(f => LEVEL[f.severity] === l).length
  const priority = all.filter(f => f.severity !== 'INFO').map((f, i) => `${i + 1}. [${LEVEL[f.severity]}] ${f.id} ${cell(f.finding)} (${f.files}) — ${cell(f.remediation)}`)
  const owasp = input.owasp?.trim() || OWASP.map(([name, re]) => { const hit = all.filter(f => re.test(f.category)); return `- ${name} — ${hit.length ? hit.map(f => f.id).join(', ') : 'no findings'}` }).join('\n')
  const text = mode === 'project' ? [
    '# Security Review Report', '', `**Generated:** ${now.toISOString()}`, '**Mode:** --just-security (security-only audit)', '**Agents:** engineering-security-engineer, testing-api-tester', `**Verdict:** ${v.verdict}`, ...v.overrides, '',
    '## Executive Summary', `- Total findings: ${all.length}`, `- Critical (BLOCKER): ${count('BLOCKER')}`, `- High (WARNING): ${count('WARNING')}`, `- Low (SUGGESTION): ${count('SUGGESTION')}`, '',
    '## OWASP Top 10 Coverage', owasp, '',
    '## STRIDE Threats Identified', input.stride?.trim() || ['Spoofing', 'Tampering', 'Repudiation', 'Information Disclosure', 'Denial of Service', 'Elevation of Privilege'].map(s => `- ${s}: _not reviewed_`).join('\n'), '',
    ...(input.attack_surface?.trim() ? ['## Attack Surface', input.attack_surface.trim(), ''] : []),
    '## Findings', ...(all.length ? all.flatMap(block) : ['_none_', '']),
    '## Remediation Priority', ...(priority.length ? priority : ['_nothing to remediate_']), '',
  ] : [
    '# Security Audit Report', '', `**Generated:** ${now.toISOString()}`, '**Mode:** --just-harden (ad-hoc security audit)', '**Agents:** engineering-security-engineer, testing-api-tester', `**Verdict:** ${v.verdict}`, ...v.overrides, '',
    '## Summary Statistics', '| Severity | Count |', '|----------|-------|', ...ORDER.map(s => `| ${s} | ${all.filter(f => f.severity === s).length} |`), `| Total | ${all.length} |`, '',
    `- Files scanned: ${scan.files ?? 'unknown'}`, `- Secret matches: ${scan.secrets.length}`, `- Dependency findings: ${scan.deps.findings.length}${scan.deps.notes.length ? ` (${scan.deps.notes.join('; ')})` : ''}`, `- Supply chain findings: ${scan.chain.length}`, '',
    '## OWASP Top 10 Coverage', owasp, '',
    '## Findings by Severity', ...ORDER.flatMap(s => { const fs = all.filter(f => f.severity === s); return fs.length ? [`### ${s}`, '', ...fs.flatMap(block)] : [] }), ...(all.length ? [] : ['_none_', '']),
    '## Remediation Guide', ...(priority.length ? priority : ['_nothing to remediate_']), '',
  ]
  await io.write(path, text.join('\n'))
  return `Wrote ${path}: verdict ${v.verdict}, ${all.length} finding(s) (BLOCKER ${count('BLOCKER')}, WARNING ${count('WARNING')}, SUGGESTION ${count('SUGGESTION')}).${v.overrides.length ? ' ' + v.overrides.join(' ') : ''}`
}

export async function securitySave(io: Io, input: SaveInput): Promise<string> {
  const p = await loadProject(io)
  const scan = await lastScan(io)
  const mode = input.mode ?? (input.phase ? 'phase' : scan.mode)
  if (mode === 'project' || mode === 'audit') return projectSave(io, input, scan, mode)
  const n = input.phase ?? p.state?.phase
  if (!n) return projectSave(io, input, scan, 'project')
  const ph = await phaseFiles(io, n)
  if (!ph.rel) return `Phase ${n} has no directory.`
  const fp = new Set(input.false_positives ?? [])
  const secrets = scan.secrets.filter(s => !fp.has(s.files))
  const all = merged(input, scan)
  const v = verdictOf(all)
  const blockers = all.filter(f => f.status === 'OPEN' && (f.severity === 'CRITICAL' || f.severity === 'HIGH')).length
  const cell = (s: string) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
  const text = [`# Phase ${n}: Security Review`, '', `**Verdict**: ${v.verdict}`, `**Unresolved blockers for ship**: ${blockers}`, ...v.overrides, '',
    '## OWASP Top 10', input.owasp?.trim() || '_not reviewed_', '', '## STRIDE', input.stride?.trim() || '_not reviewed_', '', '## Attack Surface', input.attack_surface?.trim() || '_not reviewed_', '',
    '### Dependency Vulnerability Findings', ...(scan.deps.rows.length ? ['| Severity | Package | Current Version | Patched Version | Advisory |', '|----------|---------|-----------------|-----------------|----------|', ...scan.deps.rows] : ['_none_']), ...scan.deps.notes.map(x => `- ${x}`), '',
    '### Secret Detection Findings', ...(secrets.length ? ['| Severity | File | Line | Type | Preview |', '|----------|------|------|------|---------|', ...secrets.map(s => { const [f, l] = s.files.split(':'); const [t, pv] = s.finding.split(': '); return `| ${s.severity} | ${f} | ${l ?? ''} | ${t} | ${pv ?? ''} |` })] : ['_none_']), '',
    '### Supply Chain Findings', ...(scan.chain.length ? scan.chain.map(c => `- ${c.severity}: ${c.finding}`) : ['_none_']), '',
    '## Findings', ...(all.length ? ['| ID | OWASP Cat | Severity | Finding | File(s) | Remediation | Status |', '|----|-----------|----------|---------|---------|-------------|--------|', ...all.map(f => `| ${f.id} | ${cell(f.category)} | ${f.severity} | ${cell(f.finding)} | ${cell(f.files)} | ${cell(f.remediation)} | ${f.status} |`)] : ['_none_']), ''].join('\n')
  const path = secPath(ph.rel, n)
  await io.write(path, text)
  const rp = `${ph.rel}/${pad2(n)}-REVIEW.md`
  const review = await io.read(rp)
  const sec = `## Security Review\n\n**Verdict**: ${v.verdict} — ${blockers} unresolved CRITICAL/HIGH finding(s). Details: \`${pad2(n)}-SECURITY-REVIEW.md\`.\n`
  await io.write(rp, review === undefined ? `# Phase ${n}: Review\n\n${sec}` : review.includes('## Security Review') ? review.replace(/## Security Review\n[\s\S]*?(?=\n## |$)/, sec) : review.replace(/\s*$/, '\n\n') + sec)
  return `Wrote ${path}: verdict ${v.verdict}, ${all.length} finding(s), ${blockers} blocking ship.${v.overrides.length ? ' ' + v.overrides.join(' ') : ''}`
}
