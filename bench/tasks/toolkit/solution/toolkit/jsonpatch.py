"""JSON Pointer (RFC 6901) and JSON Patch (RFC 6902) (docs/jsonpatch.md)."""
import copy
import re


class PatchError(ValueError):
    pass


_INDEX = re.compile(r"0|[1-9]\d*")


def _tokens(pointer):
    if not isinstance(pointer, str):
        raise PatchError("pointer must be a string")
    if pointer == "":
        return []
    if not pointer.startswith("/"):
        raise PatchError(f"pointer must start with '/': {pointer!r}")
    out = []
    for t in pointer[1:].split("/"):
        if re.search(r"~(?![01])", t):
            raise PatchError(f"bad escape in {pointer!r}")
        out.append(t.replace("~1", "/").replace("~0", "~"))
    return out


def make_pointer(tokens):
    return "".join("/" + t.replace("~", "~0").replace("/", "~1") for t in tokens)


def _child(node, tok, *, end_ok=False):
    if isinstance(node, dict):
        if tok not in node:
            raise PatchError(f"no key {tok!r}")
        return node[tok]
    if isinstance(node, list):
        if not _INDEX.fullmatch(tok) or int(tok) >= len(node):
            raise PatchError(f"bad index {tok!r}")
        return node[int(tok)]
    raise PatchError(f"cannot index a {type(node).__name__} with {tok!r}")


def _walk(doc, toks):
    for t in toks:
        doc = _child(doc, t)
    return doc


def resolve(doc, pointer):
    return _walk(doc, _tokens(pointer))


def _add(doc, toks, value):
    if not toks:
        return value
    parent, last = _walk(doc, toks[:-1]), toks[-1]
    if isinstance(parent, dict):
        parent[last] = value
    elif isinstance(parent, list):
        if last == "-":
            parent.append(value)
        elif _INDEX.fullmatch(last) and int(last) <= len(parent):
            parent.insert(int(last), value)
        else:
            raise PatchError(f"bad index {last!r}")
    else:
        raise PatchError("parent is not a container")
    return doc


def _remove(doc, toks):
    if not toks:
        raise PatchError("cannot remove the whole document")
    parent, last = _walk(doc, toks[:-1]), toks[-1]
    value = _child(parent, last)
    if isinstance(parent, dict):
        del parent[last]
    else:
        del parent[int(last)]
    return value


def _equal(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_equal(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def _member(op, name):
    if name not in op:
        raise PatchError(f"operation is missing {name!r}")
    v = op[name]
    if name in ("path", "from") and not isinstance(v, str):
        raise PatchError(f"{name!r} must be a string")
    return v


def apply_patch(doc, patch):
    if not isinstance(patch, list):
        raise PatchError("patch must be a list")
    doc = copy.deepcopy(doc)
    for op in patch:
        if not isinstance(op, dict):
            raise PatchError("operation must be an object")
        kind = op.get("op")
        path = _tokens(_member(op, "path"))
        if kind == "add":
            doc = _add(doc, path, copy.deepcopy(_member(op, "value")))
        elif kind == "remove":
            _remove(doc, path)
        elif kind == "replace":
            value = copy.deepcopy(_member(op, "value"))
            if not path:
                doc = value
            else:
                parent = _walk(doc, path[:-1])
                _child(parent, path[-1])
                parent[path[-1] if isinstance(parent, dict) else int(path[-1])] = value
        elif kind == "move":
            src = _tokens(_member(op, "from"))
            if src == path:
                _walk(doc, src)
                continue
            if path[:len(src)] == src:
                raise PatchError("cannot move a location into its own child")
            value = _remove(doc, src)
            doc = _add(doc, path, value)
        elif kind == "copy":
            src = _tokens(_member(op, "from"))
            doc = _add(doc, path, copy.deepcopy(_walk(doc, src)))
        elif kind == "test":
            value = _member(op, "value")
            if not _equal(_walk(doc, path), value):
                raise PatchError(f"test failed at {op['path']!r}")
        else:
            raise PatchError(f"unknown op {kind!r}")
    return doc
