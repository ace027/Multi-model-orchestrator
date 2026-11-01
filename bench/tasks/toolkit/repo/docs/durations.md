# toolkit.durations

Parsing and formatting durations as a whole number of seconds.

Units: a week is 7 days, a day 24 hours, an hour 60 minutes, a minute 60 seconds.

## Parsing

`parse_duration(s) -> int` accepts the forms below, with optional surrounding whitespace, and raises `ValueError` for anything else (including an empty string and negative values). Every number is a decimal integer (digits only, leading zeros allowed).

- **Plain seconds:** `90`.
- **Compact:** one or more parts `<number><unit>` with units `w`, `d`, `h`, `m`, `s` (case-insensitive), each unit at most once and in that order (weeks first), with optional whitespace between parts: `1h30m`, `2d 4h`, `1w2d3h4m5s`, `0s`, `90m`. `1m1h` (wrong order), `1h1h` (twice) and `1.5h` are invalid.
- **ISO 8601 (no years or months):** `P` (case-insensitive, as are all the designators) followed by either `nW` alone, or `[nD]` and then optionally `T` with at least one of `nH`, `nM`, `nS` in that order. At least one part must be present: `P1W`, `P2D`, `PT1H30M`, `P1DT12H`, `PT0S`. `P`, `PT`, `P1DT`, `P1W2D`, `PT1.5S`, `P1M` (months) and `P1Y` are invalid.
- **Clock:** `M:SS` or `H:MM:SS`. The first field is any number of digits; every later field is exactly two digits and below 60: `1:30` is 90, `2:00:05` is 7205, `100:00:00` is 360000. `1:60`, `1:5` and `1:2:3:4` are invalid.

## Formatting

`format_duration(seconds, style="compact") -> str`. `seconds` must be an `int` (not a `bool`) of at least 0, else `ValueError`; an unknown style is a `ValueError` too.

- `compact`: the non-zero parts with units `w`, `d`, `h`, `m`, `s`, largest first, no spaces: `5400` is `1h30m`, `694861` is `1w1d1h1m1s`, `0` is `0s`.
- `iso`: `P`, then days as `nD` (no weeks), then `T` and the non-zero hours, minutes and seconds as `nH`, `nM`, `nS` if any are non-zero: `5400` is `PT1H30M`, `90000` is `P1DT1H`, `86400` is `P1D`, `0` is `PT0S`, `1209600` is `P14D`.
- `clock`: `H:MM:SS` with hours not wrapped at 24 and not padded: `5` is `0:00:05`, `90061` is `25:01:01`.
- `words`: the non-zero parts as `<n> <unit>` with units `week`, `day`, `hour`, `minute`, `second`, plural (adding `s`) unless n is 1, largest first. Two parts are joined with ` and `; more with `, ` except the last two, joined with ` and `: `5400` is `1 hour and 30 minutes`, `183661` is `2 days, 3 hours, 1 minute and 1 second`, `1` is `1 second`, `0` is `0 seconds`.

Parsing what `format_duration` produces gives back the same number for the `compact`, `iso` and `clock` styles.
