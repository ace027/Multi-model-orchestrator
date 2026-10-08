# Phase 2: Playable browser game -- Context

## Phase Goal
Real-time play in the browser: canvas rendering in the specified colours, keyboard controls, the 15 Hz loop, the start, pause, round-end and match-end flow, and the #score/#message text

## Requirements Covered
- REQ-02
- REQ-07
- REQ-08
- REQ-09
- REQ-13

## What Already Exists (from prior phases)
- src/engine.js (Phase 1): pure rules — DIRS, OPPOSITE, DELTA, createState, requestDirection(state,player,dir)->bool, tick(state), snapshot(state), makeView(state,player). The round-reset tick is a separate tick; pending requests are cleared every tick.
- src/ai.js (Phase 1): pure baseline chooseMove(view).
- src/game.js (Phase 1): createGame({chooseMove}) -> {reset(opts), setDirection(player,dir), step(), state(), chooseMove, mode getter/setter ('realtime' on creation, 'manual' after reset), ai}. step() asks the AI for P2 with the pre-tick view, then ticks once.
- src/main.js (Phase 1): creates the game, exposes window.tron {reset,setDirection,step,state,chooseMove}, updateScore() writes '#score'. No canvas drawing, no keys, no loop; #message is a static 'Press Space to start'.
- index.html (Phase 1): canvas#game 1024x768, #score/#message absolutely positioned overlays, one module script ./src/main.js.
- tools/verify-hook.cjs (Phase 1): Playwright hook check; starts python3 -m http.server on 127.0.0.1 at port 8100+(pid%800) from the repo root, require('playwright') resolves globally. Passes 17/17. node --test passes 46/46.

## Key Design Decisions
- Flow logic lives in a new DOM-free module src/flow.js (createFlow) with node tests driven by a fake clock; main.js only forwards keydown codes and requestAnimationFrame timestamps to it (board recommendation: flow logic in node-testable code).
- Fixed-timestep accumulator: TICK_MS = 1000/15, update(now) runs at most 5 ticks per call and drops the remaining backlog (background tab / long frames).
- Flow phases: 'idle' (waiting, message contains 'Space'), 'running', 'paused', 'roundEnd' (crash shown for CRASH_MS = 1000, then one game.step() performs the reset tick and play resumes), 'matchOver' (message names the winner and contains 'Space'; Space restarts at 0 - 0 via game.reset then game.mode = 'realtime').
- Keys use KeyboardEvent.code: Space; KeyP; ArrowUp/KeyW up, ArrowDown/KeyS down, ArrowLeft/KeyA left, ArrowRight/KeyD right. Steering only in 'running'; P only in 'running'/'paused'; Space only in 'idle'/'matchOver'. main.js calls preventDefault for these codes.
- When game.mode is 'manual' (window.tron.reset was called) the flow ignores keys and update(), so the test hook is never disturbed by the real-time loop. The canvas and #score are still redrawn from game.state() every frame in both modes.
- Rendering is a pure function of state() in src/render.js: layout(gridW,gridH,canvasW,canvasH) picks cell = floor(min(canvasW/(gridW+2), canvasH/(gridH+2))) with a one-cell grey (#808080) border frame, centred; background #05050a; P1 trail #00e5ff, head #b3f7ff; P2 trail #ff8c00, head #ffd199; obstacles #808080; a crashed head is drawn #ffffff.
- Layout in normal flow (board recommendation): body margin 0; #score (24px line) above the canvas, canvas 1024x704, #message (24px line) below; total 752 px fits 1024x768. 64x48 gives 14 px cells.
- #message gets role="status" aria-live="polite"; canvas gets aria-label. document.body.dataset.phase mirrors flow.phase so Playwright can observe the flow without extending window.tron.
- Messages (exact): idle 'Press Space to start'; running 'Arrows/WASD to steer, P to pause'; paused 'Paused - press P to resume'; roundEnd 'You win the round!' / 'Computer wins the round!' / 'Draw - both crashed!'; matchOver 'You win the match! Press Space to play again' / 'Computer wins the match! Press Space to play again'.
- Phase 2 verification is a second Playwright script tools/verify-play.cjs (same server pattern as verify-hook.cjs) that writes screenshots to test-results/ (gitignored) and samples canvas pixels for the exact colours.
- Board quick-assess ran (5.6/10, no red flags; recommendations folded into the decisions above). Spec: skipped (no trigger). Architecture proposals: skipped (--auto, no spec recommendation). Domain: none.

## Plan Structure
- **Plan 02-01 (Wave 1)**: Real-time flow, canvas renderer and page wiring -- Make the game playable in the browser: a node-tested flow state machine with a 15 Hz fixed-timestep loop, a pure canvas renderer in the specified colours, and index.html/main.js wiring for keys, #score and #message.
- **Plan 02-02 (Wave 2)**: Playwright real-time play verification and test hardening -- Prove the phase success criteria in Chromium with key presses, timing and screenshots, and fix the weak Phase 1 'step after match won' unit test.
