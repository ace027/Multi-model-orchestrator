// Lean rules (option `lean`), adapted from Ponytail (PONYTAIL-NOTICE.md): the
// smallest complete change. Pure text, no `$` here; each block is byte-stable
// for a level so it caches.

export const LEAN_LEVELS = ['off', 'lite', 'full', 'ultra'] as const
export type LeanLevel = (typeof LEAN_LEVELS)[number]

export function leanLevel(v: unknown): LeanLevel {
  const s = String(v ?? '').trim().toLowerCase()
  return (LEAN_LEVELS as readonly string[]).includes(s) ? (s as LeanLevel) : 'full'
}

const NEVER_CUT = '- Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, or anything the brief asks for.'
const SKIPPED = '- Add one `skipped:` line to your reply: what you chose not to build or check (only things the brief did not ask for) and any risk. Planned work is never skipped.'

const LADDER = [
  'Make the smallest complete change. Take the first option that fully works:',
  '1. Does it need to exist? Build no feature, option or flexibility the brief does not ask for.',
  '2. Already in this codebase (a helper, component, pattern)? Use it the way the surrounding code does.',
  '3. The standard library or a platform feature? Use it, unless the project has its own.',
  '4. An installed dependency? Use it. Never add a dependency for a few lines.',
  '5. Otherwise: the minimum code that works, in a form a reader gets at a glance.',
  '- Be lazy about the solution, never about the change: finish every part the brief needs, including the callers, tests and fixtures your change breaks.',
  '- No abstraction, wrapper, option, config or "for later" code nobody asked for. Deletion beats addition. Keep the structure and conventions the codebase has.',
  '- Bug fix: grep every caller of the function you touch, and fix the root cause once, in the shared code.',
  '- Code you move or merge keeps its error handling and validation.',
  '- New non-trivial logic (a branch, a parser, money, security, data writes) gets one small test unless the brief\'s tests already cover it.',
  '- A shortcut with a known limit gets a comment: `shortcut: <the limit>, <when to upgrade>`.',
]

// Appended to every coder brief (Sonnet and Opus coders, review fix rounds).
export function leanBrief(level: LeanLevel): string {
  if (level === 'off') return ''
  if (level === 'lite') return [
    '## Lean rules (lite)',
    'Build what the brief asks, and nothing it does not. Where a clearly smaller option would do, build the brief anyway and name the smaller option in your reply.',
    NEVER_CUT, SKIPPED,
  ].join('\n')
  return [
    `## Lean rules (${level})`,
    ...LADDER,
    ...(level === 'ultra' ? ['- A part of the brief its goal does not justify: build it anyway and name it under `skipped:`, so the orchestrator can cut it.'] : []),
    NEVER_CUT, SKIPPED,
  ].join('\n')
}

// Added to the orchestrator guidance (main loop only).
export function leanGuide(level: LeanLevel): string {
  if (level === 'off') return ''
  const lines = [
    `## Lean (option lean: ${level})`,
    'Solve the whole task with the least new code, yours and the coders\'.',
    '- Before building, list everything the change must reach (callers, tests, config): that is scope. Features, options and flexibility nobody asked for are not: skip them and name them in one line.',
    '- Reuse what the codebase has, then the standard library, then installed dependencies, before writing new code. No new dependency for a few lines.',
    '- Coders get the lean rules with every brief: brief only what was asked.',
  ]
  if (level === 'lite') lines.splice(2, 1, '- Build what was asked. Where a clearly smaller option would do, name it in one line and let the user pick.')
  if (level === 'ultra') lines.push('- Question the request before building: push back on any part the need does not justify. Under /triad:auto, cut it and record it under Key Decisions as assumed.')
  lines.push('- End your final reply with one or two lines: what you skipped or did not check, and any risk.')
  return lines.join('\n')
}

// Added to every reviewer brief (and the closing check).
export function leanReviewRules(level: LeanLevel): string {
  if (level === 'off') return ''
  return [
    'Lean review rules:',
    '- Every finding needs a concrete case: this input or situation leads to this wrong result. Put it in Issue. No case, no finding.',
    '- Re-read the lines before you report: the caller exists, the value can really be empty, the code really is unused.',
    '- A `shortcut:` comment that names its limit is a decision, not a finding, unless the phase\'s stated load already crosses it.',
    '- Category lean, severity minor: code that should not exist or should be smaller. delete (dead code, unused options), reuse (the codebase already has it: name the path), stdlib (the platform does it; a new dependency for a few lines), yagni (an abstraction with one implementation, config nobody sets), merge (near-copies that must change together), split (one function doing unrelated jobs).',
    '- Propose the smallest fix that works; prefer fixes that delete code. No style taste, no "consider", no vague worries.',
    '- Plain English: Issue says what the code does and what goes wrong; Why says what happens if it is not fixed.',
  ].join('\n')
}
