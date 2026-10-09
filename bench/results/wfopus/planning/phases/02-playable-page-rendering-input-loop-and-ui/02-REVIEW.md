# Phase 2: Playable page: rendering, input, loop and UI — Review Summary

## Result: PASSED

**Cycles Used**: 1
**Reviewers**: testing-qa-verification-specialist, engineering-senior-developer, design-ux-architect, testing-workflow-optimizer
**Evaluators**: code-quality, ui-ux, integration, business-logic
**Completed**: 2026-10-08

## Findings Summary
- Must-fix (blocker, critical, major) found: 0; fixed: 0; unresolved: 0
- Suggestions (minor, advisory): 4
- Deferred (confidence 50-79%): 7
- Hot spots (flagged by 2+ reviewers): `src/main.js`, `src/session.js`, `index.html`, `tests/play.test.js`, `tests/session.test.js`

## Findings Detail
| ID | Severity | Location | Issue | Reviewers | Confidence | Status |
|----|----------|----------|-------|-----------|------------|--------|
| F-001 | minor | `src/main.js:44-50` | The keydown handler does not check `ctrlKey`, `metaKey` or `altKey`. Browser shortcuts that use a mapped letter go to the game and their default action is cancelled. Ctrl/Cmd+P toggles pause and blocks the print dialog. Ctrl/Cmd+S steers down and blocks Save. Ctrl+D steers right and blocks the bookmark shortcut. Ctrl+A steers left and blocks Select All. | testing-qa-verification-specialist, evaluator:ui-ux | 85% | deferred |
| F-002 | minor | `index.html:17` | The `<canvas id="game">` has no accessible name, no role and no fallback content. Screen readers either skip it or announce it as an unlabeled graphic. | engineering-senior-developer, design-ux-architect, evaluator:ui-ux | 85% | deferred |
| F-003 | minor | `src/session.js:35` | `STEER_PHASES` contains `'roundEnd'`, but steering in that phase does nothing. During roundEnd, `handleKey` calls `controller.setDirection(1, …)`, which sets `pending` on the player who has already crashed. The next `advance()` then calls `startNextRound` → `placePlayers` (src/engine.js:31-33), which builds fresh player objects with `pending: null`. So any arrow or WASD key pressed during the one-second crash display is thrown away. The `handleKey` code makes it look like steering works there. | testing-workflow-optimizer, evaluator:code-quality, evaluator:integration | 85% | deferred |
| F-004 | minor | `tests/session.test.js:161-225` | The tests only check the outcomes where player 2 wins: `MESSAGES.round[2]` and `MESSAGES.match[2]`. Nothing checks that a player-1 round win shows `MESSAGES.round[1]`, that a draw shows `MESSAGES.round[0]`, or that a player-1 match win shows `MESSAGES.match[1]`. The Playwright round-end test (tests/play.test.js:119-120) only checks that the message is non-empty and differs from the running message. | evaluator:integration, evaluator:business-logic | 85% | deferred |

## Reviewer Verdicts
- Cycle 1, testing-qa-verification-specialist: **PASS**
- Cycle 1, engineering-senior-developer: **PASS**
- Cycle 1, design-ux-architect: **NEEDS WORK**
- Cycle 1, testing-workflow-optimizer: **PASS**
- Cycle 1, evaluator:code-quality: **PASS**
- Cycle 1, evaluator:ui-ux: **PASS**
- Cycle 1, evaluator:integration: **PASS**
- Cycle 1, evaluator:business-logic: **PASS**

