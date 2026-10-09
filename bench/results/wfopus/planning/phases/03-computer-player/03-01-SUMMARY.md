# Plan 03-01 Summary: Bot harness: four bots, seeded obstacle arenas, round runner and CLI

## Result
**Status**: Complete
**Wave**: 1
**Agent**: engineering-senior-developer
**Completed**: 2026-10-08

## Agent Selection Rationale

| Candidate | Semantic | Heuristic | Memory | Total | Source |
|-----------|----------|-----------|--------|-------|--------|
| engineering-senior-developer | — | 20 | 4.4 | 24.4 | heuristic |
| testing-qa-verification-specialist | — | 16 | 4.25 | 20.25 | heuristic |
| testing-api-tester | — | 17 | 0 | 17 | heuristic |

- **Task type detected**: implementation
- **Confidence**: HIGH
- **Adapter**: claude-code
- **Model tier**: sonnet

## Completed Tasks
- [x] Task 1: Bots (done)
- [x] Task 2: Harness and CLI (done)
- [x] Task 3: Harness tests (done)

## Files Modified
- `scripts/arena.js`
- `tests/bots.test.js`
- `tests/support/bots.js`
- `tests/support/harness.js`

## Verification Results
6/6 verification commands passed (run by Triad after the agent finished).

## Verification Commands
| Command | Exit Code | Result |
|---------|-----------|--------|
| `node --test tests/bots.test.js` | 0 | PASS |
| `node scripts/arena.js --policy src/ai.js --rounds 4 --seed 1` | 0 | PASS |
| `node --test` | 0 | PASS |
| `node -e "import('./tests/support/bots.js').then(m=>{if(Object.keys(m.BOTS).join()!=='random,wall,flood,territory')process.exit(1)})"` | 0 | PASS |
| `node scripts/arena.js --policy bot:territory --bots random --rounds 4 --json \| node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);if(r.length!==1\|\|r[0].rounds!==4\|\|r[0].wins+r[0].losses+r[0].draws!==4)process.exit(1)})"` | 0 | PASS |
| `! node scripts/arena.js --rounds 3` | 0 | PASS |

## Key Decisions
- Territory bot timing: the plan's "opponent distance +1" was ambiguous. I counted my target cell as time 1 and the opponent's head as time 0, so both sides' first moves land at the same step. The literal reading would have given my bot a one-move head start it doesn't really have.
- Territory bot ignores rng: ties after territory score, flood count and going straight go to the first candidate in order (straight, then the two turns).
- Flood bot: when moves tie, it goes straight if that is among them, otherwise picks one with rng.
- runSeries uses one arena rng for the whole series (mulberry32(seed)) and starts a fresh round rng (mulberry32(seed*1000+i)) for each seat, so the bot's random choices are the same whichever seat the policy takes.
- A valid but reversing direction is not counted as an error (the engine just ignores it). Only throws and strings that are not a direction count as errors.
- makeArena stops after max(1000, 50*target) placement attempts so a tiny grid cannot loop forever. On 64x48 it fills exactly floor(0.06*W*H) cells.
- --sizes rejects any side under 8, and the CLI exits 2 on unknown arguments or bots.

## Issues Encountered
- none

## Escalations
(none)

## Handoff Context
- **Key outputs**: scripts/arena.js; tests/bots.test.js; tests/support/bots.js; tests/support/harness.js
- **Decisions made**: Territory bot timing: the plan's "opponent distance +1" was ambiguous. I counted my target cell as time 1 and the opponent's head as time 0, so both sides' first moves land at the same step. The literal reading would have given my bot a one-move head start it doesn't really have.; Territory bot ignores rng: ties after territory score, flood count and going straight go to the first candidate in order (straight, then the two turns).; Flood bot: when moves tie, it goes straight if that is among them, otherwise picks one with rng.; runSeries uses one arena rng for the whole series (mulberry32(seed)) and starts a fresh round rng (mulberry32(seed*1000+i)) for each seat, so the bot's random choices are the same whichever seat the policy takes.; A valid but reversing direction is not counted as an error (the engine just ignores it). Only throws and strings that are not a direction count as errors.; makeArena stops after max(1000, 50*target) placement attempts so a tiny grid cannot loop forever. On 64x48 it fills exactly floor(0.06*W*H) cells.; --sizes rejects any side under 8, and the CLI exits 2 on unknown arguments or bots.
- **Open questions**: (none)
- **Conventions established**: Tune with `node scripts/arena.js --policy src/ai.js` (defaults: 24 rounds, seed 1, sizes 64x48 and 40x30). For the CI gate add `--require 0.6 --max-ms 20`.; runSeries returns { bot, rounds, wins, losses, draws, winRate, maxMs, meanMs, calls, errors }, and --json prints an array of these objects, one per bot.; Policies are called as (view, rng). chooseMove can ignore rng. Timing uses performance.now() around each call and counts only the policy's calls.; tests/support/*.js are not picked up by node --test, only tests/bots.test.js is.

## Requirements Covered
- REQ-12
- REQ-14

## Token Usage
8 requests, 205922 input tokens (170738 cached), 15988 output tokens, $0.5298
