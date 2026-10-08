# Contributing

Triad is a Claude Code plugin in `triad/`, written in TypeScript and run by the Claude Code plugin runtime. `PARITY.md` tracks its parity with Legion, and `SPEC.md` is the design.

## Setup

1. Install [bun](https://bun.sh) and Claude Code (`npm i -g @anthropic-ai/claude-code`, version 2.1.287 or later).
2. Run the plugin from a checkout: `claude --model opus --plugin-dir ./triad`.

There is no `npm install` step: the plugin imports only its own files and `claude-code`.

## Checks

Run these from the repository root before you open a pull request. CI (`.github/workflows/ci.yml`) runs the same four on every push and pull request.

| Command | Checks |
|---|---|
| `claude plugin validate triad` | Plugin manifest and hook wiring. Warnings are fine; errors are not. |
| `claude plugin test triad` | Every `triad/*.test.ts` suite. |
| `bun triad/scripts/release-check.ts` | Version is semver and named in `triad/README.md`; every command passes the lint and its byte budget; the orchestrator guide is within budget; every `mcp__triad__*` tool and `/triad:*` command a command names exists; the fixture bundle is current. |
| `bun triad/scripts/spawn-truthfulness.ts` | A command that says it spawns agents names how (an `Agent(` call, a triad agent type, `persona_run` or a spawning tool). |

### Tests

- Tests import `describe`, `test` and `expect` from `claude-code/testing`. They run without file system, network or process access, and may import only relative `.ts` files and `claude-code`.
- Use `memIo` and `fakeAgents` from `triad/testkit.ts` for an in-memory project and scripted agents.
- The `parity-*.test.ts` suites port Legion's tests. Legion's fixtures are in `triad/tests/fixtures/`. Tests cannot read files, so `triad/tests/fixtures/index.ts` bundles them; after you change a fixture, run `bun triad/scripts/bundle-fixtures.ts`. release-check fails while the bundle is stale.
- When a Legion expectation does not hold, keep the test for the cases that do, and list the exception with its reason next to it. Do not weaken a scorer or a rule to make a case pass.
- The release checks are pure functions in `triad/scripts/checks.ts`, so tests call them directly. The two scripts only read the files and call them.

## Deterministic work goes in code

If a step has one right answer (parsing, counting, validating, ordering waves, writing a file from a template, computing a verdict from findings), write it in TypeScript under `triad/hooks/`, behind a tool or a hook. Leave it out of a command's prose for the model to follow. Commands and briefs keep only what needs judgment. A rule the model must obey goes in a hook that enforces it, not just in a prompt that asks for it.

## PARITY.md

`PARITY.md` lists every Legion command, skill, persona, hook, config key, schema, test, script, adapter and convention, each with a status. When a change ports, improves, replaces or drops one of them, update its row and the summary counts in the same pull request. A pull request that changes parity without updating `PARITY.md` is not ready.

## Legion

The Legion checkout is reference data. Read its files; never run its scripts, installers or tests. `triad/scripts/gen_legion.ts` reads it as plain files to regenerate the embedded personas and data.

## Commits

- Subject line: `triad: <what changed>`, in the imperative or as a short noun phrase. Keep it under about 72 characters.
- A body, when needed, says what changed and why, wrapped at about 72 columns.
- Name models only by tier (opus, sonnet, haiku) in code comments, commit messages and docs.
- One concern per commit. Keep generated files (`personas.ts`, `data.ts`, the fixture bundle) in the same commit as their source change.
- Never commit secrets. The tests and CI need no API key.
