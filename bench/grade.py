"""Graded hidden checks for the harder bench tasks.

A check writes its hidden test module into the work dir's tests/, runs every test in it
separately, and scores the share that pass. The run succeeds when the work dir's own suite
passes, the run added or changed tests, and the score reaches the threshold. Prints
`score P/N` (run_bench.py records it) and the names of the failed hidden tests.
"""
import json
import os
import subprocess
import sys

RUNNER = r'''
import json, sys, unittest
suite = unittest.defaultTestLoader.loadTestsFromName("tests.test_zz_hidden_check")
res = unittest.TestResult()
suite.run(res)
bad = sorted({t.id().rsplit(".", 1)[1] for t, _ in res.failures + res.errors})
print(json.dumps({"total": res.testsRun, "failed": bad}))
'''


def check(work: str, hidden: str, threshold: float = 0.8) -> int:
    path = os.path.join(work, "tests", "test_zz_hidden_check.py")
    open(path, "w").write(hidden)
    try:
        p = subprocess.run([sys.executable, "-c", RUNNER], cwd=work, capture_output=True, text=True, timeout=600)
        try:
            r = json.loads(p.stdout.strip().splitlines()[-1])
        except (IndexError, json.JSONDecodeError):
            r = {"total": 0, "failed": ["<hidden tests did not run>"]}
    finally:
        os.remove(path)
    own = subprocess.run([sys.executable, "-m", "unittest", "-q"], cwd=work, capture_output=True, text=True, timeout=600).returncode == 0
    changed = [l for l in subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "tests"], cwd=work,
                                        capture_output=True, text=True).stdout.splitlines() if "__pycache__" not in l]
    total = hidden.count("\n    def test_")
    if r["total"] != total:  # the module did not import (e.g. the feature is missing): nothing passes
        r["failed"] = r["failed"] or ["<hidden tests did not load>"]
    passed = total - len(r["failed"]) if r["total"] == total else 0
    ok = own and bool(changed) and total and passed / total >= threshold
    print(f"score {passed}/{total} own-tests {'pass' if own else 'FAIL'} tests-added {bool(changed)} failed={r['failed']}")
    return 0 if ok else 1
