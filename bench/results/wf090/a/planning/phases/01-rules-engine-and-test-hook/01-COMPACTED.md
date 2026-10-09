---
phase: 01-rules-engine-and-test-hook
compacted: 2026-10-08
original_summaries: [01-01-SUMMARY.md, 01-02-SUMMARY.md]
requirements_satisfied: [REQ-03, REQ-04, REQ-05, REQ-06, REQ-10, REQ-13, REQ-01, REQ-12]
---

# Phase 1: Rules engine and test hook — Compacted Summary

## Deliverables
- 01-01 Pure rules engine and baseline chooseMove with unit tests (Complete): package.json, src/ai.js, src/engine.js, tests/ai.test.js, tests/engine.test.js
- 01-02 Game controller, window.tron hook and Playwright verification (Complete): index.html, src/game.js, src/main.js, tests/game.test.js, tools/verify-hook.cjs

## Decisions
- 01-01: Internal state keeps `cells` as an array of char arrays plus `obstacles` and per-player `pending`; snapshot and makeView build fresh objects.
- 01-01: Obstacles that are non-integer, malformed, outside the grid or on a start cell are ignored.
- 01-01: requestDirection returns false for an invalid player, an unknown direction, a reverse, and while roundOver or matchWinner is set.
- 01-02: #score and #message are absolutely positioned overlays so the 1024x768 canvas, which is the full window height, stays fully visible.
- 01-02: setDirection coerces '1' and '2' with Number(). An invalid player is passed to requestDirection as 0, which returns false.
- 01-02: reset reads `ai` as `ai !== false`.

## Conventions and Open Questions
- 01-01 convention: The Phase 1 controller can use `createState`, `requestDirection(state, 1|2, dir)`, `tick`, `snapshot` and `makeView(state, 2)` as exported, and call `chooseMove
- 01-01 convention: The engine treats the round-reset tick as a separate tick, so a controller's step() should call `tick` once per call and not add its own round handling.
- 01-01 convention: Pending requests are cleared by every tick, including the reset tick. A controller that requests a direction while roundOver gets `false` and the request is dro
- 01-02 convention: Phase 2 should call game.step() from the real-time loop and set game.mode = 'realtime'. reset() sets 'manual'.
- 01-02 convention: main.js currently exposes only the hook object and does not export the game instance. Phase 2 will need to expose it or build its loop inside main.js.
- 01-02 convention: Phase 2 must call updateScore() (the helper in main.js) after each real-time tick.

## Files Modified
| File | Change |
|------|--------|
| `package.json` | 01-01: Pure rules engine and baseline chooseMove with unit tests |
| `src/ai.js` | 01-01: Pure rules engine and baseline chooseMove with unit tests |
| `src/engine.js` | 01-01: Pure rules engine and baseline chooseMove with unit tests |
| `tests/ai.test.js` | 01-01: Pure rules engine and baseline chooseMove with unit tests |
| `tests/engine.test.js` | 01-01: Pure rules engine and baseline chooseMove with unit tests |
| `index.html` | 01-02: Game controller, window.tron hook and Playwright verification |
| `src/game.js` | 01-02: Game controller, window.tron hook and Playwright verification |
| `src/main.js` | 01-02: Game controller, window.tron hook and Playwright verification |
| `tests/game.test.js` | 01-02: Game controller, window.tron hook and Playwright verification |
| `tools/verify-hook.cjs` | 01-02: Game controller, window.tron hook and Playwright verification |

## Verification
- 01-01 (REQ-03, REQ-04, REQ-05, REQ-06, REQ-10, REQ-13): 6/6 verification commands passed
- 01-02 (REQ-01, REQ-10, REQ-12, REQ-13): 5/5 verification commands passed

## Agents
- 01-01: engineering-senior-developer
- 01-02: testing-qa-verification-specialist
