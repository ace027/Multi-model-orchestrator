# Light Cycles

## What This Is
A Tron-style light cycles browser game: the player (cyan, player 1) races the computer (orange, player 2) around a grid arena, each leaving a solid trail; crashing into a wall, obstacle or trail loses the round. First to 3 round wins takes the match. Plain HTML/CSS/JS served statically, with a window.tron test hook that the game is checked against.

## Core Value
Exact, spec-conformant rules and test hook, plus a computer player that plays as strongly as possible.

## Who It's For
Players in a desktop browser (1024×768 or larger) and an automated checker that drives the game through window.tron and scores the computer player against bots.

## Requirements

### Validated
(None yet — ship to validate)

### Active
- REQ-01: index.html at the repository root works from any static file server; plain JavaScript (ES modules allowed), no build step, no dependencies, no external files or network requests
- REQ-02: Page has <canvas id="game">, an element #score and an element #message; the whole arena is visible in a 1024×768 window with every cell at least 8×8 CSS pixels
- REQ-03: Arena is a W×H grid (default 64×48), x right, y down, outside is wall; optional obstacle cells (none in normal play); P1 starts at (floor(W/4), floor(H/2)) heading right, P2 at (W-1-floor(W/4), floor(H/2)) heading left; start cells are trail
- REQ-04: Steering: reverse requests ignored; last non-ignored request between ticks applies; current direction is the direction last moved (start direction before the first move)
- REQ-05: Moving and crashing: both cycles move one cell per tick simultaneously; crash on out-of-grid, obstacle, or any pre-tick trail cell (incl. both cycles' pre-move cells); same target cell crashes both; a crashed cycle stays and its target does not become trail
- REQ-06: Rounds and match: round ends on a tick with at least one crash; sole survivor scores, both crashed is a draw; first to 3 round wins takes the match; the tick after a round ends starts the next round (trails cleared, obstacles kept, starts reset, round+1, tick=0, scores kept); after the match is won ticks do nothing
- REQ-07: Real-time play at 15 ticks/second; on load #message contains "Space" and nothing moves until Space starts the match; arrows and WASD steer P1; P pauses/resumes
- REQ-08: #score always shows "{p1} - {p2}" round wins, updated as soon as a round ends; on round end #message says how it ended, the crash is shown for about a second, then the next round starts by itself; on match end #message names the winner and contains "Space", and Space starts a new match at 0 - 0
- REQ-09: Look: black or near-black arena; P1 cycle and trail cyan #00e5ff, P2 orange #ff8c00 (heads may be lighter); obstacles and border in a different colour such as grey
- REQ-10: Computer player chooseMove(view) is a pure function of {width, height, grid, me, opponent} returning up/down/left/right within 20 ms on 64×48, works as either player, is called each tick with the pre-tick state as P2's request, and plays as strongly as possible against bots on arenas with obstacles
- REQ-11: window.tron test hook: reset(options{width,height,obstacles,ai}) starts a manual-mode match, step() runs one tick (AI request just before the move when ai is on), setDirection(player, dir) acts like a key press, state() returns {width,height,tick,round,players[{x,y,dir,alive,score}],grid,roundOver,roundWinner,matchWinner} in manual and normal play, chooseMove exposed
- REQ-12: Automated tests as tests/*.test.js pass with node --test

### Out of Scope
- Two human players or online multiplayer
- Build tooling, frameworks, npm dependencies or network assets
- Obstacles in normal play (only via the test hook)
- Mobile/touch controls

## Constraints
- Static files only, served from the repository root; no build step, no dependencies, no network access
- Must follow docs/spec.md exactly, including the window.tron test hook and state() shape
- chooseMove must answer within 20 ms on a 64×48 arena and be pure
- Tests run with node --test from tests/*.test.js
- Playwright for Node and Chromium are available for browser verification and screenshots

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Take every requirement from TASK.md and docs/spec.md | The user stated they are the full specification and the game is checked against them | Pending |
| Keep the engine and AI free of DOM code, as ES modules shared by the browser and node tests | One implementation of the rules serves the game, the test hook and node --test without a build step | Pending |
| Build the computer player as its own phase with a measured strength budget | AI strength is scored and is open-ended; it needs iteration against benchmark bots, separate from rule conformance | Pending |

## Architecture Influences
ES modules: a DOM-free engine module (rules, state, tick) and a DOM-free AI module (chooseMove) that node tests import directly; a thin main module wires the engine to the canvas, keyboard, real-time loop, #score/#message and window.tron.

---
*Last updated: 2026-10-08 after initialization*
