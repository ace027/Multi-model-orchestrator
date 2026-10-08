// A YAML subset parser for Legion's files: block mappings and sequences, plain,
// quoted and block (| >) scalars, flow [..] {..} collections, comments, and the
// core schema's null/bool/int/float. No anchors, tags or multi-document streams.
// Mod code cannot import packages, so this stands in for `yaml`; the tests check
// it against PyYAML on every YAML file and plan frontmatter in a Legion checkout.

export class YamlError extends Error {}

type Line = { indent: number; text: string; no: number }

export function parseYaml(src: string): unknown {
  const lines: Line[] = []
  const raw = src.replace(/\r\n?/g, '\n').split('\n')
  let content = false
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]!
    if (/^(---|\.\.\.)(\s|$)/.test(r)) {
      if (content) break
      const rest = r.slice(3).trim()
      if (rest && !rest.startsWith('#')) { lines.push({ indent: 0, text: rest, no: i + 1 }); content = true }
      continue
    }
    if (stripComment(r.trim()) !== '') content = true
    lines.push({ indent: r.length - r.trimStart().length, text: r, no: i + 1 })
  }
  const p = new Parser(lines)
  p.skipBlank()
  if (p.done()) return null
  const v = p.block(p.peek()!.indent)
  p.skipBlank()
  if (!p.done()) throw new YamlError(`line ${p.peek()!.no}: unexpected content`)
  return v
}

// Text with a trailing comment removed (a # after whitespace, outside quotes).
function stripComment(s: string): string {
  let q: string | null = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) {
        if (q === "'" && s[i + 1] === "'") i++
        else q = null
      } else if (c === '\\' && q === '"') i++
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s\[{,:-]/.test(s[i - 1]!)) q = c
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i).trimEnd()
  }
  return s.trimEnd()
}

class Parser {
  i = 0
  lines: Line[]
  constructor(lines: Line[]) { this.lines = lines }
  done() { return this.i >= this.lines.length }
  peek() { return this.lines[this.i] }
  content(l: Line) { return stripComment(l.text.slice(l.indent)) }
  skipBlank() {
    while (!this.done() && this.content(this.peek()!) === '') this.i++
  }

  block(indent: number): unknown {
    this.skipBlank()
    const l = this.peek()
    if (!l || l.indent < indent) return null
    const c = this.content(l)
    if (c === '-' || c.startsWith('- ')) return this.seq(l.indent)
    if (keyOf(c)) return this.map(l.indent)
    return this.plainBlock(l.indent)
  }

  // A scalar alone on its line(s), possibly a multi-line plain or flow value.
  plainBlock(indent: number): unknown {
    const parts: string[] = []
    while (!this.done()) {
      const l = this.peek()!
      const c = this.content(l)
      if (c === '') { this.i++; continue }
      if (l.indent < indent) break
      parts.push(c)
      this.i++
    }
    return scalarOrFlow(parts.join(' '))
  }

  seq(indent: number): unknown[] {
    const out: unknown[] = []
    for (;;) {
      this.skipBlank()
      const l = this.peek()
      if (!l || l.indent !== indent) break
      const c = this.content(l)
      if (!(c === '-' || c.startsWith('- '))) break
      const rest = c === '-' ? '' : c.slice(2)
      const restTrim = rest.trimStart()
      const inner = indent + 2 + (rest.length - restTrim.length)
      if (restTrim === '') {
        this.i++
        out.push(this.block(indent + 1))
      } else if (restTrim === '-' || restTrim.startsWith('- ') || keyOf(restTrim)) {
        // An inline mapping or nested sequence: re-read this line at its inner indent.
        this.lines[this.i] = { indent: inner, text: ' '.repeat(inner) + restTrim, no: l.no }
        out.push(this.block(inner))
      } else {
        this.i++
        out.push(this.inlineValue(restTrim, indent))
      }
    }
    return out
  }

