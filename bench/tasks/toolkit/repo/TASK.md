Implement the five modules of the `toolkit` package. Each is specified in its own file under `docs/` and is independent of the others:

| Module | Spec |
|---|---|
| `toolkit/semver.py` | `docs/semver.md`: versions, precedence and ranges |
| `toolkit/cron.py` | `docs/cron.md`: cron expressions and the next run time |
| `toolkit/jsonpatch.py` | `docs/jsonpatch.md`: JSON Pointer and JSON Patch |
| `toolkit/ini.py` | `docs/ini.md`: an INI dialect with interpolation |
| `toolkit/durations.py` | `docs/durations.md`: parsing and formatting durations |

Implement each spec exactly, with the standard library only (Python 3.11+). Write unit tests for every module under `tests/` (`unittest`).

Verify with `python3 -m unittest -q`.
