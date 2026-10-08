// review.evaluator_depth multi-pass (review-evaluators): read-only evaluator
// passes beside the review panel, one invocation per evaluator. UI/UX runs only
// when the phase touches frontend files. Findings carry the category
// evaluator:{type}:pass:{N} and join the panel's dedup and confidence filter.
import { BY_ID, personaBrief } from './registry.ts'
import type { Persona } from './personas.ts'
import { REVIEWER_RULES } from './review.ts'

export type EvaluatorType = 'code-quality' | 'ui-ux' | 'integration' | 'business-logic'
export type Evaluator = { type: EvaluatorType; name: string; persona: string; passes: [string, string][] }

export const EVALUATORS: Evaluator[] = [
  { type: 'code-quality', name: 'Code Quality', persona: 'engineering-senior-developer', passes: [
    ['Build Integrity', 'the codebase compiles and all imports resolve'],
    ['Type Safety', 'type correctness, type coverage, unsafe casts'],
    ['Code Patterns and State Management', 'new code follows project conventions and handles state correctly'],
    ['Error Handling', 'completeness and correctness of error handling in the changed code'],
    ['Dead Code and Cleanup', 'code no longer needed or left in from development'],
    ['Test Coverage', 'the changes are adequately covered by tests'],
  ] },
  { type: 'ui-ux', name: 'UI/UX', persona: 'design-ux-architect', passes: [
    ['Design System Adherence', 'UI elements use the design system tokens and components'],
    ['Visual Consistency', 'visual appearance is cohesive across the changed components'],
    ['Layout and Structure', 'page layout, component hierarchy and visual organization'],
    ['Responsive Behavior', 'behavior across viewport sizes and device types'],
    ['Component States and Conditional Rendering', 'every interactive state and conditional branch is handled'],
    ['Accessibility (WCAG 2.1 AA)', 'compliance with WCAG 2.1 Level AA'],
    ['Usability', "the changed interfaces against Nielsen's heuristics"],
  ] },
  { type: 'integration', name: 'Integration', persona: 'testing-api-tester', passes: [
    ['API Contract Verification', 'API consumers and providers agree on contracts'],
    ['Authentication Flow', 'authentication and authorization integration is correct'],
    ['Data Persistence and Schema', 'storage, retrieval and schema alignment'],
    ['Error Recovery', 'the integration layer handles failures and recovers'],
    ['Environment Configuration', 'environment-specific configuration is correct and safely managed'],
    ['End-to-End Flow', 'complete user journeys from entry point to persistence'],
  ] },
  { type: 'business-logic', name: 'Business Logic', persona: 'product-feedback-synthesizer', passes: [
    ['Product Rules Compliance', 'the product rules and business constraints from the requirements are enforced'],
    ['Feature Correctness', 'the feature behaves as specified'],
    ['Edge Cases', 'business edge cases the implementation does not handle'],
    ['State Transitions', 'stateful entities follow valid transition rules'],
    ['Data Flow', 'data moves through the business layer without loss, corruption or leakage'],
    ['User Journey Completeness', 'the complete user journey in the requirements is supported'],
  ] },
]

export const FRONTEND = /\.(css|scss|sass|less|vue|svelte|astro|jsx|tsx|html)$/

export function evaluatorsFor(files: string[]): Evaluator[] {
  const ui = files.some(f => FRONTEND.test(f))
  return EVALUATORS.filter(e => e.type !== 'ui-ux' || ui)
}

export const evaluatorPersona = (e: Evaluator): Persona => BY_ID.get(e.persona) ?? BY_ID.get('engineering-senior-developer')!

export function evaluatorBrief(e: Evaluator, o: { phase: number; name: string; goal: string; criteria: string[]; files: string[] }): string {
  return [
    personaBrief(evaluatorPersona(e)),
    '',
    `# ${e.name} Evaluator: Phase ${o.phase}: ${o.name}`,
    `Goal: ${o.goal || '(see CONTEXT.md)'}`,
    ...(o.criteria.length ? ['Success criteria:', ...o.criteria.map(c => `- ${c}`)] : []),
    '',
    `Files to evaluate: ${o.files.join(', ') || '(none)'}`,
    '',
    `## Passes — run each in order, every pass on every file`,
    ...e.passes.map(([n, c], i) => `${i + 1}. ${n}: ${c}`),
    '',
    `Set each finding's Category to evaluator:${e.type}:pass:N (N the pass number). A pass with no findings is a PASS.`,
    'You are an evaluator. Do not modify any file.',
    REVIEWER_RULES,
  ].join('\n')
}
