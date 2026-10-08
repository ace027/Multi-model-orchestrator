---
phase: 01-engine-and-test-hook
compacted: 2026-10-08
original_summaries: [01-01-SUMMARY.md, 01-02-SUMMARY.md]
requirements_satisfied: [REQ-03, REQ-04, REQ-05, REQ-06, REQ-12, REQ-11]
---

# Phase 1: Engine and test hook — Compacted Summary

## Deliverables
- 01-01 Rules engine, baseline chooseMove and node tests (Complete): js/ai.js, js/engine.js, package.json, tests/ai.test.js, tests/engine.test.js
- 01-02 Minimal page with window.tron test hook and Playwright test (Complete): index.html, js/main.js, tests/hook.test.js

## Decisions
- 01-01: `roundWinner` is 0 on a draw and null while a round is in progress.
- 01-01: A head-on swap needs no special case: each cycle's target is the other's pre-move cell, which is already trail.
- 01-01: Players are 1 or 2 in the public API and indexed 0 and 1 internally.
- 01-02: playwright is not a package dependency and is installed globally, which an ES `import` does not resolve. The test loads it with createRequire, falling back to /
- 01-02: The AI skips the round-start step because tronStep only consults it when the round is not over and there is no match winner.
- 01-02: reset() ignores undefined width, height and obstacles, so the Game constructor defaults apply.

## Conventions and Open Questions
- 01-01 convention: `Game.state()` and `Game.view(n)` return fresh copies, so callers can mutate them freely.
- 01-01 convention: `Game.view(n)` is exactly the object shape `chooseMove` takes.
- 01-01 convention: `Game` also has public `scores` and `round` fields, and `state().players[i].score` mirrors `scores`.
- 01-02 convention: Phase 2 adds the real-time loop in js/main.js. Fill stopLoop() and use the module-level `game`, `ai` and `manual`
- 01-02 convention: `manual` is set to true by reset().
- 01-02 convention: Call tronStep() from the real-time loop. It reads `ai` and `game` and does not update the score or render, so call updateScore() and render() after it.

## Files Modified
| File | Change |
|------|--------|
| `js/ai.js` | 01-01: Rules engine, baseline chooseMove and node tests |
| `js/engine.js` | 01-01: Rules engine, baseline chooseMove and node tests |
| `package.json` | 01-01: Rules engine, baseline chooseMove and node tests |
| `tests/ai.test.js` | 01-01: Rules engine, baseline chooseMove and node tests |
| `tests/engine.test.js` | 01-01: Rules engine, baseline chooseMove and node tests |
| `index.html` | 01-02: Minimal page with window.tron test hook and Playwright test |
| `js/main.js` | 01-02: Minimal page with window.tron test hook and Playwright test |
| `tests/hook.test.js` | 01-02: Minimal page with window.tron test hook and Playwright test |

## Verification
- 01-01 (REQ-03, REQ-04, REQ-05, REQ-06, REQ-12): 5/5 verification commands passed
- 01-02 (REQ-11, REQ-12, REQ-03): 4/4 verification commands passed

## Agents
- 01-01: engineering-senior-developer
- 01-02: testing-workflow-optimizer
