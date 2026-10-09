---
phase: 02-playable-game
compacted: 2026-10-08
original_summaries: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
requirements_satisfied: [REQ-01, REQ-02, REQ-07, REQ-08, REQ-09]
---

# Phase 2: Playable game — Compacted Summary

## Deliverables
- 02-01 Game controller, real-time loop, input and rendering (Complete): index.html, js/controller.js, js/main.js, tests/controller.test.js
- 02-02 Playwright play session, screenshots and network audit (Complete): .gitignore, tests/play.test.js

## Decisions
- 02-01: engine.js exports Game as a named export, so the tests use `import { Game }` instead of the default import written in the plan
- 02-01: keyToDir uses Object.hasOwn so keys like 'toString' return null
- 02-01: In main.js, preventDefault is called for every game key, including auto-repeats. Repeats of Space and P are then dropped.
- 02-02: Replaced the single steering sequence with one fresh-page test per key (8 keys, including the two reversal keys). The original sequence made P1 run into its own

## Conventions and Open Questions
- 02-01 convention: Controller API: key(k) returns true when the game uses the key, tick() advances one step, and the mode/message/game fields are public
- 02-01 convention: window.tron.reset puts the page in manual mode, which stops the loop and shows 'Manual mode'
- 02-01 convention: there is no way back to controller mode without a page reload
- 02-02 convention: Run `node --test` to regenerate the screenshots in test-results/ (git-ignored). The match test takes about 7 s.

## Files Modified
| File | Change |
|------|--------|
| `index.html` | 02-01: Game controller, real-time loop, input and rendering |
| `js/controller.js` | 02-01: Game controller, real-time loop, input and rendering |
| `js/main.js` | 02-01: Game controller, real-time loop, input and rendering |
| `tests/controller.test.js` | 02-01: Game controller, real-time loop, input and rendering |
| `.gitignore` | 02-02: Playwright play session, screenshots and network audit |
| `tests/play.test.js` | 02-02: Playwright play session, screenshots and network audit |

## Verification
- 02-01 (REQ-01, REQ-02, REQ-07, REQ-08, REQ-09): 12/12 verification commands passed
- 02-02 (REQ-01, REQ-02, REQ-07, REQ-08, REQ-09): 5/5 verification commands passed

## Agents
- 02-01: engineering-senior-developer
- 02-02: engineering-senior-developer
