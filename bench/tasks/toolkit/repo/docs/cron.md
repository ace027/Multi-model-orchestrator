# toolkit.cron

Standard five-field cron expressions and the times they fire. Times are naive `datetime` objects (no time zone, no daylight saving).

## API

- `next_run(expr, after) -> datetime`: the first time the expression fires that is strictly later than `after`. Fire times are whole minutes (seconds and microseconds 0). If `after` is 10:15:30, a `* * * * *` expression next fires at 10:16:00; if it is 10:15:00, also 10:16:00.
- `next_runs(expr, after, n) -> list[datetime]`: the next `n` fire times in order, each strictly later than the one before.
- `valid(expr) -> bool`.

Both `next_*` functions raise `ValueError` for an invalid expression, and `next_run` raises `ValueError` if the expression never fires in the 8 years after `after` (for example `0 0 30 2 *`).

## Expressions

An expression is five fields separated by one or more spaces or tabs, with optional leading and trailing whitespace:

| Field | Values | Names |
|---|---|---|
| minute | 0-59 | |
| hour | 0-23 | |
| day of month | 1-31 | |
| month | 1-12 | `JAN`-`DEC` |
| day of week | 0-7 (0 and 7 are both Sunday) | `SUN`-`SAT` |

Names are case-insensitive and may be used wherever a number may, including in ranges (`MON-FRI`). Each field is a comma-separated list of items; an item is one of:

- `*`: every value of the field.
- `N`: one value.
- `A-B`: every value from A to B inclusive. A must not be greater than B (`5-1` is invalid; `SAT-SUN` is invalid, because SUN is 0 there; use `SAT,SUN` or `6-7`).
- `*/S`, `A-B/S`: every S-th value starting at the start of the range (`*/15` on minutes is 0, 15, 30, 45; `1-10/4` is 1, 5, 9).
- `N/S`: from N to the end of the field's range, every S-th (`5/20` on minutes is 5, 25, 45).

S is a whole number of at least 1. Values out of the field's range, empty items, and anything else are invalid. A field that is valid but empty cannot happen; every item yields at least one value.

The expression may instead be one of these names (case-insensitive), alone:

| Name | Same as |
|---|---|
| `@yearly`, `@annually` | `0 0 1 1 *` |
| `@monthly` | `0 0 1 * *` |
| `@weekly` | `0 0 * * 0` |
| `@daily`, `@midnight` | `0 0 * * *` |
| `@hourly` | `0 * * * *` |

## Matching

A time fires when its minute, hour and month are in their fields and its day matches:

- If the day-of-month field or the day-of-week field starts with `*` (that is `*` or `*/S`), the day matches when it is in **both** fields.
- Otherwise (both are restricted), the day matches when it is in **either** field. So `0 0 13 * FRI` fires on every 13th and on every Friday.

A day of month that a month does not have (the 31st of April) simply never matches.
