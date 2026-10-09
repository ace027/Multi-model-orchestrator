# Phase 3: Computer player -- Context

## Phase Goal
A strong, pure chooseMove that beats bots of increasing strength on obstacle arenas as either player, within 20 ms on 64x48 (REQ-10).

## Requirements Covered
- REQ-10: player 2 is steered by chooseMove(view), a pure function of {width,height,grid,me,opponent} that returns 'up'|'down'|'left'|'right' within 20 ms on 64x48, works for either player, and is scored against bots of increasing strength on obstacle arenas as either player (docs/spec.md 'Computer player')

## What Already Exists (from prior phases)
- js/engine.js: Game({width,height,obstacles}) with setDirection(player,dir), step(), state(), view(player), getters roundOver/matchWinner; exports DIRS, DELTA, OPPOSITE. A round ends on the crash tick; state().roundWinner is 1, 2 or 0 (draw).
- js/ai.js: baseline chooseMove (1-ply flood-fill area with a halving penalty for cells the opponent can also enter). Imported by js/main.js and js/controller.js (advance calls chooseMove(game.view(2))).
- tests/ai.test.js: basic legality/wall/corridor tests; package.json is {type: module}; no dependencies; node --test runs tests/*.test.js.

## Key Design Decisions
- Board quick-assess skipped: fewer than 2 personas scored for the phase. Architecture proposals: skipped (gates off, no spec recommendation). Spec: skipped (no trigger).
- Harness lives in bench/ (bench/bots.js, bench/arenas.js, bench/harness.js, bench/run.js), plain ES modules, no dependencies, plays rounds with the real Game from js/engine.js, a fresh Game per round.
- Score per bot per side = (wins + 0.5*draws)/rounds. Rounds are capped at width*height ticks (cap counts as a draw).
- chooseMove stays pure and deterministic: no clock reads, no Math.random, no module-level mutable state, view never mutated. Time is bounded by a fixed node/work budget, not a deadline. Worst-case target 10 ms in node (2x margin under the 20 ms spec).
- --check thresholds (both sides, every bot): random-safe >= 0.90, wall-hugger >= 0.90, greedy-space >= 0.75, territory >= 0.60, and max chooseMove time <= 10 ms.
- Phase quality budget for the AI: about 5 measure-improve rounds, each measured with the harness as P1 and P2; record each round in bench/RESULTS.md.

## Plan Structure
- **Plan 03-01 (Wave 1)**: Benchmark harness, bots and obstacle arenas -- Build a node benchmark that plays the AI against four bots of increasing strength on seeded obstacle arenas as P1 and P2, reports win rates and chooseMove timing, and record the baseline of the current js/ai.js.
- **Plan 03-02 (Wave 2)**: Strong computer player -- Replace js/ai.js with a strong, pure, deterministic chooseMove that passes node bench/run.js --check as P1 and P2 within a 10 ms worst case, improving over the baseline within a 5-round tuning budget.
- **Plan 03-03 (Wave 3)**: AI property, timing and symmetry verification -- Prove the success criteria independently: chooseMove never exceeds 20 ms on 64x48 (measured worst case with margin), is pure, symmetric for either player and never picks an immediately fatal move when a safe one exists; and confirm the page still plays with the new AI.
