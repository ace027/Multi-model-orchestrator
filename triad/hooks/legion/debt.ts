// Shortcut debt (after Ponytail's /ponytail-debt): every `shortcut:` comment
// (and Ponytail's older `ponytail:`) is a known limit someone chose to live
// with. Collected in code, no model calls, so a deferral can't quietly rot.
import type { Io } from './io.ts'

export type Debt = { file: string; line: number; text: string; noTrigger: boolean }

// The comment prefix keeps prose that only mentions the convention out.
const MARKER = String.raw`(#|//|/\*|--|;|<!--) ?(shortcut|ponytail):`
// A marker names its upgrade path after a comma, or with a trigger word.
const TRIGGER = /,|\b(when|if|once|until|before|after|upgrade|switch|replace|past|over|beyond)\b/i

export function parseDebt(grep: string): Debt[] {
  const out: Debt[] = []
  for (const l of grep.split('\n')) {
    const m = l.match(/^(.+?):(\d+):(.*)$/)
    if (!m) continue
    const text = m[3]!.replace(new RegExp(`^.*?${MARKER}\\s*`, 'i'), '').replace(/\s*(\*\/|-->)\s*$/, '').trim()
    // A note about a keyboard shortcut is not a deferral.
    if (!text || /^(ctrl|cmd|alt|shift|meta)\b/i.test(text)) continue
    out.push({ file: m[1]!, line: Number(m[2]), text, noTrigger: !TRIGGER.test(text) })
  }
  return out
}

export async function scanDebt(io: Io): Promise<Debt[] | undefined> {
  // Tracked and untracked files, minus what .gitignore ignores; prose files are skipped.
  let r
  try {
    r = await io.run(['git', 'grep', '-nIiE', '--untracked', MARKER, '--', '.', ':(exclude)*.md', ':(exclude).planning', ':(exclude).triad'])
  } catch { return undefined }
  if (r.exitCode === 1) return []
  if (r.exitCode !== 0) return undefined
  return parseDebt(r.stdout)
}

export function renderDebt(d: Debt[] | undefined): string {
  if (!d) return 'Shortcut debt: not a git repository, nothing scanned.'
  if (!d.length) return 'No shortcut debt. Clean ledger.'
  const lines = ['## Shortcut debt', '']
  let file = ''
  for (const x of d) {
    if (x.file !== file) { file = x.file; lines.push(`\`${file}\``) }
    lines.push(`- L${x.line}: ${x.text}${x.noTrigger ? ' [no-trigger]' : ''}`)
  }
  const n = d.filter(x => x.noTrigger).length
  lines.push('', `${d.length} marker${d.length === 1 ? '' : 's'}, ${n} with no trigger.${n ? ' A marker with no trigger names no point to revisit it, so it rots: add one (`shortcut: <the limit>, <when to upgrade>`).' : ''}`)
  return lines.join('\n')
}

// One line for /triad status, empty when there is none.
export function debtLine(d: Debt[] | undefined): string {
  if (!d?.length) return ''
  const n = d.filter(x => x.noTrigger).length
  return `Shortcut debt: ${d.length} marker${d.length === 1 ? '' : 's'}${n ? `, ${n} with no trigger` : ''} (\`/triad debt\` lists them).`
}

// For retro and milestone facts: the markers that name no trigger.
export function debtFacts(d: Debt[] | undefined): string[] {
  if (!d?.length) return []
  const rot = d.filter(x => x.noTrigger)
  return ['', `## Shortcut debt (computed: ${d.length} markers, ${rot.length} with no trigger)`, ...(rot.length ? rot.map(x => `- ${x.file}:${x.line}: ${x.text}`) : ['- every marker names when to upgrade'])]
}
