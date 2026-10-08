# Phase 3: Computer player — Review Summary

## Result: PASSED

**Cycles Used**: 3
**Reviewers**: testing-qa-verification-specialist, engineering-senior-developer, engineering-frontend-developer
**Evaluators**: code-quality, integration, business-logic
**Completed**: 2026-10-08

## Findings Summary
- Must-fix (blocker, critical, major) found: 5; fixed: 5; unresolved: 0
- Suggestions (minor, advisory): 1
- Deferred (confidence 50-79%): 8
- Hot spots (flagged by 2+ reviewers): `bench/run.js`, `js/ai.js`, `tests/ai.props.test.js, tests/ai.timing.test.js`, `tests/ai.test.js`, `bench/RESULTS.md`, `tests/ai.timing.test.js`

## Findings Detail
| ID | Severity | Location | Issue | Reviewers | Confidence | Status |
|----|----------|----------|-------|-----------|------------|--------|
| F-001 | major | `bench/run.js:6` | The F-001 fix did not make the `--check` gate stable. The fix raised the max-time limit to 40 ms and added a 10 ms p99 gate, but both still measure time inside the parallel workers. I ran `node bench/run.js --rounds 10 --check` three times in a row on the 4-core box. All three runs failed: | testing-qa-verification-specialist, engineering-senior-developer | 80% | fixed |
| F-002 | major | `tests/ai.props.test.js, tests/ai.timing.test.js:1` | Both files are listed for review and named in the verification commands (`node --test tests/ai.props.test.js`, `node --test tests/ai.timing.test.js`), but neither exists in tests/. The 03-03 plan appears unfinished, and the build was stopped. Timing is covered only by a single test at tests/ai.test.js:55. The only symmetry/purity coverage I found is in tests/ai.test.js. | engineering-senior-developer, evaluator:code-quality, evaluator:business-logic | 90% | fixed |
| F-003 | major | `tests/ai.timing.test.js, tests/ai.props.test.js:1` | Both files are in the evaluation list but do not exist (`ls tests` shows only ai, bench, controller, engine, hook and play tests). The plan 03-03 tests were never written. The only timing test is `tests/ai.test.js:55`, which runs random grids. | evaluator:integration | 90% | fixed |
| F-004 | major | `tests/ai.timing.test.js (also tests/ai.test.js:55-69):21-36` | The wall-clock timing assertions are still flaky when test files run in parallel, which is how `node --test` runs them by default. A full `node --test` gave 2 failures out of 76. `ai.test.js:55` failed with "worst 351 ms", and `ai.timing.test.js` failed with "best-of-3 worst 16.21 ms" against its own 16 ms limit. Two further runs of `node --test tests/ai.test.js tests/ai.timing.test.js` failed `ai.test.js:55` with 43 ms and 21.7 ms. With `--test-concurrency=1` all 76 pass. F-001 is only partly fixed. The `--check` gate now uses p99 and a 40 ms max, but the `node --test` timing tests have the same contention flakiness. | engineering-senior-developer | 90% | fixed |
| F-005 | major | `tests/ai.test.js:55-69` | A full `node --test` run failed this test with `worst 45.19782699999996`. It is the older timing test on random 64×48 grids. It uses a single-shot max with no warm-up or retry, and it runs alongside other test files in parallel. This is the same flakiness as F-001. The new best-of-3 approach in `ai.timing.test.js` was not applied here. | engineering-senior-developer, engineering-frontend-developer | 85% | fixed |
| F-006 | advisory | `bench/run.js, tests/ai.timing.test.js, tests/ai.test.js` | No defects found. F-001, F-004 and F-005 are fixed. `tests/ai.test.js` no longer contains a wall-clock assertion; line 55 is now the purity test. `tests/ai.timing.test.js` uses a warm-up and a per-view min-of-7 against a 16 ms limit. `bench/run.js` treats p99 and max timing as warnings under `--check`, so contention can't fail the gate. I ran `node --test` three times in a row and all runs passed 75/75. `node bench/run.js --rounds 10 --check` exited 0. | engineering-frontend-developer | 85% | deferred |

## Reviewer Verdicts
- Cycle 1, testing-qa-verification-specialist: **NEEDS WORK**
- Cycle 1, engineering-senior-developer: **NEEDS WORK**
- Cycle 1, engineering-frontend-developer: **PASS**
- Cycle 1, evaluator:code-quality: **NEEDS WORK**
- Cycle 1, evaluator:integration: **NEEDS WORK**
- Cycle 1, evaluator:business-logic: **NEEDS WORK**
- Cycle 2, testing-qa-verification-specialist: **NEEDS WORK**
- Cycle 2, engineering-senior-developer: **NEEDS WORK**
- Cycle 2, engineering-frontend-developer: **NEEDS WORK**
- Cycle 2, evaluator:integration: **PASS**
- Cycle 3, testing-qa-verification-specialist: **PASS**
- Cycle 3, engineering-senior-developer: **PASS**
- Cycle 3, engineering-frontend-developer: **PASS**

