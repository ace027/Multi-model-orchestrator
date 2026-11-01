"""Parsing and formatting durations in seconds (docs/durations.md)."""
import re

_UNITS = [("w", 604800), ("d", 86400), ("h", 3600), ("m", 60), ("s", 1)]
_COMPACT = re.compile(r"\s*".join(rf"(?:(\d+){u})?" for u, _ in _UNITS), re.I)
_ISO = re.compile(r"P(?:(\d+)W|(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)", re.I)
_CLOCK = re.compile(r"(\d+)(?::([0-5]\d))?:([0-5]\d)")


def parse_duration(s):
    if not isinstance(s, str):
        raise ValueError("duration must be a string")
    t = s.strip()
    if re.fullmatch(r"\d+", t):
        return int(t)
    m = _COMPACT.fullmatch(t)
    if t and m and any(m.groups()):
        return sum(int(g) * n for g, (_, n) in zip(m.groups(), _UNITS) if g)
    m = _ISO.fullmatch(t)
    if m and any(m.groups()):
        w, d, h, mi, se = (int(g) if g else 0 for g in m.groups())
        return w * 604800 + d * 86400 + h * 3600 + mi * 60 + se
    m = _CLOCK.fullmatch(t)
    if m:
        a, b, c = m.groups()
        return int(a) * 3600 + int(b) * 60 + int(c) if b else int(a) * 60 + int(c)
    raise ValueError(f"not a duration: {s!r}")


def _split(seconds, units):
    out = []
    for name, n in units:
        q, seconds = divmod(seconds, n)
        out.append((name, q))
    return out


def format_duration(seconds, style="compact"):
    if type(seconds) is not int or seconds < 0:
        raise ValueError("seconds must be a non-negative int")
    if style == "compact":
        parts = [f"{q}{u}" for u, q in _split(seconds, _UNITS) if q]
        return "".join(parts) or "0s"
    if style == "iso":
        (_, d), (_, h), (_, m), (_, s) = _split(seconds, _UNITS[1:])
        time = "".join(f"{q}{u}" for u, q in (("H", h), ("M", m), ("S", s)) if q)
        if not d and not time:
            return "PT0S"
        return "P" + (f"{d}D" if d else "") + (f"T{time}" if time else "")
    if style == "clock":
        h, rest = divmod(seconds, 3600)
        return f"{h}:{rest // 60:02d}:{rest % 60:02d}"
    if style == "words":
        names = ["week", "day", "hour", "minute", "second"]
        parts = [f"{q} {n}{'' if q == 1 else 's'}" for n, (_, q) in zip(names, _split(seconds, _UNITS)) if q]
        if not parts:
            return "0 seconds"
        return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
    raise ValueError(f"unknown style {style!r}")
