"""Five-field cron expressions and their fire times (docs/cron.md)."""
from datetime import datetime, timedelta

_MONTHS = {n: i + 1 for i, n in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
_DAYS = {n: i for i, n in enumerate("SUN MON TUE WED THU FRI SAT".split())}
_FIELDS = [(0, 59, {}), (0, 23, {}), (1, 31, {}), (1, 12, _MONTHS), (0, 7, _DAYS)]
_MACROS = {"@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0",
           "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *"}


def _num(s, lo, hi, names):
    if s.upper() in names:
        return names[s.upper()]
    if not s.isdigit():
        raise ValueError(f"bad value {s!r}")
    n = int(s)
    if not lo <= n <= hi:
        raise ValueError(f"{n} out of range {lo}-{hi}")
    return n


def _field(text, lo, hi, names):
    out = set()
    for item in text.split(","):
        base, slash, step = item.partition("/")
        if slash:
            if not step.isdigit() or int(step) < 1:
                raise ValueError(f"bad step in {item!r}")
            step = int(step)
        else:
            step = 1
        if base == "*":
            a, b = lo, hi
        elif "-" in base:
            sa, _, sb = base.partition("-")
            a, b = _num(sa, lo, hi, names), _num(sb, lo, hi, names)
            if a > b:
                raise ValueError(f"reversed range {item!r}")
        else:
            a = _num(base, lo, hi, names)
            b = hi if slash else a
        out.update(range(a, b + 1, step))
    return out


def _parse(expr):
    if not isinstance(expr, str):
        raise ValueError("expression must be a string")
    e = expr.strip()
    if e.lower() in _MACROS:
        e = _MACROS[e.lower()]
    parts = e.split()
    if len(parts) != 5:
        raise ValueError(f"expected 5 fields, got {len(parts)}")
    sets = [_field(p, *f) for p, f in zip(parts, _FIELDS)]
    if 7 in sets[4]:
        sets[4] = (sets[4] - {7}) | {0}
    star = parts[2].startswith("*") or parts[4].startswith("*")
    return sets, star


def valid(expr):
    try:
        _parse(expr)
        return True
    except ValueError:
        return False


def _day_ok(d, sets, star):
    dom = d.day in sets[2]
    dow = (d.weekday() + 1) % 7 in sets[4]
    return (dom and dow) if star else (dom or dow)


def _next(parsed, after):
    sets, star = parsed
    mins, hours = sorted(sets[0]), sorted(sets[1])
    t = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
    limit = after + timedelta(days=366 * 8 + 2)
    day = t.replace(hour=0, minute=0)
    first = True
    while day <= limit:
        if day.month in sets[3] and _day_ok(day, sets, star):
            for h in hours:
                for m in mins:
                    c = day.replace(hour=h, minute=m)
                    if not first or c >= t:
                        return c
        day += timedelta(days=1)
        first = False
    raise ValueError("the expression never fires")


def next_run(expr, after):
    return _next(_parse(expr), after)


def next_runs(expr, after, n):
    p = _parse(expr)
    out = []
    for _ in range(n):
        after = _next(p, after)
        out.append(after)
    return out
