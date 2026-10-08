"""Hidden check for the rename task. Usage: check.py <work dir>. Exit 0 = success."""
import glob
import os
import re
import subprocess
import sys

W = sys.argv[1]
r = subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=W, capture_output=True, text=True, timeout=300)
left = [p for p in glob.glob(f"{W}/app/**/*.py", recursive=True) if re.search(r"\blegacy\b", open(p).read())]
# Each call must keep its timeout/retries: compare the calls the services make with the original values.
probe = subprocess.run([sys.executable, "-c", """
import importlib, pkgutil, json
from app import transport, services
out = {}
for m in pkgutil.iter_modules(services.__path__):
    transport.CALLS.clear()
    importlib.import_module('app.services.' + m.name).sync()
    out[m.name] = [[c[1], c[2], c[3]] for c in transport.CALLS]
print(json.dumps(out, sort_keys=True))
"""], cwd=W, capture_output=True, text=True)
expected = open(os.path.join(os.path.dirname(__file__), "expected_calls.json")).read().strip()
same = probe.stdout.strip() == expected
print("tests", r.returncode, "legacy refs left", len(left), "legacy.py exists", os.path.exists(f"{W}/app/legacy.py"), "calls unchanged", same)
sys.exit(0 if r.returncode == 0 and not left and not os.path.exists(f"{W}/app/legacy.py") and same else 1)
