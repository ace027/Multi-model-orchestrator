# Multi-model orchestrator

Triad, a Claude Code plugin that runs development work across three model tiers to spend fewer tokens. Opus orchestrates, Sonnet writes code, and Haiku does menial work. The plugin's hooks enforce the tiers and keep a ledger of tokens and cost per agent. It also carries a port of the Legion workflow (plan, build, review, ship and the rest).

## Quick start

Requires Claude Code 2.1.287 or later.

```
/plugin install triad --marketplace ace027/Multi-model-orchestrator
```

Or run it from a checkout:

```
claude --model opus --plugin-dir ./triad
```

Then work as usual, and run `/triad` (or `/triad pane`) to see the agent tree and what each tier spent.

## Docs

| Doc | Covers |
|---|---|
| [`triad/README.md`](triad/README.md) | Install, use, options, and how the hooks work. |
| [`docs/commands.md`](docs/commands.md) | Every `/triad:*` command and its arguments. |
| [`docs/control-modes.md`](docs/control-modes.md) | How much freedom agents get during a build or review. |
| [`docs/results.md`](docs/results.md) | Measurements from each build phase, and the scripts that reproduce them. |
| [`docs/legion-removal.md`](docs/legion-removal.md) | Uninstalling Legion once Triad replaces it. |
| [`PARITY.md`](PARITY.md) | Every Legion feature and its Triad equivalent. |
| [`SPEC.md`](SPEC.md), [`SPIKE.md`](SPIKE.md) | The design, and the engine behaviour it was checked against. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md), [`REVIEW.md`](REVIEW.md) | Checks, conventions and review rules. |

## Layout

| Path | Holds |
|---|---|
| `triad/` | The plugin: manifest, hooks (`hooks/`), agent types (`agents/`), commands (`commands/`), personas and tests. |
| `bench/` | Live acceptance runs and the benchmark tasks; results in `bench/results/`. |
| `docs/` | User docs. |
| `spike/` | The engine probes behind `SPIKE.md`. |
