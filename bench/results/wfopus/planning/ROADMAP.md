# Light Cycles — Roadmap

## Phases

- [x] Phase 1: Game engine and test hook (3 plans)
- [x] Phase 2: Playable page: rendering, input, loop and UI (3 plans)
- [ ] Phase 3: Computer player (3 plans)

## Phase Details

### Phase 1: Game engine and test hook
**Goal**: A DOM-free engine implementing the arena, steering, simultaneous moves, crash rules, rounds and match exactly per spec, exposed through window.tron (reset/setDirection/step/state/chooseMove stub), with node --test coverage of every rule
**Requirements**: REQ-01, REQ-02, REQ-03, REQ-04, REQ-05, REQ-06, REQ-07, REQ-13, REQ-14
**Recommended Agents**: engineering-senior-developer, testing-qa-verification-specialist
**Success Criteria**:
- [ ] node --test passes with tests covering start positions, reverse-ignore and last-request-wins steering, wall/obstacle/trail/head-on/same-cell crashes, draws, scoring, round reset and match end
- [ ] window.tron.reset/step/state behave per spec in a Playwright check against a served index.html
- [ ] state().grid uses '.', '#', '1', '2' and matches engine state
**Plans**: 3

### Phase 2: Playable page: rendering, input, loop and UI
**Goal**: A playable browser game: canvas rendering in the spec colours, keyboard steering, 15 ticks/s loop, Space start, P pause, round-end message with about one second crash display, match-end message, live #score
**Requirements**: REQ-01, REQ-08, REQ-09, REQ-10, REQ-11
**Recommended Agents**: engineering-frontend-developer, design-ui-designer, testing-qa-verification-specialist
**Success Criteria**:
- [ ] Playwright session: on load #message contains Space and nothing moves; Space starts; arrows/WASD steer; P pauses and resumes
- [ ] #score shows 'a - b' updated at round end; round-end and match-end messages correct; Space after match restarts at 0 - 0
- [ ] Screenshot at 1024×768 shows the whole arena, cells ≥8×8 CSS px, black background, cyan/orange trails, grey border
- [ ] No network requests besides same-origin static files
**Plans**: 3

### Phase 3: Computer player
**Goal**: A strong, fast, pure chooseMove that steers either player well on arenas with obstacles, wired in as player 2
**Requirements**: REQ-12, REQ-14
**Recommended Agents**: engineering-ai-engineer, testing-performance-benchmarker
**Success Criteria**:
- [ ] chooseMove returns a legal direction within 20 ms worst case on 64×48 (measured over many positions)
- [ ] Never picks an immediately fatal move when a safe one exists; handles either player seat
- [ ] Local bot harness (random, wall-avoider, flood-fill greedy, territory-based) on obstacle arenas: wins a clear majority against each, measured and reported
- [ ] node --test covers purity, legality, timing and basic survival
**Plans**: 3

## Progress

| Phase | Plans | Completed | Status |
|-------|-------|-----------|--------|
| 1 | 3 | 3 | Complete |
| 2 | 3 | 3 | Complete |
| 3 | 3 | 1 | In Progress |
