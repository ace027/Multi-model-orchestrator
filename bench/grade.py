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


def check_web(work: str, hidden: str, thresholds: dict[str, float]) -> int:
    """For the browser game tasks: runs `node <hidden> <work>` (a bench/webgrade.cjs script),
    which scores named parts. The run succeeds when each part reaches its threshold (a share),
    the work dir's `node --test` suite passes, and the run wrote tests under tests/."""
    env = {**os.environ}
    if not env.get("NODE_PATH"):
        env["NODE_PATH"] = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True).stdout.strip()
    p = subprocess.run(["node", hidden, work], capture_output=True, text=True, timeout=1800, env=env)
    try:
        r = json.loads(p.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError):
        print(f"score 0/1 hidden checks did not run: {(p.stderr or p.stdout)[-300:]}")
        return 1
    tests = [l for l in subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "tests"], cwd=work,
                                      capture_output=True, text=True).stdout.splitlines() if l.rstrip().endswith((".js", ".mjs", ".cjs"))]
    own = bool(tests) and subprocess.run(["node", "--test"], cwd=work, capture_output=True, text=True, timeout=600, env=env).returncode == 0
    parts = r["parts"]
    got = sum(v[0] for v in parts.values())
    total = sum(v[1] for v in parts.values())
    ok = own and all(parts.get(k, [0, 1])[0] >= t * parts.get(k, [0, 1])[1] for k, t in thresholds.items())
    fmt = lambda x: f"{x:g}"
    print(f"score {fmt(got)}/{total} " + " ".join(f"{k} {fmt(v[0])}/{v[1]}" for k, v in parts.items())
          + f" own-tests {'pass' if own else 'FAIL'} tests-added {bool(tests)} failed={r['failed']}")
    return 0 if ok else 1
