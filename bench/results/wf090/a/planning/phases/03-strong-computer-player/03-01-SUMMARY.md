# Plan 03-01 Summary: Bot ladder and benchmark harness

## Result
**Status**: Complete
**Wave**: 1
**Agent**: engineering-senior-developer
**Completed**: 2026-10-08

## Agent Selection Rationale

| Candidate | Semantic | Heuristic | Memory | Total | Source |
|-----------|----------|-----------|--------|-------|--------|
| engineering-senior-developer | — | 24 | 4.63 | 28.63 | heuristic |
| testing-qa-verification-specialist | — | 18 | 4.25 | 22.25 | heuristic |
| testing-api-tester | — | 17 | 0 | 17 | heuristic |

- **Task type detected**: implementation
- **Confidence**: HIGH
- **Adapter**: claude-code
- **Model tier**: sonnet

## Completed Tasks
- [x] Task 1: Arena generator, bots and frozen baseline (done)
- [x] Task 2: Game runner and benchmark CLI (done)
- [x] Task 3: Harness tests and baseline measurement (done)

## Files Modified
- `bench/arena.js`
- `bench/baseline-ai.js`
- `bench/bots.js`
- `bench/runner.js`
- `tests/bench.test.js`
- `tools/bench.mjs`

## Verification Results
9/9 verification commands passed (run by Triad after the agent finished).

## Verification Commands
| Command | Exit Code | Result |
|---------|-----------|--------|
| `node --test` | 0 | PASS |
| `node tools/bench.mjs --arenas 2 --seed 1` | 0 | PASS |
| `node tools/bench.mjs --ai bench/baseline-ai.js --arenas 2 --seed 1 --json > /dev/null` | 0 | PASS |
| `node -e "import('./bench/bots.js').then(m=>{if(m.LADDER.map(b=>b.name).join()!=='random-safe,wall-hugger,flood-fill,voronoi')process.exit(1)})"` | 0 | PASS |
| `node -e "import('./bench/arena.js').then(m=>{const a=JSON.stringify(m.generateArena(3));if(a!==JSON.stringify(m.generateArena(3)))process.exit(1)})"` | 0 | PASS |
| `node -e "import('./bench/baseline-ai.js').then(m=>{if(typeof m.chooseMove!=='function')process.exit(1)})"` | 0 | PASS |
| `node tools/bench.mjs --arenas 2 --seed 1 --json \| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);if(r.results.length!==8\|\|typeof r.timing.worstMs!=='number')process.exit(1)})"` | 0 | PASS |
| `node tools/bench.mjs --bogus; test $? -eq 2` | 0 | PASS |
| `node --test tests/bench.test.js` | 0 | PASS |

## Key Decisions
- A game is one round (until roundOver), not a full match to 3. Score is (wins + 0.5 * draws) / games.
- Bot flood-fill and voronoi area counts exclude the start cell. Voronoi breaks ties on diff first, then flood-fill area, then current direction.
- Runner failures in the CLI (for example, a bad --ai path) exit 2 with usage.
- --arenas must be a positive integer.

## Issues Encountered
- The baseline AI loses to voronoi, scoring 0.0 as P1 and 0.25 as P2, and scores 0.425 as P2 against flood-fill. A --check run with the default gates (min-score 0.65, min-side-score 0.55) would fail the baseline.

## Escalations
(none)

## Handoff Context
- **Key outputs**: bench/arena.js; bench/baseline-ai.js; bench/bots.js; bench/runner.js; tests/bench.test.js; tools/bench.mjs
- **Decisions made**: A game is one round (until roundOver), not a full match to 3. Score is (wins + 0.5 * draws) / games.; Bot flood-fill and voronoi area counts exclude the start cell. Voronoi breaks ties on diff first, then flood-fill area, then current direction.; Runner failures in the CLI (for example, a bad --ai path) exit 2 with usage.; --arenas must be a positive integer.
- **Open questions**: (none)
- **Conventions established**: Phase baseline for --baseline comparisons is bench/baseline-ai.js, mean 0.631 at arenas=20, seed=7. Run the CLI from the repo root, because --ai paths resolve against cwd.; Worst move time for the baseline is about 10 ms, against the 20 ms gate.

## Requirements Covered
- REQ-11
- REQ-13

## Token Usage
5 requests, 112413 input tokens (90143 cached), 10362 output tokens, $0.1773
