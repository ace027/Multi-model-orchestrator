# Light Cycles

## What This Is
A Tron-style light-cycle browser game: the player steers the cyan cycle against a computer-steered orange cycle in a grid arena, and each cycle leaves a solid trail. Plain HTML/CSS/JS served as static files from the repository root, with a window.tron test hook that the game is checked against.

## Core Value
An exact, spec-conformant game engine (rules, test hook) with a strong computer player, playable in the browser with no build step and no dependencies.

## Who It's For
A single human player in a desktop browser, against the computer; plus an automated checker that drives the window.tron test hook and scores the computer player against bots.

## Requirements

### Validated
(None yet — ship to validate)

### Active
- REQ-01: index.html at the repo root works under any static HTTP server; plain JS (ES modules allowed), no build step, no external files or network requests
- REQ-02: Page has <canvas id="game">, #score and #message; the whole arena fits a 1024x768 window with every cell at least 8x8 CSS px
- REQ-03: Arena W x H (default 64x48), outside is wall, optional obstacle cells (none in normal play); P1 starts (floor(W/4), floor(H/2)) heading right, P2 starts (W-1-floor(W/4), floor(H/2)) heading left; start cells are trail
- REQ-04: Steering: reverse requests are ignored; the last non-ignored request between ticks applies; current direction = last moved direction
- REQ-05: Moving and crashing: simultaneous one-cell moves; crash on out-of-grid, obstacle or pre-tick trail (including both cycles' pre-move cells); same target cell = both crash; a crashed cycle does not move and its target cell does not become trail
- REQ-06: Rounds and match: a round ends on the tick with any crash; a sole survivor scores, both crashing is a draw; first to 3 wins the match; the tick after a round ends starts the next round (trails cleared, obstacles kept, reset positions, round+1, tick=0, scores kept); ticks do nothing after the match is won
- REQ-07: Real-time play at 15 ticks/s; on load it waits with #message containing 'Space'; Space starts the match; arrows and WASD steer P1; P toggles pause
- REQ-08: #score always shows '{p1} - {p2}' and updates as soon as a round ends; #message says how a round ended, the crash is shown for about 1 s, then the next round starts automatically; at match end #message names the winner and contains 'Space'; Space restarts at 0 - 0
- REQ-09: Look: black or near-black background; P1 #00e5ff, P2 #ff8c00 (heads may be lighter); obstacles and border in a neutral colour such as grey
- REQ-10: chooseMove(view) is pure, takes {width,height,grid,me,opponent} and returns a direction within 20 ms on 64x48; works for either player; the game calls it each tick with the pre-tick state as P2's request
- REQ-11: The computer player is as strong as possible against bots of increasing strength on arenas with obstacles, playing as either player
- REQ-12: window.tron test hook: reset(options{width,height,obstacles,ai}) switches to manual mode; setDirection(player,dir); step(); state() returns the exact spec shape (width,height,tick,round,players[{x,y,dir,alive,score}],grid of '.','#','1','2',roundOver,roundWinner,matchWinner); chooseMove
- REQ-13: Automated tests in tests/*.test.js pass with node --test; the game is verified in the browser with Playwright + Chromium (key presses, screenshots)

### Out of Scope
- Two human players or networked multiplayer
- Build tools, bundlers, npm dependencies or external assets/CDNs
- Obstacles in normal play (only via the test hook)
- Mobile/touch controls
- Sound

## Constraints
- Static files only, served from the repository root; no build step, no dependencies, no network access
- Follow docs/spec.md exactly, including the window.tron hook; the game is checked against it
- Tests: tests/*.test.js run with `node --test`
- Verification: Playwright for Node and Chromium are installed; serve with `python3 -m http.server` and drive the game with key presses and screenshots
- chooseMove must answer within 20 ms on a 64x48 arena

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Put the rules engine in a pure ES module with no DOM dependencies, shared by the browser and the node tests | The spec's rules must be exact and testable with node --test; one implementation serves the page, the hook and the tests | Pending |
| Put chooseMove in its own pure ES module that works only on the view object | The spec requires a pure function that works for either player; isolating it lets it be benchmarked in node against bots | Pending |
| Use the same engine step for real-time play and window.tron.step(); real-time mode only adds a 15 Hz timer, the ~1 s crash display and the Space/P handling | The hook's state() must match normal play, so there must be one source of truth | Pending |
| Build the computer player in its own phase with an in-repo bot ladder and benchmark | AI strength is a quality goal that unit tests cannot capture; it needs measured iteration within a budget | Pending |

## Architecture Influences
Static index.html loads ES modules: engine (pure rules/state), ai (pure chooseMove), and main/render (canvas drawing, input, real-time loop, DOM score/message, window.tron hook). Node tests import engine and ai directly.

---
*Last updated: 2026-10-08 after initialization*