  map(indent: number): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (;;) {
      this.skipBlank()
      const l = this.peek()
      if (!l || l.indent !== indent) break
      const c = this.content(l)
      const k = keyOf(c)
      if (!k) {
        if (c === '-' || c.startsWith('- ')) break
        throw new YamlError(`line ${l.no}: expected "key: value"`)
      }
      this.i++
      const rest = c.slice(k.end).trim()
      let v: unknown
      if (rest === '') {
        this.skipBlank()
        const n = this.peek()
        if (n && n.indent > indent) v = this.block(n.indent)
        else if (n && n.indent === indent && /^-( |$)/.test(this.content(n))) v = this.seq(indent)
        else v = null
      } else v = this.inlineValue(rest, indent)
      out[k.key] = v
    }
    return out
  }

  // The value after "key:" or "- " on the same line: a block scalar indicator,
  // a flow collection (possibly continued on following lines), or a scalar.
  inlineValue(rest: string, indent: number): unknown {
    if (/^[|>][-+0-9]*$/.test(rest)) return this.blockScalar(rest, indent)
    let text = rest
    if ((text.startsWith('[') || text.startsWith('{')) && !balanced(text)) {
      while (!this.done() && !balanced(text)) text += ' ' + this.content(this.lines[this.i++]!)
    } else if (!/^["']/.test(text)) {
      // A plain scalar may continue on more-indented lines.
      while (!this.done()) {
        const n = this.peek()!
        const c = this.content(n)
        if (c === '' || n.indent <= indent || keyOf(c) || c.startsWith('- ')) break
        text += ' ' + c
        this.i++
      }
    } else if (!quotedComplete(text)) {
      while (!this.done() && !quotedComplete(text)) text += ' ' + this.lines[this.i++]!.text.trim()
    }
    return scalarOrFlow(text)
  }

  blockScalar(ind: string, parentIndent: number): string {
    const folded = ind[0] === '>'
    const chomp = ind.includes('-') ? 'strip' : ind.includes('+') ? 'keep' : 'clip'
    const body: string[] = []
    let blockIndent = -1
    while (!this.done()) {
      const l = this.lines[this.i]!
      const blank = l.text.trim() === ''
      if (!blank) {
        if (blockIndent < 0) blockIndent = l.indent
        if (l.indent < blockIndent || l.indent <= parentIndent) break
      }
      body.push(blank ? '' : l.text.slice(blockIndent))
      this.i++
    }
    let trailing = 0
    while (body.length && body[body.length - 1] === '') { body.pop(); trailing++ }
    let text: string
    if (!folded) text = body.join('\n')
    else {
      text = ''
      for (let j = 0; j < body.length; j++) {
        const cur = body[j]!
        if (j === 0) { text = cur; continue }
        const prev = body[j - 1]!
        const more = (s: string) => s.startsWith(' ') || s.startsWith('\t')
        if (cur === '') text += '\n'
        else if (prev === '' || more(cur) || more(prev)) text += (prev === '' ? '' : '\n') + cur
        else text += ' ' + cur
      }
    }
    if (!body.length) return ''
    if (chomp === 'strip') return text
    if (chomp === 'keep') return text + '\n'.repeat(trailing + 1)
    return text + '\n'
  }
}

