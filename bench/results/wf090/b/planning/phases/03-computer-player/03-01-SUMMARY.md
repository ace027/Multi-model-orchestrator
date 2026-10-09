# Plan 03-01 Summary: Benchmark harness, bots and obstacle arenas

## Result
**Status**: Complete
**Wave**: 1
**Agent**: engineering-senior-developer
**Completed**: 2026-10-08

## Agent Selection Rationale

| Candidate | Semantic | Heuristic | Memory | Total | Source |
|-----------|----------|-----------|--------|-------|--------|
| engineering-senior-developer | — | 20 | 4.6 | 24.6 | heuristic |
| testing-qa-verification-specialist | — | 16 | 4.75 | 20.75 | heuristic |
| testing-api-tester | — | 17 | 0 | 17 | heuristic |

- **Task type detected**: implementation
- **Confidence**: HIGH
- **Adapter**: claude-code
- **Model tier**: sonnet

## Completed Tasks
- [x] Task 1: Bots and arenas (done)
- [x] Task 2: Harness and CLI (done)
- [x] Task 3: Tests and baseline (done)

## Files Modified
- `bench/RESULTS.md`
- `bench/arenas.js`
- `bench/bots.js`
- `bench/harness.js`
- `bench/run.js`
- `tests/bench.test.js`

## Verification Results
8/8 verification commands passed (run by Triad after the agent finished).

## Verification Commands
| Command | Exit Code | Result |
|---------|-----------|--------|
| `node --test` | 0 | PASS |
| `node bench/run.js --rounds 2` | 0 | PASS |
| `grep -q 'Baseline' bench/RESULTS.md` | 0 | PASS |
| `node -e "import('./bench/bots.js').then(m=>{if(m.BOTS.length!==4)process.exit(1)})"` | 0 | PASS |
| `node -e "import('./bench/arenas.js').then(m=>{const a=m.makeArena(7),b=m.makeArena(7);if(JSON.stringify(a)!==JSON.stringify(b)\|\|!a.obstacles.length)process.exit(1)})"` | 0 | PASS |
| `node bench/run.js --rounds 2 --workers 1` | 0 | PASS |
| `node bench/run.js --rounds 2 --json \| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);if(!r.bots['territory']\|\|typeof r.ai.maxMs!=='number')process.exit(1)})"` | 0 | PASS |
| `node --test tests/bench.test.js` | 0 | PASS |

## Key Decisions
- Mirrored arenas mirror x to W-1-x and y to 2*cy-y, where cy is the start row. Point symmetry through the grid centre does not map P1's start to P2's start when H is even, and this does.
- Cells that must stay free (starts, the 3 cells ahead, and their 4-neighbours) are filtered out of the obstacles. Regeneration with seed+1000*attempt only happens when the starts end up disconnected or no obstacles remain.
- The territory bot scores diff*100000 + total area. This reproduces the plan's tie-break by flood-fill area.
- Bot and arena seeds are both `seed + round index`.

## Issues Encountered
- The baseline AI scores 1.00 against random-safe, 0.90 against wall-hugger, 0.30/0.50 (P1/P2) against greedy-space and 0.10/0.00 against territory. maxMs is 13.2 ms, with p99 2.4 ms and mean 0.6 ms.
- The first call or two per round may inflate maxMs.

## Escalations
(none)

## Handoff Context
- **Key outputs**: bench/RESULTS.md; bench/arenas.js; bench/bots.js; bench/harness.js; bench/run.js; tests/bench.test.js
- **Decisions made**: Mirrored arenas mirror x to W-1-x and y to 2*cy-y, where cy is the start row. Point symmetry through the grid centre does not map P1's start to P2's start when H is even, and this does.; Cells that must stay free (starts, the 3 cells ahead, and their 4-neighbours) are filtered out of the obstacles. Regeneration with seed+1000*attempt only happens when the starts end up disconnected or no obstacles remain.; The territory bot scores diff*100000 + total area. This reproduces the plan's tie-break by flood-fill area.; Bot and arena seeds are both `seed + round index`.
- **Open questions**: (none)
- **Conventions established**: Run `node bench/run.js --rounds 10 --check` to measure. It exits 1 on any failed threshold.; The `--ai path` flag loads another module that exports chooseMove, so 03-02 can compare candidates without replacing js/ai.js.; Workers default to availableParallelism()-1. Use --workers 1 for in-process timing without worker contention.; A 10-round run takes about 11 s.

## Requirements Covered
- REQ-10

## Token Usage
5 requests, 115412 input tokens (91821 cached), 11751 output tokens, $0.1948
