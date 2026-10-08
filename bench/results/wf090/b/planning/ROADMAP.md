# Light Cycles — Roadmap

## Phases

- [x] Phase 1: Engine and test hook (2 plans)
- [x] Phase 2: Playable game (2 plans)
- [x] Phase 3: Computer player (3 plans)

## Phase Details

### Phase 1: Engine and test hook
**Goal**: A DOM-free rules engine that implements the spec exactly, exposed through window.tron on a minimal index.html, with node tests for every rule
**Requirements**: REQ-03, REQ-04, REQ-05, REQ-06, REQ-11, REQ-12
**Recommended Agents**: engineering-senior-developer, testing-qa-verification-specialist
**Success Criteria**:
- [ ] node --test passes with tests for steering, simultaneous moves, every crash case incl. head-on and same-cell, draws, round reset, match end
- [ ] window.tron.reset/step/setDirection/state/chooseMove work in Chromium via Playwright and state() matches the spec shape
- [ ] Custom width/height/obstacles and ai:false behave as specified
**Plans**: 2

### Phase 2: Playable game
**Goal**: The real-time playable page: canvas rendering, keyboard controls, 15 Hz loop, start/pause/round/match flow and the required look
**Requirements**: REQ-01, REQ-02, REQ-07, REQ-08, REQ-09
**Recommended Agents**: engineering-frontend-developer, design-ui-designer, testing-qa-verification-specialist
**Success Criteria**:
- [ ] Playwright session: page waits with Space message, Space starts, arrows/WASD steer, P pauses, rounds advance automatically after ~1 s, match end shows winner and Space restarts at 0 - 0
- [ ] Screenshots at 1024×768 show the whole arena, cells >= 8×8 px, black background, cyan/orange trails, grey border
- [ ] No network requests besides the static files; node --test still passes
**Plans**: 2

### Phase 3: Computer player
**Goal**: A strong, pure chooseMove that beats bots of increasing strength on obstacle arenas as either player, within 20 ms
**Requirements**: REQ-10
**Recommended Agents**: engineering-ai-engineer, engineering-senior-developer, testing-performance-benchmarker
**Success Criteria**:
- [ ] chooseMove is pure, symmetric for either player and never exceeds 20 ms on 64×48 (measured worst case with margin)
- [ ] Node benchmark harness with bots of increasing strength (random-safe, wall-hugger, greedy space, territory) on obstacle arenas; win rate measured as P1 and P2 and improved within the iteration budget
- [ ] Never chooses an immediately fatal move when a safe one exists; node --test passes
**Plans**: 3

## Progress

| Phase | Plans | Completed | Status |
|-------|-------|-----------|--------|
| 1 | 2 | 2 | Complete |
| 2 | 2 | 2 | Complete |
| 3 | 3 | 1 | Complete |
