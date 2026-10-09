# Plan 03-02 Summary: Strong computer player

## Result
**Status**: Partial
**Wave**: 2
**Agent**: engineering-ai-engineer
**Completed**: 2026-10-08
**Failure Class**: BLOCKER — $ node bench/run.js --rounds 20 --check (exit 1)

## Agent Selection Rationale

| Candidate | Semantic | Heuristic | Memory | Total | Source |
|-----------|----------|-----------|--------|-------|--------|
| engineering-ai-engineer | — | 5 | 0 | 5 | mandatory |
| engineering-senior-developer | — | 23 | 4.6 | 27.6 | heuristic |
| testing-qa-verification-specialist | — | 12 | 4.75 | 16.75 | heuristic |

- **Task type detected**: implementation
- **Confidence**: LOW
- **Adapter**: claude-code
- **Model tier**: sonnet

## Completed Tasks
- [x] Task 1: Search-based AI (done)
- [ ] Task 2: Measure and tune (budget: about 5 rounds) (partial)
- [x] Task 3: AI unit tests (done)

## Files Modified
- `bench/RESULTS.md`
- `js/ai.js`
- `tests/ai.test.js`

## Verification Results
4/5 verification commands passed (run by Triad after the agent finished).

## Verification Commands
| Command | Exit Code | Result |
|---------|-----------|--------|
| `node --test` | 0 | PASS |
| `node bench/run.js --rounds 20 --check` | 1 | FAIL |
| `grep -q 'Phase 3 AI' bench/RESULTS.md` | 0 | PASS |
| `node -e "import('./js/ai.js').then(m=>{const g=Array.from({length:48},()=>'.'.repeat(64));const d=m.chooseMove({width:64,height:48,grid:g,me:{x:16,y:24,dir:'right'},opponent:{x:47,y:24,dir:'left'}});if(!['up','down','left','right'].includes(d))process.exit(1)})"` | 0 | PASS |
| `node --test tests/ai.test.js` | 0 | PASS |

## Key Decisions
- The leaf-evaluation budget is cumulative across deepening iterations and counted in evals, not time, so the AI is deterministic.
- Budget 28 is the smallest I found that keeps territory at or above 0.75 as P1.
- JIT warm-up runs at module import on throwaway views. The AI keeps no module state and does not touch the view.
- The articulation-point penalty from the plan was not implemented. The sealed-off leaf scoring and the parity-bound space fill replaced it.

## Issues Encountered
- `node bench/run.js --rounds 20 --check` does not exit 0 because of the max-time check. If it must pass, rerun on a quiet machine, or decide whether the harness should report a high percentile instead of the max. Both are outside my file list.
- An unrelated process overwrote /tmp/prof.mjs mid-task, so /tmp is shared. I switched to my own scratch directory.
- BLOCKER: $ node bench/run.js --rounds 20 --check (exit 1)

## Escalations
| # | Severity | Type | Decision | Status | Resolution |
|---|----------|------|----------|--------|------------|
| 1 | info (declared blocker) | quality | Resolve: $ node bench/run.js --rounds 20 --check (exit 1) | pending |  |

- #1 context: Verification failed (node bench/run.js --rounds 20 --check); a BLOCKER is not auto-fixed.

## Handoff Context
- **Key outputs**: bench/RESULTS.md; js/ai.js; tests/ai.test.js
- **Decisions made**: The leaf-evaluation budget is cumulative across deepening iterations and counted in evals, not time, so the AI is deterministic.; Budget 28 is the smallest I found that keeps territory at or above 0.75 as P1.; JIT warm-up runs at module import on throwaway views. The AI keeps no module state and does not touch the view.; The articulation-point penalty from the plan was not implemented. The sealed-off leaf scoring and the parity-bound space fill replaced it.
- **Open questions**: (none)
- **Conventions established**: Win-rate margins at budget 28: territory P1 0.80, P2 0.95. Lowering the budget below about 24 costs territory P1.; Measure timing with `--workers 1`, or read p99. The harness max is dominated by stalls from other load on this machine.

## Requirements Covered
- REQ-10

### Failed verification output
`node bench/run.js --rounds 20 --check`
```
bot          | P1 W/D/L score | P2 W/D/L score
-------------+----------------+---------------
random-safe  | 20/0/0 1.00    | 20/0/0 1.00   
wall-hugger  | 20/0/0 1.00    | 20/0/0 1.00   
greedy-space | 20/0/0 1.00    | 20/0/0 1.00   
territory    | 16/0/4 0.80    | 19/0/1 0.95   

AI chooseMove: max 26.02 ms, p99 3.29 ms, mean 1.010 ms, calls 43303; elapsed 25.5 s
FAIL: maxMs 26.02 > 10

```

## Token Usage
38 requests, 1583290 input tokens (1527626 cached), 35683 output tokens, $0.8015
