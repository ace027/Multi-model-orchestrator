# Memory — User Preferences

Managed by the memory manager. Learnings recorded with /triad:learn are kept below the table.

## Preferences

| ID | Date | Branch | Decision Point | Context | Proposed | User Choice | Signal | Agent | Tags |
|----|------|--------|----------------|---------|----------|-------------|--------|-------|------|
| D-001 | 2026-10-08 | master | review-verdict | Phase 1 review | PASS | accepted | positive | system | review |
| D-002 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to src/game.js | Agent output for src/game.js (see plan 01-02 SUMMARY.md) | User edited src/game.js — +1/-1 lines: -      } catch (e) { / +      } catch { | corrective | testing-qa-verification-specialist | manual-edit, js, testing |
| D-003 | 2026-10-08 | master | manual-edit | Phase 1, post-build manual edit to tests/ai.test.js | Agent output for tests/ai.test.js (see plan 01-01 SUMMARY.md) | User edited tests/ai.test.js — +1/-1 lines: -import { createState, makeView, DIRS, OPPOSITE, DELTA, requ / +import { createState, makeView, DIRS, OPPOSITE, requestDire | corrective | engineering-senior-developer | manual-edit, js, engineering |
| D-004 | 2026-10-08 | master | review-verdict | Phase 2 review | PASS | accepted | positive | system | review |
| D-005 | 2026-10-08 | master | manual-edit | Phase 2, post-build manual edit to index.html | Agent output for index.html (see plan 02-01 SUMMARY.md) | User edited index.html — +5/-1 lines: +  .sr-only { position: absolute; width: 1px; height: 1px; o / -<div id="score">0 - 0</div> / +<main> / ... | corrective | engineering-senior-developer | manual-edit, html, engineering |