// "key:" at the start of a line: the key and where its value starts.
function keyOf(c: string): { key: string; end: number } | undefined {
  if (c.startsWith('"') || c.startsWith("'")) {
    const q = c[0]!
    let i = 1
    for (; i < c.length; i++) {
      if (c[i] === '\\' && q === '"') { i++; continue }
      if (c[i] === q) {
        if (q === "'" && c[i + 1] === "'") { i++; continue }
        break
      }
    }
    const after = c.slice(i + 1)
    const m = after.match(/^\s*:(\s|$)/)
    if (!m) return undefined
    return { key: String(parseScalar(c.slice(0, i + 1))), end: i + 1 + m[0].length }
  }
  if (/^[\[{]/.test(c) || c.startsWith('- ') || c === '-') return undefined
  const m = c.match(/^([^#].*?)\s*:(\s|$)/)
  if (!m || /^[|>]/.test(m[1]!)) return undefined
  return { key: m[1]!, end: m[0].length }
}

function quotedComplete(s: string): boolean {
  const q = s[0]
  for (let i = 1; i < s.length; i++) {
    if (s[i] === '\\' && q === '"') { i++; continue }
    if (s[i] === q) {
      if (q === "'" && s[i + 1] === "'") { i++; continue }
      return true
    }
  }
  return false
}

function balanced(s: string): boolean {
  let depth = 0
  let q: string | null = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '\\' && q === '"') i++
      else if (c === q) q = null
    } else if (c === '"' || c === "'") q = c
    else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth--
  }
  return depth <= 0
}

function scalarOrFlow(s: string): unknown {
  const t = s.trim()
  if (t.startsWith('[') || t.startsWith('{')) {
    const f = new Flow(t)
    const v = f.value()
    f.ws()
    if (f.i !== t.length) throw new YamlError(`unexpected text after flow collection: ${t.slice(f.i, f.i + 20)}`)
    return v
  }
  return parseScalar(t)
}

class Flow {
  i = 0
  s: string
  constructor(s: string) { this.s = s }
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++ }
  value(): unknown {
    this.ws()
    const c = this.s[this.i]
    if (c === '[') {
      this.i++
      const out: unknown[] = []
      for (;;) {
        this.ws()
        if (this.s[this.i] === ']') { this.i++; return out }
        out.push(this.value())
        this.ws()
        if (this.s[this.i] === ',') this.i++
        else if (this.s[this.i] !== ']') throw new YamlError('expected , or ] in flow sequence')
      }
    }
    if (c === '{') {
      this.i++
      const out: Record<string, unknown> = {}
      for (;;) {
        this.ws()
        if (this.s[this.i] === '}') { this.i++; return out }
        const k = String(this.scalar(true))
        this.ws()
        let v: unknown = null
        if (this.s[this.i] === ':') { this.i++; v = this.value() }
        out[k] = v
        this.ws()
        if (this.s[this.i] === ',') this.i++
        else if (this.s[this.i] !== '}') throw new YamlError('expected , or } in flow mapping')
      }
    }
    return this.scalar(false)
  }
  scalar(isKey: boolean): unknown {
    this.ws()
    const c = this.s[this.i]
    if (c === '"' || c === "'") {
      const start = this.i++
      for (; this.i < this.s.length; this.i++) {
        if (this.s[this.i] === '\\' && c === '"') { this.i++; continue }
        if (this.s[this.i] === c) {
          if (c === "'" && this.s[this.i + 1] === "'") { this.i++; continue }
          break
        }
      }
      this.i++
      return parseScalar(this.s.slice(start, this.i))
    }
    const start = this.i
    while (this.i < this.s.length) {
      const ch = this.s[this.i]!
      if (ch === ',' || ch === ']' || ch === '}') break
      if (ch === ':' && (isKey ? /[\s,\]}]/.test(this.s[this.i + 1] ?? ' ') : /\s/.test(this.s[this.i + 1] ?? ' '))) break
      this.i++
    }
    return parseScalar(this.s.slice(start, this.i).trim())
  }
}

const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', '/': '/', '0': '\0', ' ': ' ', b: '\b', e: '\x1b' }

export function parseScalar(t: string): unknown {
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)/g, (_, e: string) =>
      e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : ESC[e] ?? e)
  }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'")
  if (t === '' || t === '~' || /^(null|Null|NULL)$/.test(t)) return null
  if (/^(true|True|TRUE)$/.test(t)) return true
  if (/^(false|False|FALSE)$/.test(t)) return false
  if (/^[-+]?(0|[1-9][0-9_]*)$/.test(t)) return Number(t.replace(/_/g, ''))
  if (/^0o[0-7]+$/.test(t)) return parseInt(t.slice(2), 8)
  if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t.slice(2), 16)
  if (/^[-+]?(\.[0-9]+|[0-9][0-9_]*(\.[0-9_]*)?)([eE][-+]?[0-9]+)?$/.test(t)) return Number(t.replace(/_/g, ''))
  if (/^[-+]?\.(inf|Inf|INF)$/.test(t)) return t.startsWith('-') ? -Infinity : Infinity
  if (/^\.(nan|NaN|NAN)$/.test(t)) return NaN
  return t
}

// Splits a markdown file into its YAML frontmatter (parsed) and body.
export function splitFrontmatter(text: string): { data: Record<string, unknown> | null; body: string; raw: string } {
  const m = text.replace(/^﻿/, '').match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/)
  if (!m) return { data: null, body: text, raw: '' }
  const v = parseYaml(m[1]!)
  return { data: v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}, body: text.slice(m[0].length), raw: m[1]! }
}
