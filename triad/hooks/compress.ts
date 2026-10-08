// Result compression helpers (Phase 3). Pure; the tool.call hook does the I/O.
import { approxTokens } from './policy.ts'

export const COMPRESS_TOOLS = ['Bash', 'Grep', 'Read']
// Source files are read to be edited, so their text must stay exact. Only
// log-like files are compressed when read.
const LOGLIKE = /\.(log|txt|out|jsonl|csv|tsv|xml|html?)$|(^|\/)(logs?|output|tmp)\//i
// Haiku one-shot input per chunk: 60k tokens (SPEC section 4), at ~3.5 chars a token.
export const CHUNK_CHARS = 60_000 * 3.5
export const MAX_CHUNKS = 8
const ERRORLINE = /\w*(error|exception)\b|\b(traceback|fail(ed|ure|ing)?|fatal|panic|assert\w*|denied|refused|segfault|undefined reference|cannot|could not|not found)\b|^\s*E\s{2,}|^FAIL|^ERROR/i
const MAX_ERROR_LINES = 40
const MAX_ERROR_CHARS = 6_000

export function eligible(tool: string, input: Record<string, unknown>): boolean {
  if (tool === 'Bash' || tool === 'Grep') return true
  if (tool === 'Read') return LOGLIKE.test(String(input.file_path ?? ''))
  return false
}

export const overThreshold = (text: string, thresholdTokens: number) => approxTokens(text) > thresholdTokens

// Error lines kept verbatim, deduplicated, in order, capped.
export function errorLines(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let chars = 0
  for (const line of text.split('\n')) {
    if (!ERRORLINE.test(line)) continue
    const key = line.trim().replace(/\d+/g, '#')
    if (seen.has(key)) continue
    seen.add(key)
    const l = line.length > 300 ? line.slice(0, 300) + ' …' : line
    if (out.length >= MAX_ERROR_LINES || chars + l.length > MAX_ERROR_CHARS) {
      out.push(`… more error lines in the saved output`)
      break
    }
    out.push(l)
    chars += l.length
  }
  return out
}

// Splits text into chunks on line boundaries. Over MAX_CHUNKS, keeps the first
// and last halves and says how much was skipped.
export function chunks(text: string, size = CHUNK_CHARS): { parts: string[]; skipped: number } {
  const parts: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(text.length, i + size)
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end)
      if (nl > i) end = nl + 1
    }
    parts.push(text.slice(i, end))
    i = end
  }
  if (parts.length <= MAX_CHUNKS) return { parts, skipped: 0 }
  const half = MAX_CHUNKS / 2
  return { parts: [...parts.slice(0, half), ...parts.slice(-half)], skipped: parts.length - MAX_CHUNKS }
}

// Byte-stable system prompt for every summary call.
export const SUMMARY_SYSTEM = `You compress tool output for a coding agent that cannot see the original. Write a dense summary, at most 250 words, that keeps everything the agent needs to act:
- exact file paths, line numbers, function and test names, counts, versions, and identifiers;
- the outcome (passed/failed totals, exit status) and each distinct failure with its message quoted exactly;
- patterns across repeated lines (say how many times and quote one);
- anything relevant to the agent's task, called out first.
Do not invent anything. Do not add advice. Plain text, no preamble.`

export function summaryPrompt(o: { tool: string; what: string; task: string; part?: [number, number]; text: string }): string {
  const part = o.part ? ` (part ${o.part[0]} of ${o.part[1]})` : ''
  return `Agent's task: ${o.task || 'not given'}\nTool: ${o.tool} ${o.what}\nOutput${part}:\n${o.text}`
}

export function mergePrompt(task: string, what: string, summaries: string[]): string {
  return `Agent's task: ${task || 'not given'}\nThese are summaries of consecutive parts of one tool output (${what}). Merge them into one summary under the same rules.\n\n` +
    summaries.map((s, i) => `--- part ${i + 1}\n${s}`).join('\n\n')
}

export function headTail(text: string, lines = 40): string {
  const all = text.split('\n')
  if (all.length <= lines * 2) return text
  return [...all.slice(0, lines), `… ${all.length - lines * 2} lines omitted …`, ...all.slice(-lines)].join('\n')
}

export function render(o: { path: string; lines: number; tokens: number; errors: string[]; summary: string; skipped: number }): string {
  const head = `[triad: output compressed. ${o.lines} lines, ~${o.tokens} tokens; the full text is in ${o.path}. Grep it or read line ranges for detail.]`
  const parts = [head]
  if (o.skipped) parts.push(`[the middle ${o.skipped} parts were too long to summarize; see the file]`)
  if (o.errors.length) parts.push('Error lines (verbatim):\n' + o.errors.join('\n'))
  parts.push('Summary:\n' + o.summary.trim())
  return parts.join('\n\n')
}

// What the agent ran, for the summary prompt and the saved file's header.
export function describeCall(tool: string, input: Record<string, unknown>): string {
  if (tool === 'Bash') return '`' + String(input.command ?? '').slice(0, 300) + '`'
  if (tool === 'Grep') return `pattern ${JSON.stringify(input.pattern ?? '')} in ${String(input.path ?? '.')}`
  return String(input.file_path ?? '')
}
