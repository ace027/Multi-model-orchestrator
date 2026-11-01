"""Hidden check for the toolkit task: five independent modules, 55 cases from docs/*.md
(11 per module), pass at 80%. Usage: check.py <work dir>. Exit 0 = success."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from grade import check  # noqa: E402

HIDDEN = r'''
import importlib, unittest
from datetime import datetime as D


def mod(name):
    return importlib.import_module("toolkit." + name)


class Semver(unittest.TestCase):
    def setUp(self):
        self.m = mod("semver")

    def test_semver_valid(self):
        good = ["0.0.0", "1.2.3", "1.0.0-alpha.1", "1.0.0-0A.is.legal", "1.0.0+001", "1.0.0-x-y-z.--", "10.20.30-rc.1+build.5"]
        bad = ["1.2", "01.2.3", "1.2.3-01", "v1.2.3", "1.2.3-", "1.2.3+", "1.2.3-a..b", " 1.2.3", "1.2.3.4"]
        self.assertEqual([self.m.valid(v) for v in good + bad], [True] * len(good) + [False] * len(bad))

    def test_semver_precedence_chain(self):
        chain = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.1", "1.1.0", "2.0.0"]
        for a, b in zip(chain, chain[1:]):
            self.assertEqual((self.m.compare(a, b), self.m.compare(b, a)), (-1, 1), (a, b))

    def test_semver_numeric_parts_and_build(self):
        self.assertEqual(self.m.compare("1.10.0", "1.9.0"), 1)
        self.assertEqual(self.m.compare("1.0.0+a", "1.0.0+b"), 0)
        self.assertEqual(self.m.compare("1.0.0-1", "1.0.0-a"), -1)
        with self.assertRaises(ValueError):
            self.m.compare("1.0", "1.0.0")

    def test_semver_caret(self):
        s = self.m.satisfies
        self.assertEqual([s(v, "^1.2.3") for v in ("1.2.3", "1.9.9", "2.0.0", "1.2.2")], [True, True, False, False])
        self.assertEqual([s(v, "^0.2.3") for v in ("0.2.9", "0.3.0")], [True, False])
        self.assertEqual([s(v, "^0.0.3") for v in ("0.0.3", "0.0.4")], [True, False])
        self.assertEqual([s(v, "^0.0") for v in ("0.0.9", "0.1.0")], [True, False])
        self.assertEqual([s(v, "^0") for v in ("0.9.9", "1.0.0")], [True, False])

    def test_semver_tilde(self):
        s = self.m.satisfies
        self.assertEqual([s(v, "~1.2.3") for v in ("1.2.9", "1.3.0")], [True, False])
        self.assertEqual([s(v, "~1.2") for v in ("1.2.0", "1.3.0")], [True, False])
        self.assertEqual([s(v, "~1") for v in ("1.9.0", "2.0.0")], [True, False])

    def test_semver_x_ranges_and_partials(self):
        s = self.m.satisfies
        self.assertEqual([s("1.2.9", r) for r in ("1.2.x", "1.x", "*", "1", "1.3", "1.x.3", "=1.2")], [True, True, True, True, False, True, True])
        self.assertEqual([s("1.3.0", ">1.2"), s("1.2.9", ">1.2"), s("1.2.9", "<=1.2"), s("1.3.0", "<=1.2"), s("1.2.0", "<1.2")], [True, False, True, False, False])

    def test_semver_hyphen(self):
        s = self.m.satisfies
        self.assertEqual([s(v, "1.2.3 - 2.3.4") for v in ("1.2.3", "2.3.4", "2.3.5")], [True, True, False])
        self.assertEqual([s(v, "1.2 - 2.3") for v in ("1.2.0", "2.3.9", "2.4.0")], [True, True, False])

    def test_semver_sets_and_whitespace(self):
        s = self.m.satisfies
        self.assertTrue(s("1.5.0", ">= 1.2.3 < 2.0.0"))
        self.assertTrue(s("3.1.0", "^1.0.0 || >=3.0.0 <3.2.0"))
        self.assertFalse(s("2.5.0", "^1.0.0||>=3.0.0"))

    def test_semver_prerelease_rule(self):
        s = self.m.satisfies
        self.assertEqual([s("1.2.3-alpha.7", ">1.2.3-alpha.3"), s("3.4.5-alpha.9", ">1.2.3-alpha.3"), s("1.0.1-rc.1", "^1.0.0"), s("1.0.0-rc.1", "*"),
                          s("1.2.3-beta.3", "^1.2.3-beta.2"), s("1.2.4-beta.3", "^1.2.3-beta.2"), s("2.0.0-rc.1", "<2.0.0")],
                         [True, False, False, False, True, False, False])

    def test_semver_invalid_ranges(self):
        for r in ("", "  ", "1.2.3 ||", ">=", "~>1.2", "1.2-beta", "a.b.c"):
            with self.assertRaises(ValueError, msg=r):
                self.m.satisfies("1.2.3", r)

    def test_semver_max_satisfying(self):
        vs = ["1.2.3", "1.2.4", "1.3.0", "2.0.0", "not.a.version", "1.2.4+b"]
        self.assertEqual(self.m.max_satisfying(vs, "~1.2"), "1.2.4")
        self.assertEqual(self.m.max_satisfying(vs, "^1.0.0"), "1.3.0")
        self.assertIsNone(self.m.max_satisfying(vs, ">3"))


class Cron(unittest.TestCase):
    def setUp(self):
        self.m = mod("cron")

    def test_cron_every_minute_strictly_after(self):
        n = self.m.next_run
        self.assertEqual(n("* * * * *", D(2026, 3, 1, 10, 15, 30)), D(2026, 3, 1, 10, 16))
        self.assertEqual(n("* * * * *", D(2026, 3, 1, 10, 15)), D(2026, 3, 1, 10, 16))
        self.assertEqual(n("30 9 * * *", D(2026, 3, 1, 9, 30)), D(2026, 3, 2, 9, 30))

    def test_cron_steps_and_ranges(self):
        r = self.m.next_runs("*/15 9-10 * * *", D(2026, 3, 1, 9, 50), 4)
        self.assertEqual(r, [D(2026, 3, 1, 10, 0), D(2026, 3, 1, 10, 15), D(2026, 3, 1, 10, 30), D(2026, 3, 1, 10, 45)])
        self.assertEqual(self.m.next_runs("5/20 0 * * *", D(2026, 3, 1), 3), [D(2026, 3, 1, 0, 5), D(2026, 3, 1, 0, 25), D(2026, 3, 1, 0, 45)])
        self.assertEqual(self.m.next_runs("1-10/4 0 1 * *", D(2026, 3, 1), 3), [D(2026, 3, 1, 0, 1), D(2026, 3, 1, 0, 5), D(2026, 3, 1, 0, 9)])

    def test_cron_lists(self):
        self.assertEqual(self.m.next_runs("0 8,12,18 * * *", D(2026, 3, 1, 12, 0), 3), [D(2026, 3, 1, 18), D(2026, 3, 2, 8), D(2026, 3, 2, 12)])

    def test_cron_names(self):
        self.assertEqual(self.m.next_run("0 9 * * mon-FRI", D(2026, 3, 7)), D(2026, 3, 9, 9))  # Sat -> Mon
        self.assertEqual(self.m.next_run("0 0 1 jun,Dec *", D(2026, 7, 1)), D(2026, 12, 1))

    def test_cron_sunday_is_0_and_7(self):
        a = self.m.next_run("0 0 * * 0", D(2026, 3, 2))
        b = self.m.next_run("0 0 * * 7", D(2026, 3, 2))
        self.assertEqual((a, b), (D(2026, 3, 8), D(2026, 3, 8)))
        self.assertEqual(self.m.next_run("0 0 * * 6-7", D(2026, 3, 2)), D(2026, 3, 7))

    def test_cron_day_or_rule(self):
        r = self.m.next_runs("0 0 13 * FRI", D(2026, 2, 1), 4)
        self.assertEqual(r, [D(2026, 2, 6), D(2026, 2, 13), D(2026, 2, 20), D(2026, 2, 27)])

    def test_cron_day_and_rule_with_star(self):
        # */2 day of month starts with *, so the day must match both fields: odd days that are Mondays.
        self.assertEqual(self.m.next_runs("0 0 */2 * 1", D(2026, 3, 1), 2), [D(2026, 3, 9), D(2026, 3, 23)])

    def test_cron_month_lengths_and_leap_year(self):
        self.assertEqual(self.m.next_run("0 0 31 * *", D(2026, 4, 1)), D(2026, 5, 31))
        self.assertEqual(self.m.next_run("0 12 29 2 *", D(2026, 1, 1)), D(2028, 2, 29, 12))

    def test_cron_macros(self):
        n = self.m.next_run
        self.assertEqual([n(e, D(2026, 3, 4, 10, 30)) for e in ("@yearly", "@MONTHLY", "@weekly", "@daily", "@hourly", "  @midnight ")],
                         [D(2027, 1, 1), D(2026, 4, 1), D(2026, 3, 8), D(2026, 3, 5), D(2026, 3, 4, 11), D(2026, 3, 5)])

    def test_cron_invalid(self):
        bad = ["* * * *", "* * * * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "5-1 * * * *",
               "*/0 * * * *", "1,,2 * * * *", "* * * * SAT-SUN", "@reboot", "a * * * *"]
        self.assertEqual([self.m.valid(e) for e in bad], [False] * len(bad))
        self.assertTrue(self.m.valid(" 0\t0  * * * "))
        with self.assertRaises(ValueError):
            self.m.next_run("60 * * * *", D(2026, 1, 1))

    def test_cron_never_fires(self):
        with self.assertRaises(ValueError):
            self.m.next_run("0 0 30 2 *", D(2026, 1, 1))


class JsonPatch(unittest.TestCase):
    def setUp(self):
        self.m = mod("jsonpatch")
        self.doc = {"foo": ["bar", "baz"], "": 0, "a/b": 1, "c%d": 2, "e^f": 3, "g|h": 4, "i\\j": 5, "k\"l": 6, " ": 7, "m~n": 8}

    def test_jsonpatch_rfc6901_examples(self):
        r = self.m.resolve
        cases = {"": self.doc, "/foo": ["bar", "baz"], "/foo/0": "bar", "/": 0, "/a~1b": 1, "/c%d": 2, "/e^f": 3, "/g|h": 4,
                 "/i\\j": 5, "/k\"l": 6, "/ ": 7, "/m~0n": 8}
        for p, v in cases.items():
            self.assertEqual(r(self.doc, p), v, p)

    def test_jsonpatch_pointer_errors(self):
        for p in ("foo", "/foo/2", "/foo/01", "/foo/-", "/nope", "/foo/0/x", "/m~2n"):
            with self.assertRaises(self.m.PatchError, msg=p):
                self.m.resolve(self.doc, p)
        self.assertEqual(self.m.resolve({"~1": 1, "/": 2}, "/~01"), 1)
        self.assertTrue(issubclass(self.m.PatchError, ValueError))

    def test_jsonpatch_add(self):
        a = self.m.apply_patch
        self.assertEqual(a({"foo": "bar"}, [{"op": "add", "path": "/baz", "value": "qux"}]), {"foo": "bar", "baz": "qux"})
        self.assertEqual(a({"foo": ["bar", "baz"]}, [{"op": "add", "path": "/foo/1", "value": "qux"}]), {"foo": ["bar", "qux", "baz"]})
        self.assertEqual(a([1, 2], [{"op": "add", "path": "/-", "value": 3}, {"op": "add", "path": "/3", "value": 4}]), [1, 2, 3, 4])
        self.assertEqual(a({"a": 1}, [{"op": "add", "path": "", "value": [9]}]), [9])
        for p in ("/x/y", "/5"):
            with self.assertRaises(self.m.PatchError):
                a([1] if p == "/5" else {}, [{"op": "add", "path": p, "value": 1}])

    def test_jsonpatch_remove_and_replace(self):
        a = self.m.apply_patch
        self.assertEqual(a({"foo": ["bar", "qux", "baz"]}, [{"op": "remove", "path": "/foo/1"}]), {"foo": ["bar", "baz"]})
        self.assertEqual(a({"baz": "qux", "foo": "bar"}, [{"op": "replace", "path": "/baz", "value": "boo"}]), {"baz": "boo", "foo": "bar"})
        for op in ({"op": "remove", "path": "/x"}, {"op": "replace", "path": "/x", "value": 1}, {"op": "remove", "path": ""}):
            with self.assertRaises(self.m.PatchError):
                a({"a": 1}, [op])

    def test_jsonpatch_move_and_copy(self):
        a = self.m.apply_patch
        d = {"foo": {"bar": "baz", "waldo": "fred"}, "qux": {"corge": "grault"}}
        self.assertEqual(a(d, [{"op": "move", "from": "/foo/waldo", "path": "/qux/thud"}]),
                         {"foo": {"bar": "baz"}, "qux": {"corge": "grault", "thud": "fred"}})
        self.assertEqual(a({"foo": ["all", "grass", "cows", "eat"]}, [{"op": "move", "from": "/foo/1", "path": "/foo/3"}]), {"foo": ["all", "cows", "eat", "grass"]})
        self.assertEqual(a({"a": {"b": 1}}, [{"op": "move", "from": "/a", "path": "/a"}]), {"a": {"b": 1}})
        with self.assertRaises(self.m.PatchError):
            a({"a": {"b": 1}}, [{"op": "move", "from": "/a", "path": "/a/c"}])
        out = a({"a": [1]}, [{"op": "copy", "from": "/a", "path": "/b"}, {"op": "add", "path": "/b/-", "value": 2}])
        self.assertEqual(out, {"a": [1], "b": [1, 2]})

    def test_jsonpatch_test_equality(self):
        a = self.m.apply_patch
        d = {"baz": "qux", "foo": ["a", 2, "c"], "n": 1, "o": {"x": [1, {"y": None}]}}
        self.assertEqual(a(d, [{"op": "test", "path": "/baz", "value": "qux"}, {"op": "test", "path": "/foo/1", "value": 2},
                               {"op": "test", "path": "/n", "value": 1.0}, {"op": "test", "path": "/o", "value": {"x": [1, {"y": None}]}}]), d)
        for v in ("bar", True, [1, {"y": None}]):
            with self.assertRaises(self.m.PatchError):
                a(d, [{"op": "test", "path": "/n" if v is True else "/baz" if v == "bar" else "/o", "value": v}])
        with self.assertRaises(self.m.PatchError):
            a({"t": True}, [{"op": "test", "path": "/t", "value": 1}])

    def test_jsonpatch_does_not_mutate(self):
        d = {"a": [1, 2], "b": {"c": 3}}
        snapshot = repr(d)
        out = self.m.apply_patch(d, [{"op": "add", "path": "/a/-", "value": 9}, {"op": "remove", "path": "/b/c"}])
        self.assertEqual((repr(d), out), (snapshot, {"a": [1, 2, 9], "b": {}}))
        v = {"deep": [1]}
        out = self.m.apply_patch({}, [{"op": "add", "path": "/v", "value": v}])
        out["v"]["deep"].append(2)
        self.assertEqual(v, {"deep": [1]})

    def test_jsonpatch_atomic(self):
        d = {"a": 1}
        with self.assertRaises(self.m.PatchError):
            self.m.apply_patch(d, [{"op": "add", "path": "/b", "value": 2}, {"op": "remove", "path": "/zz"}])
        self.assertEqual(d, {"a": 1})

    def test_jsonpatch_malformed_operations(self):
        for op in ({"op": "add", "path": "/a"}, {"path": "/a", "value": 1}, {"op": "frob", "path": "/a"}, {"op": "move", "path": "/a"},
                   {"op": "add", "path": 5, "value": 1}, "add", {"op": "copy", "path": "/b", "from": 3}):
            with self.assertRaises(self.m.PatchError, msg=repr(op)):
                self.m.apply_patch({"a": 1}, [op])

    def test_jsonpatch_extra_members_ignored(self):
        self.assertEqual(self.m.apply_patch({}, [{"op": "add", "path": "/a", "value": 1, "comment": "x", "from": "/q"}]), {"a": 1})

    def test_jsonpatch_make_pointer(self):
        mp = self.m.make_pointer
        self.assertEqual((mp([]), mp(["a/b", "~"]), mp(["", "0"])), ("", "/a~1b/~0", "//0"))
        doc = {"x/y": {"~": [5]}}
        self.assertEqual(self.m.resolve(doc, mp(["x/y", "~", "0"])), 5)


INI = """; settings
top = level
[server]
Host = example.com
port: 8080
path = /a=b:c
debug = ON
tags = a, b,,c
motd = first
  second
  # a comment in between
  third