## Suggestions (Not Required)
- F-001 `src/main.js`: The keydown handler does not check `ctrlKey`, `metaKey` or `altKey`. Browser shortcuts that use a mapped letter go to the game and their default action is cancelled. Ctrl/Cmd+P toggles pause and blocks the print dialog. Ctrl/Cmd+S steers down and blocks Save. Ctrl+D steers right and blocks the bookmark shortcut. Ctrl+A steers left and blocks Select All. (fix: At the start of the listener, add `if (event.ctrlKey || event.metaKey || event.altKey) return;`. Add a session or Playwright test that presses `Control+p` and checks that the phase or message does not change.)
- F-002 `index.html`: The `<canvas id="game">` has no accessible name, no role and no fallback content. Screen readers either skip it or announce it as an unlabeled graphic. (fix: Add `role="img"` and `aria-label="Light Cycles arena: you are cyan, the computer is orange"`. Or put short fallback text inside the canvas element.)
- F-003 `src/session.js`: `STEER_PHASES` contains `'roundEnd'`, but steering in that phase does nothing. During roundEnd, `handleKey` calls `controller.setDirection(1, …)`, which sets `pending` on the player who has already crashed. The next `advance()` then calls `startNextRound` → `placePlayers` (src/engine.js:31-33), which builds fresh player objects with `pending: null`. So any arrow or WASD key pressed during the one-second crash display is thrown away. The `handleKey` code makes it look like steering works there. (fix: Pick one behaviour and test it. Option (a): remove `'roundEnd'` from `STEER_PHASES` and add a session test showing that steering during roundEnd has no effect. Option (b): if pre-steering is wanted, remember the last direction in the session and apply it after the `controller.advance()` that starts the next round (session.js:128).)
- F-004 `tests/session.test.js`: The tests only check the outcomes where player 2 wins: `MESSAGES.round[2]` and `MESSAGES.match[2]`. Nothing checks that a player-1 round win shows `MESSAGES.round[1]`, that a draw shows `MESSAGES.round[0]`, or that a player-1 match win shows `MESSAGES.match[1]`. The Playwright round-end test (tests/play.test.js:119-120) only checks that the message is non-empty and differs from the running message. (fix: Add session tests that make the computer crash (player-1 win) and make both cycles crash head-on (draw). Each should check `session.message === MESSAGES.round[1]` or `MESSAGES.round[0]`. Add one that has player 1 win three rounds and checks `MESSAGES.match[1]`. In play.test.js, check that the round message equals the text for `state().roundWinner`.)

## Deferred (Medium Confidence)
- `src/session.js` [minor, 70%]: The game does not pause itself when the page is hidden (no `visibilitychange` or `blur` handling). While the tab is in the background, requestAnimationFrame stops running. When the user comes back, the first `update(now)` runs up to `MAX_CATCH_UP` (5) ticks at once, with no input from the player. It then resets `nextTickAt` and play continues straight away.
- `src/session.js` [minor, 75%]: The manual-mode message hides the word "window" behind a `\u0077` escape. The comment says this is only so that `! grep -nE 'document|window'` passes on this file. The source is being obscured to satisfy a lint-style grep, while the module's real DOM-freedom (no use of browser globals) is not what changed.
- `src/main.js` [minor, 70%]: The key policy is split across two modules. src/session.js `KEYS` (lines 135-142) maps the key names to actions. src/main.js separately hard-codes `NO_REPEAT_KEYS = ['p','P',' ']` to block auto-repeat. This list does not cover the `Space`/`Spacebar` aliases that session accepts.
- `tests/play.test.js` [minor, 55%]: The round-end test requires the score to differ from `0 - 0` after round 1 (`assert.notEqual(score, '0 - 0')`). Under spec rule 4, a round where both cycles crash is a draw and nobody scores, so the correct score after a draw in round 1 is still `0 - 0`. The test's frame-retry branch (`if (score === '0 - 0')`) also treats a draw as a timing glitch rather than a valid result.
- `src/render.js` [minor, 65%]: `layout()` sizes the canvas against fixed 1000×640 limits and never checks the real viewport. index.html has no `max-width` or overflow handling, so viewports narrower than about 1000px get horizontal scrolling. Viewports shorter than about 740px push `#message` below the fold, where the round and match messages are hidden.
- `index.html` [advisory, 60%]: The page colours (`#050505`, `#e0e0e0`, `#000`) are hard-coded in CSS and separate from `COLORS` in src/render.js. The page background `#050505` is slightly different from the canvas `#000000`.
- `src/session.js` [minor, 60%]: Nothing pauses the game when the tab is hidden. Browsers stop or slow `requestAnimationFrame` in background tabs. When the player comes back, `updateRunning` runs up to `MAX_CATCH_UP` (5) ticks at once, which is about 333 ms of play the player never saw. The player can crash or lose a round during that burst.

## Coverage
No coverage data found (looked for coverage/coverage-summary.json, coverage-summary.json, coverage/lcov.info, lcov.info, coverage.xml, coverage/cobertura-coverage.xml, coverage/coverage.xml, coverage.txt, coverage/coverage.txt). Advisory only: run the test suite with coverage to check review.coverage_thresholds.
