# Phase 3: Computer player -- Context

## Phase Goal
A strong, fast, pure chooseMove that steers either player well on arenas with obstacles, wired in as player 2

## Requirements Covered
- REQ-12: chooseMove(view) pure; view {width,height,grid (height strings, '.' free),me{x,y,dir},opponent{x,y,dir}}; returns up/down/left/right within 20 ms on 64x48; called each tick with the pre-tick state as P2's request; works for either player; plays as strongly as possible against bots of increasing strength on obstacle arenas
- REQ-14: automated tests as tests/*.test.js pass with node --test

## What Already Exists (from prior phases)
- src/engine.js (phase 1): createGame({width,height,obstacles}), requestDirection(game,player,dir), willMove(game), tick(game), getState(game) -> {roundOver, roundWinner, players...}, getView(game,player) -> the chooseMove view; DIRECTIONS, DELTAS, OPPOSITE; obstacles [[x,y]] (invalid/start-cell entries skipped); grid chars '.', '#', '1', '2'
- src/ai.js (phase 1): stub chooseMove(view) — straight, then perpendicular turns, never reverses, 'up' for an invalid dir, keeps dir when boxed in. Imported by src/main.js (passed to createController and installTronHook) and tests/hook.test.js
- src/controller.js advance(): if ai && willMove(game) it calls requestDirection(game, 2, chooseMove(getView(game, 2))) inside try/catch, then tick(game) — so P2 is already wired to whatever src/ai.js exports
- tests/hook.test.js has stub-behaviour tests the new AI must keep passing: legal and never reverses on random views, avoids an immediately blocked cell when a free one exists, turns at a wall ahead, keeps dir when boxed in, returns 'up' for a bad dir, does not mutate its view
- tests/support/static-server.js + Playwright are used by tests/browser.test.js and tests/play.test.js; node --test currently 94/94 passing

## Key Design Decisions
- The bot harness lives under tests/support/ (bots.js, harness.js) plus a CLI scripts/arena.js; node --test does not pick up tests/support/*.js because they are not *.test.js
- Strength is measured in rounds (not matches) on seeded obstacle arenas, in seat-swapped pairs on the same arena; win rate = wins / rounds, draws count as non-wins
- Strength targets on the harness (24 rounds per bot, mixed 64x48 and 40x30 obstacle arenas): >= 0.9 vs random and wall-avoider, >= 0.75 vs flood-fill greedy, >= 0.6 vs territory; the CI gate (--require 0.6) is the clear-majority floor
- chooseMove stays deterministic and pure: no Math.random, no Date/performance clock reads, output never depends on earlier calls; search depth is bounded by a fixed work budget, not a clock, sized so worst-case latency on this machine is under 10 ms on 64x48 (half the 20 ms limit, as headroom for a slower grading machine)
- Existing chooseMove contracts are kept: invalid me.dir -> 'up'; when every move is fatal -> keep me.dir; never return the reverse of me.dir
- Board quick-assess skipped: fewer than 2 personas scored for the phase. Spec trigger: skip. Architecture proposals: skipped (no spec recommends them; autonomous mode). Persona override for 03-02: the ranker's top picks (testing-workflow-optimizer, support-finance-tracker) do not fit game AI, so engineering-ai-engineer (ranked 3rd, roadmap-recommended) runs it on the Opus tier

## Plan Structure
- **Plan 03-01 (Wave 1)**: Bot harness: four bots, seeded obstacle arenas, round runner and CLI -- Build a deterministic local harness that plays any chooseMove-style policy against four bots of increasing strength (random, wall-avoider, flood-fill greedy, territory) on seeded obstacle arenas in both seats and reports win rates and policy latency.
- **Plan 03-02 (Wave 2)**: Strong pure chooseMove tuned against the harness -- Replace the stub in src/ai.js with a strong, deterministic, pure chooseMove that stays well under 20 ms on 64x48 and wins a clear majority against every harness bot in both seats on obstacle arenas.
- **Plan 03-03 (Wave 3)**: Latency benchmark, strength report and in-browser AI check -- Independently measure chooseMove's worst-case latency over thousands of positions, publish a strength report from the harness, and prove in a browser that the computer player drives player 2.