[client]
url = http://${server:host}:${server:port}/
again = ${url}x
price = $$5 and $x and ${unclosed
quoted = "  a \\"b\\" \\\\ \\n end  "
empty =
[server]
extra = yes
"""


class Ini(unittest.TestCase):
    def setUp(self):
        self.m = mod("ini")
        self.c = self.m.parse(INI)

    def test_ini_sections_and_keys(self):
        self.assertEqual(self.c.sections(), ["", "server", "client"])
        self.assertEqual(self.c.keys("server"), ["host", "port", "path", "debug", "tags", "motd", "extra"])
        self.assertEqual(self.m.parse("[a]\nx=1\n").sections(), ["a"])
        with self.assertRaises(KeyError):
            self.c.keys("nope")

    def test_ini_get(self):
        g = self.c.get
        self.assertEqual((g("", "top"), g("server", "HOST"), g("server", "port"), g("server", "path"), g("client", "empty")),
                         ("level", "example.com", "8080", "/a=b:c", ""))
        self.assertEqual(g("server", "nope", None), None)
        self.assertEqual(g("Server", "host", "d"), "d")
        with self.assertRaises(KeyError):
            g("server", "nope")

    def test_ini_continuation_and_comments(self):
        self.assertEqual(self.c.get("server", "motd"), "first\nsecond\nthird")
        self.assertEqual(self.m.parse("a = 1 ; not a comment\n").get("", "a"), "1 ; not a comment")

    def test_ini_typed_getters(self):
        c = self.c
        self.assertEqual((c.getint("server", "port"), c.getbool("server", "debug"), c.getbool("server", "extra"), c.getlist("server", "tags")),
                         (8080, True, True, ["a", "b", "c"]))
        self.assertEqual(c.getlist("client", "empty"), [])
        self.assertEqual(c.getint("server", "nope", 7), 7)
        self.assertEqual(self.m.parse("n = -12 \nb = No\n").getint("", "n"), -12)
        for f, k in ((c.getint, "host"), (c.getbool, "port"), (c.getint, "debug")):
            with self.assertRaises(ValueError):
                f("server", k)

    def test_ini_interpolation(self):
        self.assertEqual(self.c.get("client", "url"), "http://example.com:8080/")
        self.assertEqual(self.c.get("client", "again"), "http://example.com:8080/x")
        self.assertEqual(self.c.get("client", "price"), "$5 and $x and ${unclosed")
        self.assertEqual(self.m.parse("v = ${:w}\nw = 1\n").get("", "v"), "1")

    def test_ini_interpolation_not_repeated(self):
        c = self.m.parse("a = $${b}\nb = no\nc = ${a}\n")
        self.assertEqual((c.get("", "a"), c.get("", "c")), ("${b}", "${b}"))

    def test_ini_interpolation_errors(self):
        c = self.m.parse("[s]\na = ${b}\nb = ${a}\nc = ${missing}\nd = ${t:x}\ne = ${c}\n")
        for key, line in (("a", 2), ("c", 4), ("d", 5), ("e", 6)):
            with self.assertRaises(self.m.ParseError, msg=key) as cm:
                c.get("s", key)
            self.assertEqual(cm.exception.line, line, key)

    def test_ini_quoted(self):
        self.assertEqual(self.c.get("client", "quoted"), '  a "b" \\ \n end  ')
        self.assertEqual(self.m.parse('a = "x\nb = "\n').get("", "b"), '"')
        with self.assertRaises(self.m.ParseError) as cm:
            self.m.parse('[s]\na = "bad \\q"\n')
        self.assertEqual(cm.exception.line, 2)

    def test_ini_syntax_errors_with_lines(self):
        cases = {"[s]\nno separator\n": 2, "[]\n": 1, "[s] x\n": 1, "  indented = 1\n": 1, "[s]\n  cont\n": 2,
                 "[s]\na = 1\n\n  cont\n": 4, "[s]\na = 1\nA = 2\n": 3, "[s]\n = 1\n": 2, "[s]\na=1\n[t]\n[s]\na=2\n": 5}
        for text, line in cases.items():
            with self.assertRaises(self.m.ParseError, msg=text) as cm:
                self.m.parse(text)
            self.assertEqual(cm.exception.line, line, text)
        self.assertTrue(issubclass(self.m.ParseError, ValueError))

    def test_ini_crlf_and_colon_first(self):
        c = self.m.parse("[s]\r\nk: a=b\r\nj = a:b\r\n")
        self.assertEqual((c.get("s", "k"), c.get("s", "j")), ("a=b", "a:b"))

    def test_ini_duplicate_sections_merge(self):
        c = self.m.parse("[a]\nx=1\n[b]\ny=2\n[a]\nz=3\n")
        self.assertEqual((c.sections(), c.keys("a")), (["a", "b"], ["x", "z"]))


class Durations(unittest.TestCase):
    def setUp(self):
        self.m = mod("durations")

    def test_durations_plain_and_compact(self):
        p = self.m.parse_duration
        cases = {"90": 90, " 007 ": 7, "1h30m": 5400, "2d 4h": 187200, "1w2d3h4m5s": 788645, "0s": 0, "90m": 5400, "1H30M": 5400}
        self.assertEqual({k: p(k) for k in cases}, cases)

    def test_durations_iso(self):
        p = self.m.parse_duration
        cases = {"P1W": 604800, "P2D": 172800, "PT1H30M": 5400, "P1DT12H": 129600, "PT0S": 0, "pt5s": 5, "P1DT1S": 86401}
        self.assertEqual({k: p(k) for k in cases}, cases)

    def test_durations_clock(self):
        p = self.m.parse_duration
        self.assertEqual([p(s) for s in ("1:30", "2:00:05", "100:00:00", "0:05")], [90, 7205, 360000, 5])

    def test_durations_invalid(self):
        for s in ("", "  ", "-5", "1m1h", "1h1h", "1.5h", "P", "PT", "P1DT", "P1W2D", "PT1.5S", "P1M", "P1Y", "1:60", "1:5", "1:2:3:4", "5x", "h", "1h 30"):
            with self.assertRaises(ValueError, msg=s):
                self.m.parse_duration(s)

    def test_durations_format_compact(self):
        f = self.m.format_duration
        self.assertEqual([f(5400), f(694861), f(0), f(60), f(604800)], ["1h30m", "1w1d1h1m1s", "0s", "1m", "1w"])

    def test_durations_format_iso(self):
        f = lambda s: self.m.format_duration(s, "iso")
        self.assertEqual([f(5400), f(90000), f(86400), f(0), f(1209600), f(61)], ["PT1H30M", "P1DT1H", "P1D", "PT0S", "P14D", "PT1M1S"])

    def test_durations_format_clock(self):
        f = lambda s: self.m.format_duration(s, "clock")
        self.assertEqual([f(5), f(90061), f(3600)], ["0:00:05", "25:01:01", "1:00:00"])

    def test_durations_format_words(self):
        f = lambda s: self.m.format_duration(s, "words")
        self.assertEqual([f(5400), f(183661), f(1), f(0), f(604800 * 2 + 60)],
                         ["1 hour and 30 minutes", "2 days, 3 hours, 1 minute and 1 second", "1 second", "0 seconds", "2 weeks and 1 minute"])

    def test_durations_format_errors(self):
        for args in ((-1,), (1.5,), (True,), ("5",), (5, "nope")):
            with self.assertRaises(ValueError, msg=repr(args)):
                self.m.format_duration(*args)

    def test_durations_round_trip(self):
        for n in (0, 1, 59, 61, 3599, 86399, 86400, 694861, 10 ** 7 + 3):
            for style in ("compact", "iso", "clock"):
                self.assertEqual(self.m.parse_duration(self.m.format_duration(n, style)), n, (n, style))

    def test_durations_default_style_is_compact(self):
        self.assertEqual(self.m.format_duration(3661), self.m.format_duration(3661, "compact"))
        self.assertEqual(self.m.format_duration(3661), "1h1m1s")
'''

sys.exit(check(sys.argv[1], HIDDEN))
