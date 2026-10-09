# Light Cycles

## What This Is
A Tron-style light-cycle browser game: the player (cyan) races the computer (orange) on a grid arena, each leaving a solid trail; crashing into walls, obstacles or trails loses the round, first to 3 round wins takes the match. Plain HTML/CSS/JS static files served from the repository root, with a window.tron test hook used to check the game against docs/spec.md.

## Core Value
Exact, spec-conformant game rules with a strong computer player, playable with no build step, dependencies or network.

## Who It's For
Browser players who want a quick match against a computer opponent; also an automated checker that drives the game through window.tron and scores the computer player against bots.

## Requirements

### Validated
(None yet — ship to validate)

### Active
- REQ-01: index.html at the repository root works when served by any static file server; plain JS (ES modules allowed), no build step, no external files or network requests; arena on <canvas id="game">, plus #score and #message elements
- REQ-02: Arena is a W×H grid (default 64×48, test hook may override); outside the grid is wall; obstacle cells may be placed (test hook only; normal play uses none)
- REQ-03: P1 starts at (floor(W/4), floor(H/2)) heading right; P2 at (W-1-floor(W/4), floor(H/2)) heading left; start cells are part of each trail
- REQ-04: Steering: requests for the reverse of the current direction (direction last moved, or start direction) are ignored; the last non-ignored request between ticks applies at the next tick
- REQ-05: Each tick both cycles move one cell simultaneously; entered cell joins the trail. Crash if the target is outside the grid, an obstacle, or any pre-tick trail (including both cycles' pre-move cells); both crash on the same target cell; a crashed cycle does not move and its target does not become trail
- REQ-06: A round ends on the tick at least one cycle crashes; sole survivor scores a point, both crashed is a draw; first to 3 round wins takes the match
- REQ-07: After a round ends the next tick only starts the next round: trails cleared (obstacles stay), cycles reset to start cells and directions, round +1, round tick count 0, scores carried; after the match is won ticks do nothing
- REQ-08: Real-time play at 15 ticks/s; on load nothing moves and #message contains "Space"; Space starts the match; arrows and WASD steer P1; P pauses/resumes (nothing moves while paused)
- REQ-09: #score always shows "{p1} - {p2}" round wins, updated as soon as a round ends; at round end #message says how it ended, the crash is shown about one second, then the next round starts by itself; at match end #message names the winner and contains "Space"; Space starts a new match at 0 - 0
- REQ-10: Whole arena visible in a 1024×768 window with every cell at least 8×8 CSS pixels
- REQ-11: Look: black/near-black background; P1 cycle and trail cyan #00e5ff, P2 orange #ff8c00 (heads may be lighter); obstacles and border in a different colour such as grey
- REQ-12: chooseMove(view) pure function steers P2: view {width, height, grid (height strings, '.' free), me {x,y,dir}, opponent {x,y,dir}}; returns up/down/left/right within 20 ms on 64×48; called each tick with the pre-tick state as P2's request; works for either player; plays as strongly as possible against bots of increasing strength on obstacle arenas
- REQ-13: window.tron test hook: reset(options {width, height, obstacles [[x,y]...], ai default true}) starts a new match in manual mode (no real-time ticks); setDirection(player, dir) like a key press; step() one tick (with ai on, P2's chooseMove request made just before the move); state() returns {width, height, tick, round, players [{x,y,dir,alive,score}×2], grid ('.', '#', '1', '2'), roundOver, roundWinner (null/1/2/0), matchWinner (null/1/2)} in manual mode and normal play; chooseMove exposed
- REQ-14: Automated tests as tests/*.test.js pass with node --test

### Out of Scope
- Two human players or online multiplayer
- Obstacles in normal play
- Build tooling, npm dependencies, frameworks or any network requests
- Sound, settings menus or difficulty selection (not in spec)

## Constraints
- Plain HTML, CSS and JavaScript served as static files from the repository root; no build step, no dependencies, no network access
- docs/spec.md is followed exactly, including window.tron; the game is checked against it
- Tests are tests/*.test.js run with node --test (Node built-in runner only)
- chooseMove must return within 20 ms on a 64×48 arena and be a pure function
- Playwright for Node and Chromium are available for browser verification (serve with python3 -m http.server, play with key presses, inspect screenshots)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split into a DOM-free game engine module, an AI module, and a page/renderer module | Engine rules and chooseMove must be testable under node --test without a browser, and the same engine backs both real-time play and the window.tron manual mode | Pending |
| ES modules loaded directly by index.html, also importable from Node tests | Spec allows ES modules; avoids a build step while sharing code between browser and tests | Pending |
| Computer player gets its own phase with a measured strength/latency budget | Spec scores the AI against bots of increasing strength on obstacle arenas; it is open-ended work best tuned against a local bot harness | Pending |

## Architecture Influences
Pure engine (state, steering queue, tick resolution, rounds/match) + pure AI (chooseMove over a view built from engine state) + browser shell (canvas renderer, keyboard input, 15 Hz loop with pause and round-end delay, #score/#message, window.tron hook switching to manual mode).

---
*Last updated: 2026-10-08 after initialization*
