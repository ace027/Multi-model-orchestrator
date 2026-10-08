# Control modes

A control mode sets how much freedom the agents in a Triad build, review or plan have. Set it with `control_mode` in `settings.json` at the project root. There are four modes: `guarded` (the default), `surgical`, `advisory` and `autonomous`. An unknown value is reported by `/triad validate` and treated as `guarded`.

## The five flags

Each mode is a profile of five flags, the same flags Legion used:

| Flag | What it controls |
|---|---|
| `authority_enforcement` | Domain ownership from the authority matrix: constraints go into agent briefs, and an out-of-scope write is checked. |
| `domain_filtering` | Review findings outside a reviewer's domain are filtered when another persona owns that domain. |
| `human_approval_required` | Confirmation gates: the run stops and asks before steps that need a person. |
| `file_scope_restriction` | Writes outside a plan's `files_modified` are denied, not only reported. |
| `read_only` | Plan agents may not write; they return suggestions. |

| Mode | authority_enforcement | domain_filtering | human_approval_required | file_scope_restriction | read_only |
|---|:-:|:-:|:-:|:-:|:-:|
| guarded | on | on | on | off | off |
| surgical | on | on | on | on | off |
| advisory | off | off | off | off | on |
| autonomous | off | off | off | off | off |

The profiles live in `.planning/config/control-modes.yaml` when a project has one, and in Triad's built-in defaults otherwise. A partial profile in that file is merged over the `guarded` defaults, so a profile that names only `file_scope_restriction: true` keeps guarded's other four flags.

## What each mode does

### guarded (default)

- A write outside the plan's scope is allowed but produces a warning, recorded in the plan summary.
- Authority constraints from the authority matrix are injected into each agent's brief, so an agent knows which domains other personas own.
- Review findings are filtered by domain owner: a finding in a domain that another persona owns goes to that owner's review, not to every reviewer.
- Confirmation gates are on: steps that need a person stop and ask.

### surgical

Everything in guarded, plus `file_scope_restriction`: a write outside the plan's `files_modified` is denied. The agent gets the denial as a tool error and must stay in scope, or return `status: blocked` naming the file it needs.

### advisory

- `read_only` is on: plan agents' writes are denied.
- Agents return suggestions only; nothing they propose is applied.
- Auto-commit is off for the run, whatever `execution.auto_commit` says.
- Findings are shown unfiltered.

### autonomous

- Confirmation gates are skipped.
- Authority checks become warnings: a breach is logged, never blocked.
- Autonomous mode never approves tool calls and never loosens permissions. Claude Code's own permission settings and Triad's hooks (tier models, helper write scope, concurrency caps) apply exactly as in any other mode.

## Decision log

Each authority decision (an allowed, warned or denied write, a filtered finding, a skipped gate) is appended to `.planning/logs/authority-decisions-{date}.log`, one line per decision, with the date in `YYYY-MM-DD` form. The log is the record of what a mode let through; read it after an autonomous run.

## Directory mappings

`.planning/config/directory-mappings.yaml` (written by `/triad:map`) says where each kind of file belongs. Its enforcement follows its own strictness setting, independent of the control mode:

| strictness | A deliverable path outside its category's directories |
|---|---|
| `strict` | is a violation and the spec check asks for rework |
| `warn` (default) | is reported with a suggested path |
| `off` | is not checked |

A deliverable can carry an explicit path override, which is accepted and noted.
