# toolkit.ini

An INI dialect with sections, continuation lines, quoted values and interpolation.

## API

- `parse(text) -> Config`. Raises `ParseError` for bad syntax.
- `class ParseError(ValueError)` with an attribute `line`: the 1-based line number of the offending line (for an interpolation error, see below).
- `Config.sections() -> list[str]`: section names in order of first appearance. The section `""` (keys before any header) is listed first if it has any keys, otherwise not at all.
- `Config.keys(section) -> list[str]`: the section's keys in order of appearance. `KeyError` if there is no such section.
- `Config.get(section, key, default=<none>) -> str`: the value after interpolation. A missing section or key returns `default` if one was given, else raises `KeyError`. Keys are case-insensitive here (they are stored lowercased); section names are case-sensitive.
- `Config.getint(section, key, default=<none>) -> int`: the value as a decimal integer (optional sign, surrounding whitespace allowed); `ValueError` if it is not one. A given default is returned as is for a missing key.
- `Config.getbool(...)`: `true`, `yes`, `on`, `1` are `True`; `false`, `no`, `off`, `0` are `False` (case-insensitive); anything else is `ValueError`.
- `Config.getlist(...) -> list[str]`: the value split on commas, each item stripped, empty items dropped (`"a, b,,c "` is `["a", "b", "c"]`; `""` is `[]`).

## Syntax

Lines are separated by `\n` (a `\r` before it is ignored). Each line is one of:

- **Blank** (only whitespace): ignored, and it ends any continuation.
- **Comment**: the first non-whitespace character is `;` or `#`. Ignored; it does not end a continuation (the continuation goes on after it). Comments are only whole lines: `a = 1 ; x` has the value `1 ; x`.
- **Section header**: `[name]`, with optional whitespace around and inside the brackets (the name is stripped). An empty name, or anything after the `]`, is an error. A section that appears twice is one section; keys from both parts are merged in order.
- **Continuation**: a line that starts with whitespace and follows a key line, its continuations, or comments between them. Its stripped text is appended to the value with a `\n` before it. A line starting with whitespace with no key to continue (at the start of the file, or after a header or a blank line) is an error.
- **Key line**: `key = value` or `key: value`, split at the first `=` or `:`, whichever comes first. The key is stripped and lowercased and must not be empty. The value is stripped. Keys before the first header go into the section `""`. A key that appears twice in the same section is an error, on the second line.
- Anything else (a line without `=` or `:`) is an error.

**Quoted values:** after continuations are joined, a value that starts and ends with `"` and is at least 2 characters long is unquoted: the outer quotes are removed and `\"`, `\\`, `\n` and `\t` are replaced by a quote, a backslash, a newline and a tab. Any other backslash sequence is an error (on the key's line). Whitespace inside the quotes is kept. Unquoted values are taken literally.

## Interpolation

Interpolation happens in `get` (and so in `getint` and the others), on the stored value:

- `${key}` is replaced by the interpolated value of `key` in the same section; `${section:key}` by the interpolated value of `key` in `section` (split at the first `:`). The key part is matched case-insensitively. The section part may be empty: `${:key}` is the section `""`.
- `$$` is a literal `$`. A `$` followed by anything other than `$` or `{`, or a `${` with no closing `}`, is left as it is.
- A reference to a missing key or section, or a cycle (`a = ${b}`, `b = ${a}`), raises `ParseError` with `line` set to the line of the key whose value is being read with `get`.
- Interpolated text is not interpolated again: the replacement text of `${x}` is `x`'s fully interpolated value, inserted as is.
