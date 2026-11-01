import unittest
from datetime import datetime

from toolkit import cron, durations, ini, jsonpatch, semver


class Smoke(unittest.TestCase):
    def test_semver(self):
        self.assertTrue(semver.satisfies("1.4.0", "^1.2.3"))
        self.assertEqual(semver.compare("1.0.0-rc.1", "1.0.0"), -1)

    def test_cron(self):
        self.assertEqual(cron.next_run("0 9 * * *", datetime(2026, 1, 1, 10)), datetime(2026, 1, 2, 9))

    def test_jsonpatch(self):
        self.assertEqual(jsonpatch.apply_patch({}, [{"op": "add", "path": "/a", "value": 1}]), {"a": 1})

    def test_ini(self):
        self.assertEqual(ini.parse("[s]\na = ${b}\nb = 2\n").get("s", "a"), "2")

    def test_durations(self):
        self.assertEqual(durations.parse_duration("1h30m"), 5400)
        self.assertEqual(durations.format_duration(5400, "words"), "1 hour and 30 minutes")
