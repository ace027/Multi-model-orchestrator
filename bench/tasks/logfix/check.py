"""Hidden check for the logfix task. Usage: check.py <work dir>. Exit 0 = success."""
import os
import subprocess
import sys

W = sys.argv[1]
TEST = '''
import unittest
from ingest.timestamps import parse_ts
from ingest.records import ingest

class Hidden(unittest.TestCase):
    def test_z_is_utc(self):
        self.assertEqual(parse_ts("2026-09-30T12:00:00Z").utcoffset().total_seconds(), 0)
    def test_offsets_still_work(self):
        self.assertEqual(parse_ts("2026-09-30T12:00:00-05:00").utcoffset().total_seconds(), -18000)
        self.assertEqual(parse_ts("2026-09-30T12:00:00+02:00").utcoffset().total_seconds(), 7200)
    def test_ingest_accepts_z(self):
        recs, rejected = ingest(['{"source": "s", "at": "2026-09-30T00:00:01Z", "value": 2}'])
        self.assertEqual((len(recs), rejected), (1, 0))
    def test_no_offset_still_rejected(self):
        with self.assertRaises(ValueError):
            parse_ts("2026-09-30T12:00:00")
'''
path = f"{W}/tests/test_zz_hidden_check.py"
open(path, "w").write(TEST)
try:
    r = subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=W, capture_output=True, text=True, timeout=300)
    added = [l for l in subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "tests"], cwd=W, capture_output=True, text=True).stdout.splitlines()
             if "test_zz_hidden_check" not in l and "__pycache__" not in l]
    print("tests", r.returncode, "test files changed:", bool(added))
    ok = r.returncode == 0 and bool(added)
finally:
    os.remove(path)
sys.exit(0 if ok else 1)
