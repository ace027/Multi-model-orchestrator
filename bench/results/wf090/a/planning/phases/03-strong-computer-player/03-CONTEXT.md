# Phase 3: Strong computer player -- Context

## Phase Goal
Make chooseMove as strong as possible against bots of increasing strength on obstacle arenas, playing as either player, within 20 ms per move

## Requirements Covered
- REQ-10: chooseMove(view) is pure, takes {width,height,grid,me,opponent}, returns a direction within 20 ms on 64x48, works for either player
- REQ-11: computer player as strong as possible against bots of increasing strength on arenas with obstacles, as either player
- REQ-13: tests in tests/*.test.js pass with node --test; browser verification with Playwright + Chromium still passes

## What Already Exists (from prior phases)
- src/engine.js: createState({width,height,obstacles:[[x,y],...]}), tick(state), requestDirection(state,player,dir), makeView(state,player), snapshot(state), DIRS, OPPOSITE, DELTA; grid = array of row strings ('.', '#', '1', '2')
- src/ai.js: baseline chooseMove (BFS flood-fill area per safe move, penalty for cells the opponent can reach next, prefers heading); imports OPPOSITE, DELTA from engine.js; exported as named and default
- View = {width,height,grid,me:{x,y,dir},opponent:{x,y,dir}}; src/game.js step() calls chooseMove(makeView(state,2)) in try/catch for P2
- tests/ai.test.js: 10 tests incl. purity/determinism and 200-call worst-case < 20 ms timing; node --test: 57 pass
- tools/verify-hook.cjs and tools/verify-play.cjs: Playwright browser checks run with node tools/<name>.cjs

## Key Design Decisions
- Board quick-assess could not run (fewer than 2 scoring personas); architecture proposals skipped (no spec, gates off). Spec: skipped (no trigger).
- Benchmark lives in bench/ (bots, arenas, game runner, frozen baseline) plus the CLI tools/bench.mjs (ESM so it imports src/ modules directly); no npm dependencies
- A benchmark game is a single round on a 64x48 arena with seeded random obstacles; every arena is played twice with sides swapped (AI as P1 and as P2); maxTicks = width*height then draw
- Score = (wins + 0.5*draws)/games. Gate (--check): overall score >= 0.65 against every ladder bot, per-side score >= 0.55 against every bot, worst-case move time < 20 ms after 20 warm-up calls
- Improvement gate: mean score over all bots must beat the frozen baseline (bench/baseline-ai.js, an exact copy of the phase-1 chooseMove) by >= 0.10 on the same arenas
- Tuning seed is 7; plan 03-03 re-runs the gate on held-out seed 1001 to catch overfitting
- chooseMove stays deterministic and pure: search is bounded by a node-count budget, never by Date/performance.now, and never uses Math.random; it never mutates view
- Project code style preferences from memory: optional catch binding (catch { }), no unused imports

## Plan Structure
- **Plan 03-01 (Wave 1)**: Bot ladder and benchmark harness -- Build a node benchmark that plays any chooseMove module against a ladder of four bots on seeded random obstacle arenas as P1 and P2, reporting win rates, move timings, a pass/fail gate and improvement over a frozen baseline.
- **Plan 03-02 (Wave 2)**: Strong chooseMove: search, territory evaluation, endgame fill -- Replace the baseline chooseMove in src/ai.js with a deterministic search-based player that passes the benchmark gate against every ladder bot as either player, improves on the baseline by at least 0.10 mean score, and keeps worst-case move time under 20 ms.
- **Plan 03-03 (Wave 3)**: Held-out verification, browser regression and benchmark report -- Prove the new player generalises to unseen arenas, stays under the time limit, still drives the browser game, and document the measured results.
