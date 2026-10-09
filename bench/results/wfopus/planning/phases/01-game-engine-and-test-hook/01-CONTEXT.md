# Phase 1: Game engine and test hook -- Context

## Phase Goal
A DOM-free engine implementing the arena, steering, simultaneous moves, crash rules, rounds and match exactly per docs/spec.md, exposed through window.tron (reset/setDirection/step/state/chooseMove stub), with node --test coverage of every rule and a Playwright check of the hook on a served index.html.

## Requirements Covered
- REQ-01
- REQ-02
- REQ-03
- REQ-04
- REQ-05
- REQ-06
- REQ-07
- REQ-13
- REQ-14

## What Already Exists (from prior phases)
- Greenfield: repo has only docs/spec.md (authoritative), TASK.md, settings.json, .gitignore. No code yet.
- Node v22.22, python3, Playwright 1.56 installed globally and resolvable via NODE_PATH=/usr/local/lib/node_modules_global (CommonJS require only; ESM import does NOT use NODE_PATH, so load it with createRequire(import.meta.url)('playwright')).

## Key Design Decisions
- package.json at repo root: {"name":"light-cycles","private":true,"type":"module","scripts":{"test":"node --test"}} with no dependencies; all src/ and tests/ files are ES modules.
- Module split: src/engine.js (pure rules, no DOM), src/ai.js (chooseMove; Phase 1 ships a safe stub, Phase 3 replaces it), src/controller.js (owns the current game, ai flag, and advance() = AI request then tick; shared by window.tron now and the real-time loop in Phase 2), src/hook.js (installTronHook builds window.tron over a controller), src/main.js (browser entry), index.html.
- A player's current direction (state().players[i].dir) is the direction last moved in, or the start direction; a crashed cycle keeps its previous dir.
- Steering requests are validated against the current direction, not the pending one; a request equal to the current direction is accepted and overrides an earlier pending turn. Invalid direction strings or player numbers are ignored.
- Pending requests are cleared when a round starts (the reset tick, newMatch); a request queued while the round is over therefore does not carry into the new round.
- With ai on, chooseMove is called with the pre-tick view of player 2 only when the tick will move cycles (not on the reset tick, not after match end); its answer goes through the same requestDirection path, so a reverse answer is ignored; if chooseMove throws, the request is skipped.
- The tick counter increments on every moving tick including the crash tick; the reset tick sets it to 0; ticks after the match is won change nothing.
- reset options: width/height must be integers >= 2 else the default (64/48) is used; obstacles that are out of the grid, non-integer, or on a start cell are ignored; duplicates are harmless.
- Guard against false-green test runs: verification checks TAP '# pass N' counts and '# fail 0' / '# skipped 0', not just exit codes.
- Board quick-assess ran before any plans existed and returned process-ordering REJECTs; its actionable recommendations (one test per rule, pure simultaneous step, grid chars only . # 1 2, chooseMove pure stub, Playwright check of window.tron) are folded into these plans.
- Architecture proposals: skipped (gates off, no spec recommending them); no spec for this phase (spec trigger: skip).

## Plan Structure
- **Plan 01-01 (Wave 1)**: Pure game engine with rule-by-rule tests -- Create src/engine.js, a DOM-free ES module implementing every arena, steering, moving, crashing, round and match rule of docs/spec.md, plus package.json and tests/engine.test.js with at least one test per rule.
- **Plan 01-02 (Wave 2)**: Controller, window.tron hook, chooseMove stub and page shell -- Add src/ai.js (pure safe chooseMove stub), src/controller.js (current game + ai + advance), src/hook.js (window.tron per spec), src/main.js and index.html, with node tests of the controller, hook and stub.
- **Plan 01-03 (Wave 3)**: Playwright check of window.tron on a served index.html -- Add tests/browser.test.js, run by node --test, that serves the repo root with a local static server, opens index.html in headless Chromium via Playwright, and verifies window.tron and state() per spec plus no external requests or page errors.
