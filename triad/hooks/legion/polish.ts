// /triad:polish in code: scope (base files, one level of importers, excludes,
// the 50-file cap), baseline tests and type check, one polisher agent for the
// four passes, then the safety net (a regression reverts the culprit file, or
// all of the polish), the commit, and POLISH.md.
import { loadPhase, loadProject, type Io } from './io.ts'
import { pad2, findPhaseDir } from './planning.ts'
import { commit, runVerification } from './build.ts'
import { listFiles } from './map.ts'
import { runPersonas } from './personarun.ts'
import { detectTestCommand, detectTypeCheck } from './ship.ts'
import type { Agents } from './build.ts'

const CAP = 50
const EXCLUDE = [/(^|\/)(node_modules|dist|build|out|\.git|\.planning)\//, /\.lock$/, /\.min\.(js|css)$/, /\.map$/, /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|mp[34]|wasm|bin)$/i]
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|vue|svelte|css|scss)$/

export type PolishScope = { files: string[]; base: number; expanded: number; excluded: number; warnings: string[]; label: string; error?: string }

const stem = (f: string) => f.replace(/^.*\//, '').replace(/\.[^.]+$/, '')

export async function polishScope(io: Io, opts: { phase?: number; target?: string; scope?: 'changed' | 'dependents' | 'directory' }): Promise<PolishScope> {
  const scope = opts.scope ?? 'dependents'
  const all = await listFiles(io)
  let base: string[] = []
  let label = ''
  if (opts.target) {
    const t = opts.target.replace(/^\.\//, '').replace(/\/$/, '')
    const re = t.includes('*') ? new RegExp('^' + t.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$') : undefined
    base = all.filter(f => re ? re.test(f) : f === t || f.startsWith(t + '/'))
    label = t
  } else {
    const p = await loadProject(io)
    const n = opts.phase ?? p.state?.phase
    if (n && findPhaseDir(p.phaseDirs, n)) {
      const ph = await loadPhase(io, p, n)
      base = [...new Set(ph.plans.flatMap(pl => pl.fm.files_modified ?? []))].filter(f => all.includes(f))
      label = `phase ${n}`
    }
  }
  if (!base.length) return { files: [], base: 0, expanded: 0, excluded: 0, warnings: [], label, error: 'Cannot auto-detect scope. Pass a target path, --phase N, or run it inside a phase with built plans.' }
  const set = new Set(base)
  let expanded = 0
  if (scope !== 'changed') {
    const sources = all.filter(f => CODE.test(f) && !set.has(f))
    for (const b of base) {
      const s = stem(b)
      if (s === 'index' || s.length < 3) continue
      const pat = new RegExp(`(import|require|from)[^\\n]*['"][^'"]*\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.[a-z]+)?['"]`)
      for (const f of sources) if (!set.has(f) && pat.test((await io.read(f)) ?? '')) { set.add(f); expanded++ }
    }
  }
  let files = [...set]
  if (scope === 'directory' && opts.target) files = files.filter(f => f.startsWith(opts.target!.replace(/^\.\//, '').replace(/\/$/, '') + '/'))
  const before = files.length
  files = files.filter(f => !EXCLUDE.some(r => r.test(f)))
  const warnings: string[] = []
  if (files.length > CAP) {
    warnings.push(`Scope contains ${files.length} files — capping at ${CAP}. Use --scope=changed or a narrower target.`)
    const st = await io.run(['bash', '-c', `stat -c '%Y %n' -- ${files.map(f => `'${f.replace(/'/g, '')}'`).join(' ')} 2>/dev/null`])
    const mtime = new Map(st.stdout.split('\n').filter(Boolean).map(l => [l.slice(l.indexOf(' ') + 1), Number(l.split(' ')[0])]))
    files = files.sort((a, b) => (mtime.get(b) ?? 0) - (mtime.get(a) ?? 0)).slice(0, CAP)
  }
  return { files: files.sort(), base: base.length, expanded, excluded: before - files.length, warnings, label }
}

export const PASSES = `Run four passes in order over the files in scope. Auto-apply only mechanical, rule-bound changes; FLAG anything that needs judgment.
1 Comment cleanup. Remove: restates-code, ai-narration, commented-out-code, stale-todo, noise-divider, signature-restatement. Preserve: intent, business-logic, legal-header, todo-with-ref, gotcha-warning, type-annotation, regex-explanation. Log: \`PASS1 | file:line | CLEAN | "text (<=80 chars)" | reason\`
2 Simplification. Apply: guard-clause, lookup-table, dead-code, unused-vars, unused-imports, inline-trivial, collapse-wrapper, stdlib-equivalent. Flag: extract-function (>50 lines), remove-export, cross-file-dedup (>10 lines, >80% similar), pattern-replacement. Log: \`PASS2 | file:a-b | SIMPLIFY or FLAG | "desc" | reason\`
3 Readability. Apply local-scope renames (vague-variable, vague-function, ambiguous-param, boolean-naming, negated-boolean) and types (missing-return-type, missing-param-type, replace-any). Flag exported-scope renames, oversized-function (>50 lines), excessive-params (>4), deep-nesting (>3). Log: \`PASS3 | file:line | RENAME, TYPE or FLAG | "old" → "new" | reason\`
4 Consistency. Normalize import-ordering, import-style, naming-outlier, error-handling, string-style, trailing-commas, semicolons, file-structure only where a convention covers more than 70% of the samples or CLAUDE.md states it. Flag new-pattern, ambiguous-split (about 50/50), readability-conflict. Log: \`PASS4 | file:line | NORMALIZE or FLAG | "change" | source\`
Never: formatter concerns (indentation, line length, braces, operator spacing, blank lines), behavior changes, new dependencies, deleting exports, changing test assertions. When unsure, FLAG.
Answer with: the log lines; then \`## Flagged\` with one line per item \`CATEGORY | file | lines | description | rule | suggested change\` (CATEGORY is REFACTOR, EXTRACT, CONVENTION or RENAME); then \`## Files Modified\`.`

export type PolishResult = { text: string; changed: string[]; reverted: string[]; log: string[]; flagged: string[]; safety: { tests: string; types: string } }

export async function polishRun(io: Io, agents: Agents, opts: { phase?: number; target?: string; scope?: 'changed' | 'dependents' | 'directory'; dry_run?: boolean; files?: string[]; save?: boolean }): Promise<PolishResult | string> {
  const sc = opts.files?.length ? { files: opts.files, base: opts.files.length, expanded: 0, excluded: 0, warnings: [], label: opts.target ?? 'selected files' } as PolishScope : await polishScope(io, opts)
  if (sc.error) return sc.error
  const p = await loadProject(io)
  const conventions = [
    ...(await io.read('CLAUDE.md')) ? [`CLAUDE.md (explicit, wins on conflict):\n${((await io.read('CLAUDE.md')) ?? '').slice(0, 3000)}`] : [],
    ...((await io.read('.planning/CODEBASE.md')) ?? '').match(/^## Conventions\n[\s\S]*?(?=\n## )/m) ?? [],
  ].join('\n\n') || 'No CLAUDE.md or codebase map: infer conventions from the largest files in scope (sample up to 10).'
  const testCmd = await detectTestCommand(io, p.settings, 'polish')
  const typeCmd = await detectTypeCheck(io, p.settings)
  const check = async () => ({ tests: testCmd ? (await runVerification(io, [testCmd]))[0]!.passed : undefined, types: typeCmd ? (await runVerification(io, [typeCmd]))[0]!.passed : undefined })
  const baseline = opts.dry_run ? { tests: undefined, types: undefined } : await check()
  const snapshot = new Map<string, string | undefined>()
  for (const f of sc.files) snapshot.set(f, await io.read(f))
  const brief = [opts.dry_run ? 'REPORT ONLY — DRY RUN. Analyze and report what each pass would change. Do NOT modify any files.' : 'Polish these files in place.',
    `Files (${sc.files.length}):`, ...sc.files.map(f => `- ${f}`), '', '## Conventions', conventions, '', '## Passes', PASSES].join('\n')
  const [r] = await runPersonas(io, agents, { runs: [{ agent: 'testing-code-polisher', label: 'polish', brief, writable: sc.files }], read_only: !!opts.dry_run })
  if (!r || r.error) return `Polisher failed: ${r?.error ?? 'no result'}`
  const answer = r.answer ?? ''
  const log = answer.split('\n').filter(l => /^\s*`?PASS[1-4] \|/.test(l)).map(l => l.trim().replace(/^`|`$/g, ''))
  const flagged = (answer.match(/^## Flagged\n([\s\S]*?)(\n## |$)/m)?.[1] ?? '').split('\n').filter(l => /\|/.test(l)).map(l => l.trim().replace(/^- /, ''))
  const changedNow = async () => { const out: string[] = []; for (const f of sc.files) if ((await io.read(f)) !== snapshot.get(f)) out.push(f); return out }
  let changed = await changedNow()
  const reverted: string[] = []
  const restore = async (f: string) => { const t = snapshot.get(f); if (t !== undefined) await io.write(f, t); else await io.run(['rm', '-f', f]) }
  let after = baseline
  if (!opts.dry_run && changed.length) {
    after = await check()
    const regressed = (k: 'tests' | 'types') => baseline[k] === true && after[k] === false
    if (regressed('tests') || regressed('types')) {
      let fixed = false
      for (const f of changed) {
        const polished = (await io.read(f))!
        await restore(f)
        const t = await check()
        if (!(baseline.tests === true && t.tests === false) && !(baseline.types === true && t.types === false)) { reverted.push(f); after = t; fixed = true; break }
        await io.write(f, polished)
      }
      if (!fixed) { for (const f of changed) await restore(f); reverted.push(...changed); after = await check() }
      changed = await changedNow()
    }
  }
  const status = (b: boolean | undefined, a: boolean | undefined) => a === undefined ? 'not run (no command)' : a ? 'PASS' : b === false ? 'FAIL (pre-existing)' : 'REGRESSION'
  const safety = { tests: status(baseline.tests, after.tests), types: status(baseline.types, after.types) }
  const count = (n: number) => log.filter(l => l.startsWith(`PASS${n} |`) && !/\| FLAG \|/.test(l)).length
  const out: string[] = [`Files: ${sc.files.length} (${sc.base} base + ${sc.expanded} dependents, ${sc.excluded} excluded)`, ...sc.warnings]
  if (opts.dry_run) {
    out.push('', '| Pass | File:Line | Rule | Description |', '|------|-----------|------|-------------|', ...log.map(l => { const c = l.split('|').map(x => x.trim()); return `| ${c[0]} | ${c[1]} | ${c[2]} | ${c[3]} ${c[4] ?? ''} |` }),
      ...(flagged.length ? ['', '## Flagged for Review', ...flagged.map(f => `- ${f}`)] : []), '', '**No files were modified.** Run without --dry-run to apply changes.')
    return { text: out.join('\n'), changed: [], reverted: [], log, flagged, safety }
  }
  if (!changed.length && !reverted.length) out.push('Code is already clean. No changes needed.')
  else {
    out.push(`Changed ${changed.length} file(s): ${changed.join(', ') || 'none'}`, `Pass 1 (comments): ${count(1)} | Pass 2 (simplify): ${count(2)} | Pass 3 (readability): ${count(3)} | Pass 4 (consistency): ${count(4)}`)
    out.push('', '| Tests | Type Check | Files reverted |', '|-------|------------|----------------|', `| ${safety.tests} | ${safety.types} | ${reverted.join(', ') || 'none'} |`)
    if (changed.length && p.settings.execution.auto_commit !== false) {
      const err = await commit(io, changed.filter(f => !f.startsWith('.planning/')), `refactor: polish ${sc.label}\n\nPolish applied ${log.filter(l => !/\| FLAG \|/.test(l)).length} changes across ${changed.length} files.\nPass 1 (comments): ${count(1)} | Pass 2 (simplify): ${count(2)}\nPass 3 (readability): ${count(3)} | Pass 4 (consistency): ${count(4)}`)
      out.push(err ?? 'Committed the polish.')
    }
  }
  if (flagged.length) out.push('', `## Flagged for Review (${flagged.length})`, ...flagged.map(f => `- ${f}`))
  const result = { text: out.join('\n'), changed, reverted, log, flagged, safety }
  if (opts.save) await savePolishReport(io, opts.phase ?? p.state?.phase, sc, result)
  return result
}

export async function savePolishReport(io: Io, phase: number | undefined, sc: PolishScope, r: PolishResult): Promise<string> {
  const p = await loadProject(io)
  const dir = phase && findPhaseDir(p.phaseDirs, phase) ? `.planning/phases/${findPhaseDir(p.phaseDirs, phase)}` : '.planning'
  const path = `${dir}/${phase ? `${pad2(phase)}-` : ''}POLISH.md`
  const rows = (n: number) => r.log.filter(l => l.startsWith(`PASS${n} |`) && !/\| FLAG \|/.test(l)).map(l => { const c = l.split('|').map(x => x.trim()); const [file, line] = (c[1] ?? '').split(':'); return `| ${file} | ${line ?? ''} | ${c[3] ?? ''} | ${c[4] ?? ''} |` })
  const text = ['# Polish Report', '', '## Stats', `- Files polished: ${r.changed.length}`, `- Files skipped (excluded/capped): ${sc.excluded}`, `- Comments removed (Pass 1): ${rows(1).length}`, `- Lines simplified (Pass 2): ${rows(2).length}`, `- Symbols renamed (Pass 3): ${rows(3).length}`, `- Patterns normalized (Pass 4): ${rows(4).length}`, '',
    '## Pass 1: Comment Cleanup', '| File | Line | Removed Text | Reason |', '|------|------|--------------|--------|', ...rows(1), '',
    '## Pass 2: Code Simplification', '| File | Lines | Description | Reason |', '|------|-------|-------------|--------|', ...rows(2), '',
    '## Pass 3: Readability Refactoring', '| File | Line | Change | Reason |', '|------|------|--------|--------|', ...rows(3), '',
    '## Pass 4: Consistency Normalization', '| File | Line | Change | Convention Source |', '|------|------|--------|-------------------|', ...rows(4), '',
    '## Flagged for Review', '| Pass | File | Line(s) | Description | Rule |', '|------|------|---------|-------------|------|', ...r.flagged.map(f => { const c = f.split('|').map(x => x.trim()); return `| ${c[0]} | ${c[1]} | ${c[2]} | ${c[3]} | ${c[4] ?? ''} |` }), '',
    '## Safety', '| Check | Result |', '|-------|--------|', `| Tests | ${r.safety.tests} |`, `| Type Check | ${r.safety.types} |`, `| Files reverted | ${r.reverted.join(', ') || 'none'} |`, ''].join('\n')
  await io.write(path, text)
  return path
}
