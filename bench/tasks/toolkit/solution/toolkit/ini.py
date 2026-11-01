"""An INI dialect with continuations, quoting and interpolation (docs/ini.md)."""
import re


class ParseError(ValueError):
    def __init__(self, message, line):
        super().__init__(f"line {line}: {message}")
        self.line = line


_NONE = object()
_ESC = {'"': '"', "\\": "\\", "n": "\n", "t": "\t"}


def _unquote(v, line):
    if len(v) < 2 or v[0] != '"' or v[-1] != '"':
        return v
    out, i, body = [], 0, v[1:-1]
    while i < len(body):
        c = body[i]
        if c == "\\":
            if i + 1 >= len(body) or body[i + 1] not in _ESC:
                raise ParseError("bad escape", line)
            out.append(_ESC[body[i + 1]])
            i += 2
        else:
            out.append(c)
            i += 1
    return "".join(out)


class Config:
    def __init__(self, data):
        self._data = data  # section -> {key: (value, line)}

    def sections(self):
        return [s for s in self._data if s or self._data[s]]

    def keys(self, section):
        return list(self._data[section])

    def _raw(self, section, key):
        return self._data[section][key.lower()]

    def get(self, section, key, default=_NONE):
        try:
            value, line = self._raw(section, key)
        except KeyError:
            if default is _NONE:
                raise
            return default
        return self._interp(section, value, line, {(section, key.lower())})

    def _interp(self, section, value, line, seen):
        out, i = [], 0
        while i < len(value):
            if value.startswith("$$", i):
                out.append("$")
                i += 2
            elif value.startswith("${", i) and (j := value.find("}", i + 2)) != -1:
                ref = value[i + 2:j]
                sec, colon, key = ref.partition(":")
                if not colon:
                    sec, key = section, ref
                key = key.lower()
                if (sec, key) in seen:
                    raise ParseError(f"interpolation cycle at ${{{ref}}}", line)
                try:
                    v, _ = self._data[sec][key]
                except KeyError:
                    raise ParseError(f"missing reference ${{{ref}}}", line) from None
                out.append(self._interp(sec, v, line, seen | {(sec, key)}))
                i = j + 1
            else:
                out.append(value[i])
                i += 1
        return "".join(out)

    def getint(self, section, key, default=_NONE):
        v = self.get(section, key, _NONE if default is _NONE else _MISSING)
        if v is _MISSING:
            return default
        if not re.fullmatch(r"\s*[+-]?\d+\s*", v):
            raise ValueError(f"not an integer: {v!r}")
        return int(v)

    def getbool(self, section, key, default=_NONE):
        v = self.get(section, key, _NONE if default is _NONE else _MISSING)
        if v is _MISSING:
            return default
        s = v.strip().lower()
        if s in ("true", "yes", "on", "1"):
            return True
        if s in ("false", "no", "off", "0"):
            return False
        raise ValueError(f"not a boolean: {v!r}")

    def getlist(self, section, key, default=_NONE):
        v = self.get(section, key, _NONE if default is _NONE else _MISSING)
        if v is _MISSING:
            return default
        return [x.strip() for x in v.split(",") if x.strip()]


_MISSING = object()


def parse(text):
    data = {"": {}}
    section, last = "", None  # last: (section, key) a continuation may extend
    pending = {}  # (section, key) -> list of value pieces, finished at the end
    for n, raw in enumerate(text.split("\n"), 1):
        line = raw[:-1] if raw.endswith("\r") else raw
        s = line.strip()
        if not s:
            last = None
            continue
        if s[0] in ";#":
            continue
        if line[0].isspace():
            if last is None:
                raise ParseError("continuation without a key", n)
            pending[last].append(s)
            continue
        if s.startswith("["):
            if not s.endswith("]"):
                raise ParseError("bad section header", n)
            name = s[1:-1].strip()
            if not name:
                raise ParseError("empty section name", n)
            section, last = name, None
            data.setdefault(section, {})
            continue
        cut = min((i for i in (line.find("="), line.find(":")) if i != -1), default=-1)
        if cut == -1:
            raise ParseError("expected key = value", n)
        key, value = line[:cut].strip().lower(), line[cut + 1:].strip()
        if not key:
            raise ParseError("empty key", n)
        if key in data[section]:
            raise ParseError(f"duplicate key {key!r}", n)
        data[section][key] = (None, n)
        pending[(section, key)] = [value]
        last = (section, key)
    for (sec, key), pieces in pending.items():
        line = data[sec][key][1]
        data[sec][key] = (_unquote("\n".join(pieces), line), line)
    return Config(data)
