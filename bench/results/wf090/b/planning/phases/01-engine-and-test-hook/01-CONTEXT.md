# Phase 1: Engine and test hook -- Context

## Phase Goal
A DOM-free rules engine that implements docs/spec.md exactly, exposed through window.tron on a minimal index.html, with node tests for every rule

## Requirements Covered
- REQ-03
- REQ-04
- REQ-05
- REQ-06
- REQ-11
- REQ-12

## What Already Exists (from prior phases)
- Greenfield: repo holds only TASK.md, docs/spec.md, settings.json, .gitignore. Node v22 and Playwright (require/import 'playwright') with Chromium are available.

## Key Design Decisions
- package.json at the root with only {"name":"light-cycles","private":true,"type":"module"} (no dependencies, no scripts needed) so js/*.js and tests/*.test.js are ES modules under node --test
- js/engine.js exports class Game (DOM-free); js/ai.js exports chooseMove (DOM-free, baseline only: Phase 3 replaces its internals, keeping the signature); js/main.js is the only DOM-touching module and owns window.tron
- AI request in ai mode is made by main.js just before game.step() and only while a round is running (not roundOver, no matchWinner)
- state() and view() always return fresh deep copies; mutating them never affects the engine (board recommendation)
- Browser tests start their own node http static server on an ephemeral port inside the test file; no python dependency
- Architecture proposals: skipped (gates off, no spec recommendation). Board quick-assess red flags were only 'nothing built yet' and are not plan constraints

## Plan Structure
- **Plan 01-01 (Wave 1)**: Rules engine, baseline chooseMove and node tests -- Implement the spec's arena, steering, moving, crashing, round and match rules as a DOM-free ES module class, a baseline pure chooseMove, and node --test tests covering every rule.
- **Plan 01-02 (Wave 2)**: Minimal page with window.tron test hook and Playwright test -- Add index.html with canvas#game, #score, #message and js/main.js exposing window.tron (reset, step, setDirection, state, chooseMove) over the engine, verified in Chromium by a node --test Playwright test.
