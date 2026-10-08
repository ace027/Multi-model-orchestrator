// A JSON Schema validator for the keywords Legion's schemas use (draft-07 and
// 2020-12): type, required, properties, additionalProperties, enum, const,
// pattern, minimum, maximum, minLength, minItems, items, oneOf, anyOf, allOf,
// not, if/then/else. `format`, `default` and annotations are ignored, as Ajv
// does without ajv-formats. Errors read like Ajv's: "<path> <message>".

export type Schema = Record<string, any> | boolean

const typeOf = (v: unknown): string =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v

function hasType(v: unknown, t: string): boolean {
  const a = typeOf(v)
  return a === t || (t === 'number' && a === 'integer')
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function validate(schema: Schema, value: unknown, path = ''): string[] {
  if (schema === true) return []
  if (schema === false) return [`${path || '/'} is not allowed`]
  const s = schema
  const at = path || '/'
  const errs: string[] = []
  if (s.type !== undefined) {
    const types: string[] = Array.isArray(s.type) ? s.type : [s.type]
    if (!types.some(t => hasType(value, t))) return [`${at} must be ${types.join(' or ')}`]
  }
  if (s.const !== undefined && !equal(value, s.const)) errs.push(`${at} must be ${JSON.stringify(s.const)}`)
  if (s.enum && !s.enum.some((e: unknown) => equal(e, value))) errs.push(`${at} must be one of ${s.enum.map((e: unknown) => JSON.stringify(e)).join(', ')}`)
  if (typeof value === 'string') {
    if (s.minLength !== undefined && [...value].length < s.minLength) errs.push(`${at} must have at least ${s.minLength} characters`)
    if (s.maxLength !== undefined && [...value].length > s.maxLength) errs.push(`${at} must have at most ${s.maxLength} characters`)
    if (s.pattern && !new RegExp(s.pattern, 'u').test(value)) errs.push(`${at} must match ${s.pattern}`)
  }
  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) errs.push(`${at} must be >= ${s.minimum}`)
    if (s.maximum !== undefined && value > s.maximum) errs.push(`${at} must be <= ${s.maximum}`)
  }
  if (Array.isArray(value)) {
    if (s.minItems !== undefined && value.length < s.minItems) errs.push(`${at} must have at least ${s.minItems} items`)
    if (s.maxItems !== undefined && value.length > s.maxItems) errs.push(`${at} must have at most ${s.maxItems} items`)
    if (s.items !== undefined && !Array.isArray(s.items)) value.forEach((v, i) => errs.push(...validate(s.items, v, `${path}/${i}`)))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    for (const k of s.required ?? []) if (!(k in o)) errs.push(`${at} must have required property '${k}'`)
    const props: Record<string, Schema> = s.properties ?? {}
    for (const [k, v] of Object.entries(o)) {
      if (k in props) errs.push(...validate(props[k]!, v, `${path}/${k}`))
      else if (s.additionalProperties === false) errs.push(`${at} must not have additional property '${k}'`)
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') errs.push(...validate(s.additionalProperties, v, `${path}/${k}`))
    }
  }
  for (const sub of s.allOf ?? []) errs.push(...validate(sub, value, path))
  if (s.anyOf && !s.anyOf.some((sub: Schema) => !validate(sub, value, path).length)) errs.push(`${at} must match a schema in anyOf`)
  if (s.oneOf) {
    const n = s.oneOf.filter((sub: Schema) => !validate(sub, value, path).length).length
    if (n !== 1) errs.push(`${at} must match exactly one schema in oneOf (matched ${n})`)
  }
  if (s.not !== undefined && !validate(s.not, value, path).length) errs.push(`${at} must not match the schema in not`)
  if (s.if !== undefined) {
    const branch = validate(s.if, value, path).length ? s.else : s.then
    if (branch !== undefined) errs.push(...validate(branch, value, path))
  }
  return errs
}
