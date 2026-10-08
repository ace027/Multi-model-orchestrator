"""Checks the graded tasks' hidden checks: each must fail the untouched fixture and give the
reference solution (tasks/<task>/solution, copied over the fixture) full marks, except on
open-ended parts such as the tron tournament, which only have to clear their threshold.
Usage: python3 bench/selftest.py [task ...]. No model calls."""
import os
import re
import shutil
import subprocess
import sys
import tempfile

TASKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks")
OPEN_ENDED = {"ai"}


def full_marks(line: str) -> bool:
    """`score P/N part p/n ...`: every part (or the total, for tasks without parts) is full."""
    words = line.split()
    if not words or words[0] != "score":
        return False
    parts = [(w, words[i + 1]) for i, w in enumerate(words[2:-1], 2) if re.fullmatch(r"[\d.]+/\d+", words[i + 1])]
    pairs = [v for k, v in parts if k not in OPEN_ENDED] or [words[1]]
    return all(float(a) == float(b) for a, b in (v.split("/") for v in pairs))


def fixture(task: str, solved: bool) -> str:
    work = os.path.join(tempfile.mkdtemp(prefix=f"selftest-{task}-"), "repo")
    shutil.copytree(os.path.join(TASKS, task, "repo"), work)
    setup = os.path.join(TASKS, task, "setup.py")
    if os.path.exists(setup):
        subprocess.run([sys.executable, setup, work], check=True)
    git = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
    subprocess.run(["git", "init", "-q"], cwd=work, check=True)
    subprocess.run(["git", "add", "-A"], cwd=work, check=True)
    subprocess.run(git + ["commit", "-qm", "fixture"], cwd=work, check=True)
    if solved:
        shutil.copytree(os.path.join(TASKS, task, "solution"), work, dirs_exist_ok=True)
    return work


def main() -> int:
    tasks = sys.argv[1:] or sorted(t for t in os.listdir(TASKS) if os.path.isdir(os.path.join(TASKS, t, "solution")))
    bad = 0
    for task in tasks:
        for solved in (False, True):
            work = fixture(task, solved)
            p = subprocess.run([sys.executable, os.path.join(TASKS, task, "check.py"), work], capture_output=True, text=True)
            line = (p.stdout.strip().splitlines() or ["(no output)"])[-1]
            full = full_marks(line)
            good = (p.returncode == 0 and full) if solved else p.returncode != 0
            bad += not good
            print(f"{'ok  ' if good else 'BAD '}{task:<10} {'solution' if solved else 'fixture ':<8} exit {p.returncode}: {line}{p.stderr[-800:] if not good else ''}")
            shutil.rmtree(os.path.dirname(work))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
