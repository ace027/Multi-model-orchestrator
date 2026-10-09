# Memory — User Preferences

Managed by the memory manager. Learnings recorded with /triad:learn are kept below the table.

## Preferences

| ID | Date | Branch | Decision Point | Context | Proposed | User Choice | Signal | Agent | Tags |
|----|------|--------|----------------|---------|----------|-------------|--------|-------|------|
| D-001 | 2026-10-08 | master | review-verdict | Phase 1 review | PASS | accepted | positive | system | review |
| D-002 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to src/ai.js | Agent output for src/ai.js (see plan 01-02 SUMMARY.md) | User edited src/ai.js — +1/-1 lines: -  const dir = me && Object.prototype.hasOwnProperty.call(DE / +  const dir = me && Object.hasOwn(DELTAS, me.dir) ? me.dir | corrective | engineering-senior-developer | manual-edit, js, engineering |
| D-003 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to src/engine.js | Agent output for src/engine.js (see plan 01-01 SUMMARY.md) | User edited src/engine.js — +1/-1 lines: -    const dir = p.pending !== null ? p.pending : p.dir; / +    const dir = p.pending ?? p.dir; | corrective | engineering-senior-developer | manual-edit, js, engineering |
| D-004 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to tests/browser.test.js | Agent output for tests/browser.test.js (see plan 01-03 SUMMARY.md) | User edited tests/browser.test.js — +1/-1 lines: -    page.on('pageerror', (err) => pageErrors.push(String(er / +    page.on('pageerror', (err) => pageErrors.push(String(er | corrective | testing-workflow-optimizer | manual-edit, js, testing |
| D-005 | 2026-10-08 | master | review-verdict | Phase 2 review | PASS | accepted | positive | system | review |
| D-006 | 2026-10-08 | master | manual-edit | Phase 2, post-build manual edit to tests/play.test.js | Agent output for tests/play.test.js (see plan 02-03 SUMMARY.md) | User edited tests/play.test.js — +3/-3 lines: -  playwright = null; / +  // playwright is optional; the suite is skipped without i / -    const before = await state(); / ... | corrective | engineering-frontend-developer | manual-edit, js, engineering |
| D-007 | 2026-10-08 | master | manual-edit | Phase 2, post-build manual edit to tests/session.test.js | Agent output for tests/session.test.js (see plan 02-02 SUMMARY.md) | User edited tests/session.test.js — +1/-1 lines: -function loseRound({ session, controller }, from) { / +function loseRound({ session }, from) { | corrective | engineering-senior-developer | manual-edit, js, engineering |
