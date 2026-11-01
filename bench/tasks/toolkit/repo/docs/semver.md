# toolkit.semver

Semantic Versioning 2.0.0 versions and npm-style ranges. All functions take and return strings.

## Versions

A version is `MAJOR.MINOR.PATCH`, optionally followed by `-PRERELEASE` and then `+BUILD`:

- MAJOR, MINOR and PATCH are non-negative integers without leading zeros (`0` is fine, `01` is not).
- PRERELEASE and BUILD are non-empty lists of dot-separated identifiers made of `[0-9A-Za-z-]`, none empty. A prerelease identifier that is all digits is numeric and must not have leading zeros. Build identifiers may have leading zeros.
- No leading `v`, no surrounding whitespace.

`valid(s) -> bool` says whether `s` is a version.

## Precedence

`compare(a, b) -> int` returns -1, 0 or 1. It raises `ValueError` if either is not a version.

1. Compare MAJOR, MINOR, PATCH numerically, in that order.
2. If they are equal, a version without a prerelease is greater than one with a prerelease (`1.0.0-alpha < 1.0.0`).
3. Two prereleases are compared identifier by identifier from the left: numeric identifiers numerically, alphanumeric ones in ASCII order, and a numeric identifier is lower than an alphanumeric one. If all shared identifiers are equal, the one with more identifiers is greater.
4. BUILD is ignored: `compare("1.0.0+a", "1.0.0+b") == 0`.

So `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`.

## Ranges

`satisfies(version, range) -> bool`. It raises `ValueError` if `version` is not a version or `range` is not a valid range.

A range is one or more **sets** separated by `||` (with optional whitespace around it). A version satisfies the range if it satisfies any set. A set is one or more **comparators** separated by whitespace; a version satisfies the set if it satisfies every comparator in it (and the prerelease rule below). An empty range, or an empty set, is invalid.

A **partial version** is `MAJOR`, `MAJOR.MINOR` or a full version, where any of the numeric parts may be `x`, `X` or `*` (and so may every part after it: `1.x.3` is read as `1.x.x`). A bare `*`, `x` or `X` means any version. A partial with a wildcard or missing part cannot carry a prerelease or build.

Comparators, with `v` a partial version:

| Form | Meaning |
|---|---|
| `v` or `=v` | Full `v`: exactly that version (by precedence). Partial: the X-range below. |
| `>=v`, `>v`, `<=v`, `<v` | With a full `v`, the plain comparison. With a partial, see below. |
| `^v` | Caret, below. |
| `~v` | Tilde, below. |
| `a - b` | Hyphen range: `>=a <=b`, with partials expanded as below. Spaces around `-` are required. |

There may be whitespace between an operator and its version (`>= 1.2.3`).

Partials expand as follows (an `x` part counts as missing):

- X-range: `1` = `>=1.0.0 <2.0.0`; `1.2` = `>=1.2.0 <1.3.0`; `*` = `>=0.0.0`.
- `>=1.2` = `>=1.2.0`; `>1.2` = `>=1.3.0` (greater than every 1.2.x); `>1` = `>=2.0.0`.
- `<1.2` = `<1.2.0`; `<=1.2` = `<1.3.0`; `<=1` = `<2.0.0`.
- `>=*` and `<=*` are any version; `>*` and `<*` match nothing.
- Hyphen: a partial lower bound fills zeros (`1.2 - 2.3.4` = `>=1.2.0 <=2.3.4`); a partial upper bound includes everything it covers (`1.2.3 - 2.3` = `>=1.2.3 <2.4.0`, `1.2.3 - 2` = `>=1.2.3 <3.0.0`).

Prereleases of an upper bound such as `2.0.0` in `<2.0.0` are lower than it by precedence; the prerelease rule below is what keeps them out.

Caret `^v` allows changes that do not modify the first non-zero part among the parts given; if every given part is zero, the last given part may not change:

- `^1.2.3` = `>=1.2.3 <2.0.0`; `^0.2.3` = `>=0.2.3 <0.3.0`; `^0.0.3` = `>=0.0.3 <0.0.4`.
- `^1.2` = `>=1.2.0 <2.0.0`; `^0.2` = `>=0.2.0 <0.3.0`; `^0.0` = `>=0.0.0 <0.1.0`; `^1` = `>=1.0.0 <2.0.0`; `^0` = `>=0.0.0 <1.0.0`.
- `^1.2.3-beta.2` = `>=1.2.3-beta.2 <2.0.0`.

Tilde `~v` allows patch-level changes if a minor is given, minor-level changes if not:

- `~1.2.3` = `>=1.2.3 <1.3.0`; `~1.2` = `>=1.2.0 <1.3.0`; `~1` = `>=1.0.0 <2.0.0`; `~0.2.3` = `>=0.2.3 <0.3.0`.

**Prerelease rule:** a version with a prerelease satisfies a set only if, in addition, at least one comparator of that set (after expansion) has a version with a prerelease and the same MAJOR.MINOR.PATCH. So `1.2.3-alpha.7` satisfies `>1.2.3-alpha.3` but `3.4.5-alpha.9` does not, and no prerelease satisfies `^1.0.0` or `*`.

`max_satisfying(versions, range) -> str | None` returns the highest-precedence version in the list that satisfies the range (the first one listed if several are equal), or `None`. Strings in the list that are not versions are skipped.
