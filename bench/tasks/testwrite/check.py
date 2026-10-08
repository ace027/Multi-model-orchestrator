"""Hidden check for the testwrite task: the new tests must pass on the real module and
catch at least 5 of the 7 mutants in mutants/. Usage: check.py <work dir>. Exit 0 = success."""
import glob
import os
import shutil
import subprocess
import sys

W = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
real = f"{W}/stock/inventory.py"
run = lambda: subprocess.run([sys.executable, "-m", "unittest", "-q", "tests.test_inventory"], cwd=W, capture_output=True, text=True, timeout=120).returncode
unchanged = not subprocess.run(["git", "diff", "--name-only", "HEAD", "--", "stock"], cwd=W, capture_output=True, text=True).stdout.strip()
if not os.path.exists(f"{W}/tests/test_inventory.py") or run() != 0 or not unchanged:
    print("tests missing, failing, or the module was changed")
    sys.exit(1)
backup = open(real).read()
caught = []
try:
    for m in sorted(glob.glob(f"{HERE}/mutants/*.py")):
        shutil.copy(m, real)
        if run() != 0:
            caught.append(os.path.basename(m)[:-3])
finally:
    open(real, "w").write(backup)
print("mutants caught", len(caught), "of 7:", caught)
sys.exit(0 if len(caught) >= 5 else 1)
