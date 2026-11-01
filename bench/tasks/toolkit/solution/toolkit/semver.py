"""Semantic Versioning 2.0.0 versions and npm-style ranges (docs/semver.md)."""
import re

_NUM = r"(?:0|[1-9]\d*)"
_PRE_ID = r"(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)"
_BUILD_ID = r"[0-9A-Za-z-]+"
_VERSION = re.compile(rf"({_NUM})\.({_NUM})\.({_NUM})(?:-({_PRE_ID}(?:\.{_PRE_ID})*))?(?:\+({_BUILD_ID}(?:\.{_BUILD_ID})*))?")
_WILD = r"(?:0|[1-9]\d*|[xX*])"
_PARTIAL = re.compile(rf"({_WILD})(?:\.({_WILD})(?:\.({_WILD}))?)?")


def _parse(s):
    m = _VERSION.fullmatch(s) if isinstance(s, str) else None
    if not m:
        raise ValueError(f"not a version: {s!r}")
    pre = tuple(int(p) if p.isdigit() else p for p in m[4].split(".")) if m[4] else ()
    return (int(m[1]), int(m[2]), int(m[3])), pre


def valid(s):
    try:
        _parse(s)
        return True
    except ValueError:
        return False


def _cmp_pre(a, b):
    if a == b:
        return 0
    if not a:
        return 1
    if not b:
        return -1
    for x, y in zip(a, b):
        if x == y:
            continue
        if isinstance(x, int) != isinstance(y, int):
            return -1 if isinstance(x, int) else 1
        return -1 if x < y else 1
    return -1 if len(a) < len(b) else 1


def _cmp(a, b):
    if a[0] != b[0]:
        return -1 if a[0] < b[0] else 1
    return _cmp_pre(a[1], b[1])


def compare(a, b):
    return _cmp(_parse(a), _parse(b))


# A comparator is (op, version) with op in ">=", ">", "<=", "<", "=", or ("none",) / ("any",).
def _partial(s):
    """Full version -> ('full', parsed); partial -> ('partial', [major, minor, patch] with None for missing)."""
    if _VERSION.fullmatch(s):
        return "full", _parse(s)
    m = _PARTIAL.fullmatch(s)
    if not m:
        raise ValueError(f"bad version in range: {s!r}")
    parts, wild = [], False
    for p in m.groups():
        wild = wild or p is None or p in "xX*"
        parts.append(None if wild else int(p))
    return "partial", parts


def _v(major, minor=0, patch=0):
    return (major, minor, patch), ()


def _bump(parts, n):
    """The lowest version above every version that starts with parts[:n]."""
    p = [x or 0 for x in parts[:n]] + [0] * (3 - n)
    p[n - 1] += 1
    return _v(*p)


def _given(parts):
    return sum(1 for x in parts if x is not None)


def _expand(op, s):
    kind, v = _partial(s)
    if kind == "full":
        if op == "^":
            (ma, mi, pa), _ = v
            hi = _v(ma + 1) if ma else _v(0, mi + 1) if mi else _v(0, 0, pa + 1)
            return [(">=", v), ("<", hi)]
        if op == "~":
            return [(">=", v), ("<", _v(v[0][0], v[0][1] + 1))]
        return [(op or "=", v)]
    n = _given(v)
    lo = _v(*[x or 0 for x in v])
    if op in ("", "="):
        return [(">=", lo)] + ([("<", _bump(v, n))] if n else [])
    if op == "^":
        if n == 0:
            return [(">=", lo)]
        first = next((i for i in range(n) if v[i]), n - 1)
        return [(">=", lo), ("<", _bump(v, first + 1))]
    if op == "~":
        if n == 0:
            return [(">=", lo)]
        return [(">=", lo), ("<", _bump(v, min(n, 2)))]
    if n == 0:
        return [("any",)] if op in (">=", "<=") else [("none",)]
    if op == ">=":
        return [(">=", lo)]
    if op == ">":
        return [(">=", _bump(v, n))]
    if op == "<":
        return [("<", lo)]
    return [("<", _bump(v, n))]  # <=


_OPS = (">=", "<=", ">", "<", "=", "^", "~")


def _parse_set(text):
    toks = text.split()
    if not toks:
        raise ValueError("empty comparator set")
    if len(toks) == 3 and toks[1] == "-":
        a, b = toks[0], toks[2]
        ka, va = _partial(a)
        kb, vb = _partial(b)
        lo = va if ka == "full" else _v(*[x or 0 for x in va])
        out = [(">=", lo)]
        if kb == "full":
            out.append(("<=", vb))
        elif _given(vb):
            out.append(("<", _bump(vb, _given(vb))))
        return out
    comps, i = [], 0
    while i < len(toks):
        t = toks[i]
        op = next((o for o in _OPS if t.startswith(o)), "")
        rest = t[len(op):]
        if op and not rest:
            i += 1
            if i >= len(toks):
                raise ValueError(f"operator without a version: {t!r}")
            rest = toks[i]
        if rest.startswith(_OPS) or rest == "-":
            raise ValueError(f"bad comparator: {t!r}")
        comps += _expand(op, rest)
        i += 1
    return comps


def _parse_range(r):
    if not isinstance(r, str):
        raise ValueError("range must be a string")
    return [_parse_set(s) for s in r.split("||")]


def _test(c, v):
    if c[0] == "any":
        return True
    if c[0] == "none":
        return False
    d = _cmp(v, c[1])
    return {"=": d == 0, ">=": d >= 0, ">": d > 0, "<=": d <= 0, "<": d < 0}[c[0]]


def _sat(v, sets):
    for comps in sets:
        if not all(_test(c, v) for c in comps):
            continue
        if v[1] and not any(len(c) == 2 and c[1][1] and c[1][0] == v[0] for c in comps):
            continue
        return True
    return False


def satisfies(version, range):
    v = _parse(version)
    return _sat(v, _parse_range(range))


def max_satisfying(versions, range):
    sets = _parse_range(range)
    best = None
    for s in versions:
        if not valid(s):
            continue
        v = _parse(s)
        if _sat(v, sets) and (best is None or _cmp(v, best[1]) > 0):
            best = (s, v)
    return best and best[0]
