# Memory — User Preferences

Managed by the memory manager. Learnings recorded with /triad:learn are kept below the table.

## Preferences

| ID | Date | Branch | Decision Point | Context | Proposed | User Choice | Signal | Agent | Tags |
|----|------|--------|----------------|---------|----------|-------------|--------|-------|------|
| D-001 | 2026-10-08 | master | review-verdict | Phase 1 review | PASS | accepted | positive | system | review |
| D-002 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to js/engine.js | Agent output for js/engine.js (see plan 01-01 SUMMARY.md) | User edited js/engine.js — +4/-1 lines: -  constructor({ width = 64, height = 48, obstacles = [] } = / +  constructor({ width, height, obstacles = [] } = {}) { / +    // Invalid or too-small dimensions fall back to the def / ... | corrective | engineering-senior-developer | manual-edit, js, engineering |
| D-003 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to js/main.js | Agent output for js/main.js (see plan 01-02 SUMMARY.md) | User edited js/main.js — +0/-2 lines: -let manual = false; / -    manual = true; | corrective | testing-workflow-optimizer | manual-edit, js, testing |
| D-004 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to tests/engine.test.js | Agent output for tests/engine.test.js (see plan 01-01 SUMMARY.md) | User edited tests/engine.test.js — +11/-0 lines: + / +test('invalid or too-small dimensions fall back to defaults / +  for (const bad of [0, -5, NaN, 1.5, 'abc', null, 1, 2, In / ... | corrective | engineering-senior-developer | manual-edit, js, engineering |
| D-005 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to tests/hook.test.js | Agent output for tests/hook.test.js (see plan 01-02 SUMMARY.md) | User edited tests/hook.test.js — +1/-1 lines: -  } catch (e) { / +  } catch { | corrective | testing-workflow-optimizer | manual-edit, js, testing |
| D-006 | 2026-10-08 | master | review-verdict | Phase 2 review | PASS | accepted | positive | system | review |
| D-007 | 2026-10-08 | master | manual-edit | Phase 2, post-build manual edit to index.html | Agent output for index.html (see plan 02-01 SUMMARY.md) | User edited index.html — +4/-4 lines: -<html> / +<html lang="en"> / -<div id="score">0 - 0</div> / ... | corrective | engineering-senior-developer | manual-edit, html, engineering |
| D-008 | 2026-10-08 | master | review-verdict | Phase 3 review | PASS | accepted | positive | system | review |
