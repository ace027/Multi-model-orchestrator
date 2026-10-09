# Phase 1: Rules engine and test hook -- Context

## Phase Goal
A pure, exactly spec-conformant game engine with the window.tron hook on a minimal index.html, a safe baseline chooseMove, and node unit tests that cover every rule (docs/spec.md is the source of truth).

## Requirements Covered
- REQ-01
- REQ-03
- REQ-04
- REQ-05
- REQ-06
- REQ-10
- REQ-12
- REQ-13

## What Already Exists (from prior phases)
- Greenfield: the repo holds only docs/spec.md, TASK.md, settings.json, .gitignore. No previous phase.
- Node v22 and python3 are available; Playwright resolves via require('playwright') (CommonJS resolver, /opt/node-tools/node_modules). ESM `import 'playwright'` does NOT see it, so browser scripts are .cjs.

## Key Design Decisions
- Layout: src/engine.js (pure rules), src/ai.js (pure chooseMove), src/game.js (DOM-free controller behind window.tron), src/main.js (DOM bootstrap, sets window.tron), index.html at the root loading ./src/main.js as a module. Phase 2 adds rendering and the real-time loop on top of src/game.js without changing the engine.
- package.json at the root with only {"name":"light-cycles","private":true,"type":"module","scripts":{"test":"node --test"}}. No dependencies ever.
- The engine never uses DOM, Date, performance or Math.random; it is deterministic. State is mutated in place by tick() and exported only through snapshot() deep copies.
- Steering: a request is ignored if it is not one of up/down/left/right or is the reverse of the player's current (last moved) direction; otherwise it overwrites the pending request. Pending requests are cleared after each moving tick and by the next-round reset tick.
- The next-round reset tick also clears pending requests; requests made while roundOver are discarded by the reset.
- tick counts every moving tick including the crash tick; the reset tick sets tick=0; after matchWinner is set, tick() changes nothing.
- Baseline chooseMove: among non-reverse directions whose target cell is in-grid and '.', prefer those not adjacent to a cell the opponent can enter next (head-on risk), then the largest flood-fill area from the target, then keep current direction; if none is safe, return me.dir. Always returns a legal string.
- Browser verification is tools/verify-hook.cjs (not matched by node --test), which serves the root with python3 -m http.server on a free port and drives Chromium via Playwright.
- Board quick-assess constraints adopted: one test per spec rule named after its rule; explicit head-on, swap and all-fatal-chooseMove tests; a seeded fuzz test of random request sequences asserting invariants.
- Architecture proposals: skipped (no spec; gates off default).

## Plan Structure
- **Plan 01-01 (Wave 1)**: Pure rules engine and baseline chooseMove with unit tests -- Implement src/engine.js (all rules of docs/spec.md sections Arena and Rules) and a safe baseline src/ai.js chooseMove, both pure ES modules, with node --test suites that cover every rule.
- **Plan 01-02 (Wave 2)**: Game controller, window.tron hook and Playwright verification -- Add a DOM-free controller (src/game.js) implementing reset/setDirection/step/state/chooseMove, a minimal index.html + src/main.js exposing it as window.tron, node tests for the controller and a Playwright script proving the hook in Chromium.
