// Haiku prompt ceiling (Phase 4). Pure; the turn.step and tool.call hooks do the I/O.
//
// A request's exact size is known only after it is sent (its usage), so each
// helper step is projected: the previous request's prompt (exact) plus what the
// conversation has grown by since then, counted from its characters at a
// deliberately low chars-per-token rate so the projection errs high.

// Haiku's pricing line: over this many prompt tokens a request is billed at the higher rate.
export const HAIKU_LINE = 100_000
// Chars per token for projecting growth. Code, logs and JSON tokenize at 2.5 to
// 3.5 chars a token; the low end keeps the projection above the real count.
const GROWTH_CHARS_PER_TOKEN = 2.5
// System prompt plus tool list of a helper's first request (measured ~6.3k; see SPIKE.md).
export const FIRST_OVERHEAD = 8_000
// Headroom for the request's own framing and the token count's error.
const MARGIN = 1_000

export type Meter = {
  lastPrompt: number // prompt tokens of the agent's previous request (input + cache read + cache write)
  charsAtLast: number // the conversation's size in chars when that request was sent
  warned: boolean // the wrap-up note was sent
}

export const newMeter = (): Meter => ({ lastPrompt: 0, charsAtLast: 0, warned: false })

// Size of a conversation in Messages API form, in chars of its content.
export function apiChars(messages: readonly { content: unknown }[]): number {
  let n = 0
  for (const m of messages) n += JSON.stringify(m.content ?? '').length
  return n
}

export const growthTokens = (chars: number) => Math.ceil(Math.max(0, chars) / GROWTH_CHARS_PER_TOKEN)

// Projected prompt tokens of the next request, given the conversation's size now.
export function project(m: Meter, charsNow: number): number {
  if (!m.lastPrompt) return FIRST_OVERHEAD + growthTokens(charsNow) + MARGIN
  return m.lastPrompt + growthTokens(charsNow - m.charsAtLast) + MARGIN
}

// Whether a tool result of this many chars would take the next request past the ceiling.
// Without the conversation's current size, the previous request plus the result is the floor.
export function resultOverflows(m: Meter, resultChars: number, ceiling: number): boolean {
  return m.lastPrompt > 0 && m.lastPrompt + growthTokens(resultChars) + MARGIN > ceiling
}

export const WRAP_UP_NOTE = (tokens: number, ceiling: number) =>
  `triad: your conversation is about ${Math.round(tokens / 1000)}k tokens; the limit is ${Math.round(ceiling / 1000)}k. ` +
  `Finish the step you are on, do not start new reads, and return now with status partial (what is done, and what is left) or done.`

export const TRIMMED_RESULT = (tokens: number, path: string) =>
  `[triad: this output is about ${tokens} tokens, more than your remaining budget, so it was not shown. ` +
  `It is saved in ${path}. Do not read it whole: return status partial now, saying what is done and what is left.]`

// The reply that stands in for a request the mod does not send. It follows the
// return schema, so the parent can act on it: what was done, what is left.
export function partialReply(o: { projected: number; ceiling: number; done?: string; left?: string; changes: string[] }): string {
  const lines = [
    'status: partial',
    'summary:',
    `- stopped by triad before a request of ~${Math.round(o.projected / 1000)}k tokens (helper limit ${Math.round(o.ceiling / 1000)}k).`,
    `- done: ${oneLine(o.done) || 'see changes; the helper wrote no progress notes.'}`,
    `- left: ${oneLine(o.left) || 'the rest of the brief; give it to a fresh helper as a narrower job.'}`,
    o.changes.length ? 'changes:' : 'changes: none',
    ...o.changes.map(p => `- ${p} | edit | written before the stop; review it`),
    'verify: none',
  ]
  return lines.join('\n')
}

const oneLine = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 600)

// Prompt for a one-shot that reads the stopped helper's transcript tail and says
// what it finished and what remains.
export const PROGRESS_SYSTEM = `You read the transcript of a helper agent that was stopped before it finished. Report its progress for the agent that will continue the job. Answer in exactly two lines:
done: <what the helper finished, with file paths and counts>
left: <what the brief still asks for that the helper had not done>
Do not invent anything. No preamble.`

export function progressPrompt(brief: string, transcript: string): string {
  return `Brief:\n${brief.slice(0, 6000)}\n\nTranscript (most recent part):\n${transcript}`
}

export function parseProgress(text: string): { done?: string; left?: string } {
  return {
    done: text.match(/^\s*done:\s*(.+)$/im)?.[1],
    left: text.match(/^\s*left:\s*(.+)$/im)?.[1],
  }
}

// The tail of a transcript, in rows, up to `maxChars`: the agent's own words in
// full, tool calls by name and input, tool results cut short.
export function transcriptTail(rows: readonly { role: string; text: string; toolUses?: readonly { name?: string; input?: unknown }[]; toolResults?: readonly { text?: string }[] }[], maxChars: number): string {
  const out: string[] = []
  let n = 0
  for (let i = rows.length - 1; i >= 0 && n < maxChars; i--) {
    const r = rows[i]!
    const parts: string[] = []
    if (r.text) parts.push(`${r.role}: ${r.text}`)
    for (const u of r.toolUses ?? []) parts.push(`tool ${u.name ?? '?'} ${JSON.stringify(u.input ?? {}).slice(0, 300)}`)
    for (const t of r.toolResults ?? []) parts.push(`result: ${(t.text ?? '').slice(0, 400)}`)
    const s = parts.join('\n')
    out.push(s)
    n += s.length
  }
  return out.reverse().join('\n').slice(-maxChars)
}
