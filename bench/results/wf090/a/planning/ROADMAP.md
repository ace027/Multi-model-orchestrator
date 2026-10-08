# Light Cycles — Roadmap

## Phases

- [x] Phase 1: Rules engine and test hook (2 plans)
- [x] Phase 2: Playable browser game (2 plans)
- [ ] Phase 3: Strong computer player (3 plans)

## Phase Details

### Phase 1: Rules engine and test hook
**Goal**: A pure, exactly spec-conformant game engine with the window.tron hook on a minimal index.html, a safe baseline chooseMove, and node unit tests that cover every rule
**Requirements**: REQ-01, REQ-03, REQ-04, REQ-05, REQ-06, REQ-10, REQ-12, REQ-13
**Recommended Agents**: engineering-senior-developer, testing-qa-verification-specialist
**Success Criteria**:
- [ ] node --test passes with tests covering steering (reverse ignored, last request wins), simultaneous moves, every crash case (wall, obstacle, trail, pre-move cells, head-on same cell), crashed cycles not moving, round end and scoring, draws, next-round reset, match at 3 and no-op ticks after the match
- [ ] In Chromium via Playwright, window.tron.reset/setDirection/step/state/chooseMove behave as specified and state() has the exact shape
- [ ] The baseline chooseMove always returns a legal direction in under 20 ms and avoids immediate crashes when it can
**Plans**: 2

### Phase 2: Playable browser game
**Goal**: Real-time play in the browser: canvas rendering in the specified colours, keyboard controls, the 15 Hz loop, the start, pause, round-end and match-end flow, and the #score/#message text
**Requirements**: REQ-02, REQ-07, REQ-08, REQ-09, REQ-13
**Recommended Agents**: engineering-frontend-developer, testing-qa-verification-specialist, design-ui-designer
**Success Criteria**:
- [ ] Playwright script: on load #message contains 'Space' and nothing moves; Space starts; arrows/WASD steer; P pauses and resumes
- [ ] #score shows 'a - b' and updates as soon as a round ends; the crash is shown for about 1 s, then the next round starts automatically; at match end #message names the winner and contains 'Space'; Space restarts at 0 - 0
- [ ] Screenshots at 1024x768 show the whole arena with cells of at least 8x8 px, a near-black background, cyan/orange trails and a grey border
**Plans**: 2

### Phase 3: Strong computer player
**Goal**: Make chooseMove as strong as possible against bots of increasing strength on obstacle arenas, playing as either player, within 20 ms per move
**Requirements**: REQ-10, REQ-11, REQ-13
**Recommended Agents**: engineering-ai-engineer, testing-performance-benchmarker, engineering-senior-developer
**Success Criteria**:
- [ ] A node benchmark harness plays chooseMove against a ladder of bots (random-safe, wall-hugger, flood-fill, territory/Voronoi) on random obstacle arenas, as P1 and P2, and reports win rates
- [ ] chooseMove beats every ladder bot by a clear margin as either player, with measured improvement over the baseline
- [ ] Worst-case move time stays under 20 ms on 64x48 (measured); chooseMove stays pure and the tests pass
**Plans**: 3

## Progress

| Phase | Plans | Completed | Status |
|-------|-------|-----------|--------|
| 1 | 2 | 2 | Complete |
| 2 | 2 | 2 | Complete |
| 3 | 3 | 1 | In Progress |
