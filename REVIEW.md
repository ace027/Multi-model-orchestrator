# Reviewing a Triad change

Check each item below. A "no" blocks the merge unless the pull request explains it.

## Checks pass

- CI is green: plugin validate, plugin test, release-check and spawn-truthfulness.
- New behavior has a test. A bug fix has a test that fails without the fix.

## Behavior

- Deterministic work (parsing, validation, counting, ordering, verdicts) is in code under `triad/hooks/`, not in command prose for the model to carry out.
- A rule agents must follow is enforced by a hook or a tool's checks, not only stated in a prompt.
- Tier routing is intact: coders run on sonnet, helpers on haiku, only the orchestrator spawns agents, and nothing loosens the caps, the helper write scope or permissions. That includes autonomous mode, which never approves tool calls.
- Control modes behave as `docs/control-modes.md` says. The authority decision log is written where a decision is made.
- Agent replies that hand work back are not accepted as done; the reply must finish the work, or return `blocked` or `partial` with what is left.
- Errors are reported, not swallowed: a failed check stops the step or appears in its output.

## Tests

- Tests use `memIo` and `fakeAgents`, and need no fs, network, process or API key.
- A ported Legion test asserts the cases that hold for Triad and lists each exception with a reason. No scoring weight, regex or threshold was loosened just to make a case pass.
- After a fixture change, `bun triad/scripts/bundle-fixtures.ts` has been run, so the bundle matches.

## Commands and prompts

- Every command has a description, and an `argument-hint` if it takes `$ARGUMENTS`. Command files stay within the byte budgets in `triad/scripts/checks.ts`. If a budget was raised, the PR says why.
- Every `mcp__triad__*` tool and `/triad:*` command named in a command exists.
- A command that says it spawns agents names how it spawns them.
- The orchestrator guide stays byte-stable unless the change is about it, since it is cached.

## Docs and parity

- `PARITY.md` rows and counts match the change.
- If user-facing behavior changed, `triad/README.md` is updated, including the version on a release.
- Comments, commit messages and docs name models only by tier.
- Nothing was written to or run from the Legion checkout.
