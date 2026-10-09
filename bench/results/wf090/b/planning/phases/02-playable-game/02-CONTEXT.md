# Phase 2: Playable game -- Context

## Phase Goal
The real-time playable page: canvas rendering, keyboard controls, 15 Hz loop, start/pause/round/match flow and the required look

## Requirements Covered
- REQ-01: static index.html, plain JS, no build, no deps, no network requests
- REQ-02: canvas#game, #score, #message; whole arena visible at 1024x768 with cells >= 8x8 CSS px
- REQ-07: 15 ticks/s; waits on load with 'Space' in #message; Space starts; arrows + WASD steer P1; P pauses/resumes
- REQ-08: #score '{p1} - {p2}' updated when a round ends; round-end message, crash shown ~1 s, next round starts itself; match-end message names winner and contains 'Space'; Space restarts at 0 - 0
- REQ-09: black arena, P1 #00e5ff, P2 #ff8c00 (heads may be lighter), grey border/obstacles

## What Already Exists (from prior phases)
- js/engine.js: Game class (setDirection(player,dir), step(), state(), view(player), roundOver, matchWinner), DIRS/DELTA/OPPOSITE; next tick after roundOver starts the next round; ticks do nothing once matchWinner set
- js/ai.js: chooseMove(view)
- js/main.js: window.tron hook (reset/step/setDirection/state/chooseMove), render(), updateScore(), empty stopLoop() stub, tronStep()
- index.html: #score, canvas#game, #message 'Press Space to start'
- tests/engine.test.js, tests/ai.test.js, tests/hook.test.js (Playwright via createRequire with fallback /opt/node22/lib/node_modules, PLAYWRIGHT_MODULE_ROOT override)

## Key Design Decisions
- Board quick-assess (5.0/10; red flags were only 'no plans yet'). Adopted: loop/state machine as a pure DOM-free module js/controller.js tested by node; a single setInterval scheduler in main.js; a status message for every mode; Playwright check that arrows/Space call preventDefault. Rejected: per-tick input queue — the spec mandates 'last non-ignored request applies at the next tick', which the engine already implements.
- Spec: skipped (trigger said skip). Architecture proposals: skipped (offer, gates off, no spec recommendation).
- Controller modes: waiting -> running <-> paused; running -> over at match end; over --Space--> running with a fresh Game. Round-over hold is ROUND_PAUSE_TICKS = 15 ticks (1 s at 15 Hz) counted only while running, then one game.step() starts the next round.
- Canvas has a one-cell grey (#888) border ring: canvas size (W+2)*cell x (H+2)*cell, arena cell (x,y) drawn at ((x+1)*cell, (y+1)*cell); cell = max(8, floor(min(640/W, 480/H))) -> 10 px for 64x48 (660x500 canvas).
- Heads drawn lighter (P1 #b3f6ff, P2 #ffc680); a crashed (alive=false) player's head drawn white #ffffff so the crash is visible during the hold.
- window.tron.reset() switches to manual mode for good (until reload): clears the interval; in manual mode Space and P are ignored and steering keys call game.setDirection(1, dir) directly.
- index.html gets <link rel="icon" href="data:,"> so Chromium makes no favicon request.
- Personas: gates off, accepted persona_brief top pick engineering-senior-developer (score 3+5 / 8+5) for both plans.

## Plan Structure
- **Plan 02-01 (Wave 1)**: Game controller, real-time loop, input and rendering -- Add a pure DOM-free controller (modes, round hold, messages) with node tests, and wire it into js/main.js with a 15 Hz setInterval loop, keyboard handling and the final canvas look.
- **Plan 02-02 (Wave 2)**: Playwright play session, screenshots and network audit -- Add tests/play.test.js, a Playwright end-to-end suite under node --test that plays the real-time game by keyboard, checks the look at 1024x768 and audits network requests.
