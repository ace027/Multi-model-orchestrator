import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


class CliTest(unittest.TestCase):
    def run_cli(self, d, name, text):
        (Path(d) / name).write_text(text)
        return subprocess.run([sys.executable, "-m", "bankkit.cli", "import", str(Path(d) / name), "--account", "chk",
                               "--store", str(Path(d) / "s.json")], cwd=REPO, capture_output=True, text=True)

    def test_qif(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "s.json").write_text(json.dumps({"accounts": {"chk": {"currency": "USD", "transactions": []}}}))
            p = self.run_cli(d, "st.qif", "D09/01/2026\nT-3.50\nPCoffee\n^\n")
            self.assertEqual((p.returncode, p.stdout), (0, "added 1, duplicates 0, errors 0\n"))
            self.assertEqual(len(json.loads((Path(d) / "s.json").read_text())["accounts"]["chk"]["transactions"]), 1)

    def test_unknown_extension(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "s.json").write_text(json.dumps({"accounts": {}}))
            self.assertEqual(self.run_cli(d, "st.ofx", "").returncode, 2)
