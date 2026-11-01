# toolkit.jsonpatch

JSON Pointer (RFC 6901) and JSON Patch (RFC 6902) over Python values decoded from JSON: `dict`, `list`, `str`, `int`, `float`, `bool` and `None`.

## Errors

`class PatchError(ValueError)`: raised for every failure below. Nothing else is raised for bad input.

## Pointers

`resolve(doc, pointer)` returns the value the pointer refers to.

- `""` is the whole document. Otherwise the pointer starts with `/` and is a list of reference tokens separated by `/`; in each token `~1` stands for `/` and `~0` for `~` (decode `~1` first, so `~01` is `~1`). A `~` followed by anything else is an error, as is a pointer that does not start with `/`.
- On a dict, a token is a key (any string, including `""`). On a list, a token must be `0` or a decimal number without leading zeros, less than the list's length. `-` or anything else on a list is an error for `resolve`.
- A token on a scalar, or a missing key or index, is an error.

## Patches

`apply_patch(doc, patch)` returns the patched document. It never changes `doc` or any value inside it, and when it raises, nothing has been changed either (it works on a deep copy). `patch` is a list of operations, each a dict with an `op` and a `path` (a pointer) and the members below; other members are ignored. Operations are applied in order, each to the result of the previous one.

- `add` with `value`: the path's parent must exist. On a dict, sets the key (replacing any value). On a list, the last token is an index from 0 to the length inclusive, or `-` for the end; the value is inserted there. Path `""` replaces the whole document.
- `remove`: the target must exist; removes it (a list element shifts the rest down). Removing `""` is an error.
- `replace` with `value`: the target must exist; replaces it. Path `""` replaces the whole document.
- `move` with `from`: the `from` target must exist; it is removed and then added at `path` as `add` would. Moving a location into one of its own children (`from` `/a`, `path` `/a/b`) is an error. Moving to the same path is a no-op.
- `copy` with `from`: adds a deep copy of the `from` value at `path` as `add` would.
- `test` with `value`: the target must exist and be equal to `value`, else error. Equality is JSON equality: dicts by keys and values regardless of order, lists element by element, numbers by value (`1` equals `1.0`), and a `bool` is never equal to a number (`true` does not equal `1`).

An operation that is not a dict, an unknown `op`, a missing member (`path`, `value`, `from`) or a member of the wrong type (`path` and `from` must be strings) is an error.

`make_pointer(tokens) -> str` builds a pointer from a list of string tokens, escaping `~` and `/` (`make_pointer([]) == ""`, `make_pointer(["a/b", "~"]) == "/a~1b/~0"`).