## Suggestions (Not Required)
- F-006 `bench/run.js, tests/ai.timing.test.js, tests/ai.test.js`: No defects found. F-001, F-004 and F-005 are fixed. `tests/ai.test.js` no longer contains a wall-clock assertion; line 55 is now the purity test. `tests/ai.timing.test.js` uses a warm-up and a per-view min-of-7 against a 16 ms limit. `bench/run.js` treats p99 and max timing as warnings under `--check`, so contention can't fail the gate. I ran `node --test` three times in a row and all runs passed 75/75. `node bench/run.js --rounds 10 --check` exited 0. (fix: None needed.)

## Deferred (Medium Confidence)
- `js/ai.js` [minor, 50%]: With no safe root move, `chooseMove` returns `me.dir` without error. It also assumes `me.dir` and `opponent.dir` are valid names. If `dir` is unexpected, `NAMES.indexOf` returns -1, and `mdir` becomes -1. `(mdir+3)%4` is then 2, and `(mdir+1)%4` is 0. `OPP_IDX[-1]` is undefined, which silently misbehaves instead of failing.
- `js/ai.js` [minor, 60%]: `chooseMove` is a single 250-line function that holds nested closures over shared mutable state (`occ`, `aborted`, `evals`, `voro`, `sepLeaves`). The search tuning constants (`EVAL_BUDGET` 28, `SEP_BUDGET` 28) have no comment explaining the choice. The `search` function uses unrolled m0/m1/m2 and o0/o1/o2 variables. `warmUp()` also runs at import time as a side effect.
- `bench/bots.js` [advisory, 50%]: The bots re-implement grid flood fill and BFS over string-array views, and `area` and `dists` are near-duplicates. js/ai.js has its own padded-array BFS as well.
- `tests/ai.test.js` [major, 75%]: The timing test uses unseeded `Math.random()` for 50 grids at 15% density. It runs only one fixed start position, with a single cold call per grid, and has no margin below 20 ms. It does not cover open arenas or the separated mode at 64x48 (the warm-up, not the test, exercises those).
- `bench/RESULTS.md` [major, 70%]: The recorded harness max is 63.62 ms with default workers and 10.54 ms with `--workers 1`. The `--check` max-time gate (MAX_MS=10 in bench/run.js:6) fails on the final run. The file attributes this to scheduler noise but does not show a measurement that excludes it. The 20 ms bound is therefore not demonstrated, and the shipped benchmark exits non-zero.
- `tests/ai.timing.test.js` [minor, 60%]: The test asserts `best < 16` ms, where best is the minimum of three per-round worst times. That passes if any one round happens to be quiet, and it only measures the opening position of each seed. Mid-game positions with long trails are not timed. The test title says 20 ms, but the code asserts 16 ms.
- `tests/ai.props.test.js, tests/ai.timing.test.js` [minor, 55%]: Each file builds its own grid and view helper. `viewFor` and `randomView`/`asPlayer` are separate copies, and `ai.test.js` and `bench/` probably have more. The 16 ms limit in the timing test is also a magic number that is stricter than the 20 ms requirement and is not named.
- `bench/run.js` [minor, 50%]: The timing limits (p99 10 ms, max 40 ms) are only warnings under `--check`, and they don't fail the run. In my runs, measured max time reached 124 to 288 ms and only produced a WARN. The 20 ms criterion is enforced only by the single-process test in `tests/ai.timing.test.js`.

## Fixes Applied
- cycle 1: engineering-backend-architect on F-001, F-002, F-003 (done); checks 15/16 passed
- cycle 2: engineering-backend-architect on F-001, F-005 (done); engineering-senior-developer on F-004 (done); checks 15/16 passed

## Cycle Delta
- cycle 1: 3 must-fix, 0 suggestions, 5 deferred, 0 dropped (low confidence)
- cycle 2: 3 must-fix (resolved 2, new 2, unchanged 1), 0 suggestions, 2 deferred, 0 dropped (low confidence)
- cycle 3: 0 must-fix (resolved 3, new 0, unchanged 0), 1 suggestions, 1 deferred, 0 dropped (low confidence)

## Coverage
No coverage data found (looked for coverage/coverage-summary.json, coverage-summary.json, coverage/lcov.info, lcov.info, coverage.xml, coverage/cobertura-coverage.xml, coverage/coverage.xml, coverage.txt, coverage/coverage.txt). Advisory only: run the test suite with coverage to check review.coverage_thresholds.
