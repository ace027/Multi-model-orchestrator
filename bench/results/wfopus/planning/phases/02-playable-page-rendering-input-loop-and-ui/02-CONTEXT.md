# Phase 2: Playable page: rendering, input, loop and UI -- Context

## Phase Goal
A playable browser game: canvas rendering in the spec colours, keyboard steering, 15 ticks/s loop, Space start, P pause, round-end message with about one second crash display, match-end message, live #score

## Requirements Covered
- REQ-01
- REQ-08
- REQ-09
- REQ-10
- REQ-11

## What Already Exists (from prior phases)
- src/engine.js: pure DOM-free engine (createGame, requestDirection, tick, willMove, getState, getView)
- src/controller.js: createController({chooseMove}) with newMatch(options), setDirection(player, dir), advance() (the single place where the AI request and the tick happen), state(), view(player)
- src/hook.js: installTronHook(target, controller, {chooseMove, onManual}); reset() calls onManual() then controller.newMatch()
- src/main.js: wires controller and hook; has a module-level mode variable and an onManual callback where Phase 2 must stop the real-time loop
- index.html: #score, canvas#game, #message, loads src/main.js as a module
- tests/browser.test.js + tests/support/static-server.js: Playwright harness (startStaticServer(ROOT) -> {url, close}); suite skips when playwright is missing

## Key Design Decisions
- Three modules: src/render.js (pure drawing onto any 2D-context-like object), src/session.js (DOM-free real-time state machine driven by explicit timestamps), src/main.js (DOM glue: requestAnimationFrame loop, keydown, #score/#message, canvas size)
- Fixed-step timing: tickMs = 1000/15; session.update(nowMs) runs due ticks via controller.advance(), at most 5 per call, then resynchronises
- Round end: score updates at once (derived from controller.state() every frame); phase 'roundEnd' holds for 1000 ms showing the crash, then one controller.advance() starts the next round. The match-winning round goes straight to 'matchOver'
- P pauses in 'running' and 'roundEnd' and preserves the remaining time; Space starts a match in 'waiting' and 'matchOver' only
- window.tron.reset() calls session.enterManual(): phase 'manual', no real-time ticks, no pending round-end timer; rendering and #score keep following controller.state()
- Colours (board recommendation): background #000, P1 #00e5ff with head #b3f7ff, P2 #ff8c00 with head #ffc680, border and obstacles #666666, crashed head #ffffff, all in one exported COLORS constant
- Layout: 1-cell grey border around the grid; cellSize = clamp(floor(min(1000/(W+2), 640/(H+2))), 8, 16) -> 12 px for 64x48, canvas 792x600
- Players named consistently as 'you' and 'the computer' in messages (board recommendation); #score and #message get aria-live="polite"
- Board quick-assess: all REJECT only because Phase 2 was not built yet; its concerns (loop/manual race, colour constants, pixel-sampling screenshot check) are constraints of these plans
- Design workflow, spec and architecture proposals skipped (autonomous gates off, no spec trigger)

## Plan Structure
- **Plan 02-01 (Wave 1)**: Canvas renderer with spec colours and layout -- A pure renderer module that computes the canvas layout for a W×H arena and draws a state() snapshot onto a 2D context in the spec colours.
- **Plan 02-02 (Wave 1)**: Real-time session state machine -- A DOM-free session module that turns timestamps and key names into controller calls: waiting, running at 15 ticks/s, paused, round-end hold of 1 s, match over, and manual mode for the test hook.
- **Plan 02-03 (Wave 2)**: Page wiring and Playwright play-through -- Wire renderer and session into the page with a requestAnimationFrame loop and keyboard input, then prove the playable game in Chromium with a Playwright play-through, pixel checks and a network check.
