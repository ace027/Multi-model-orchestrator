"""Phase 3 benchmark: runs each task under each config and records success, tokens and cost.

Usage: python3 bench/run_bench.py [--configs p2,p3] [--tasks core|hard|a,b] [--jobs 3] [--out bench/results/phase3]
                                   [--legion-home DIR]

Configs: opus (no plugin), p2/p3 (Phase 3 option sets), triad (current defaults),
legion (Legion installed in --legion-home, run through /legion:quick). Every run gets
a fresh HOME (a copy of --legion-home for legion), so no config sees the user's ~/.claude.

Each run copies tasks/<task>/repo to a scratch dir (plus setup.py if present), commits it,
runs `claude -p` headless through bench/hermetic.sh, then runs tasks/<task>/check.py.
Task sets: core (the Phase 3 tasks, the default), hard (csvimport, refunds) and games (tron,
pacman: browser games checked through Playwright). hard and games have graded checks
that print `score P/N`, recorded as the run's score; bench/selftest.py checks them).
Writes <out>/<config>/<task>.json and <out>/summary.md (this run's table). Needs ORCHESTRATOR_API_KEY.
"""
import argparse
import concurrent.futures as cf
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS = os.path.join(ROOT, "bench", "tasks")
SETS = {"core": ["discounts", "logfix", "noisy", "rename", "testwrite"], "hard": ["csvimport", "refunds"], "games": ["tron", "pacman"]}
PROMPT = "Do the task described in TASK.md."
TOOLS = "Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,mcp__triad__delegate_menial"

# None = no plugin (Opus alone); otherwise the triad options.
CONFIGS = {
    "opus": None,
    "p2": {"compress": False, "deferTools": False},
    "p3": {},
    "triad": {},
    "legion": "legion",
}
LEGION_PROMPT = ("/legion:quick Do the task described in TASK.md. This is a non-interactive run: "
                 "wherever the workflow would ask the user, take the recommended option.")
LEGION_HOME = None


def run(task: str, config: str, out_dir: str) -> dict:
    work = tempfile.mkdtemp(prefix=f"bench-{config}-{task}-")
    repo = os.path.join(work, "repo")
    shutil.copytree(os.path.join(TASKS, task, "repo"), repo)
    setup = os.path.join(TASKS, task, "setup.py")
    if os.path.exists(setup):
        subprocess.run([sys.executable, setup, repo], check=True)
    git = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(git + ["commit", "-qm", "fixture"], cwd=repo, check=True)

    home = os.path.join(work, "home")
    if CONFIGS[config] == "legion":
        shutil.copytree(LEGION_HOME, home, symlinks=True)
    else:
        os.makedirs(home)
    cmd = [os.path.join(ROOT, "bench", "hermetic.sh"), "timeout", "2400", "claude", "-p", "--model", "opus",
           "--session-id", str(uuid.uuid4()), "--output-format", "json"]
    opts = CONFIGS[config]
    if opts is None:
        cmd += ["--allowedTools=Agent,Read,Edit,Write,Bash,Glob,Grep"]
    elif opts == "legion":
        cmd += ["--allowedTools=Agent,Read,Edit,Write,Bash,Glob,Grep,Skill"]
    else:
        cmd += ["--plugin-dir", os.path.join(ROOT, "triad"), "--allowedTools=" + TOOLS,
                "--settings", json.dumps({"pluginConfigs": {"triad@inline": {"options": opts}}})]
    cmd.append(LEGION_PROMPT if opts == "legion" else PROMPT)
    t0 = time.time()
    p = subprocess.run(cmd, cwd=repo, stdin=subprocess.DEVNULL, capture_output=True, text=True, env={**os.environ, "HOME": home})
    secs = round(time.time() - t0)
    try:
        cli = json.loads(p.stdout)
    except json.JSONDecodeError:
        cli = {"error": p.stdout[-2000:], "stderr": p.stderr[-2000:]}
    chk = subprocess.run([sys.executable, os.path.join(TASKS, task, "check.py"), repo], capture_output=True, text=True)
    ledger_path = os.path.join(repo, ".triad", "ledger.json")
    ledger = json.load(open(ledger_path)) if os.path.exists(ledger_path) else None

    usage = cli.get("modelUsage", {})
    tokens = {k: sum(m.get(k, 0) for m in usage.values())
              for k in ("inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens")}
    rec = {
        "task": task, "config": config, "options": opts if opts != "legion" else None, "seconds": secs, "exit": p.returncode,
        "success": chk.returncode == 0, "check": chk.stdout.strip()[-500:],
        "score": [float(x) for x in m.groups()] if (m := re.search(r"score ([\d.]+)/(\d+)", chk.stdout)) else None,
        "cost": cli.get("total_cost_usd"), "turns": cli.get("num_turns"),
        "tokens": tokens, "totalTokens": sum(tokens.values()),
        "byModel": {m: {k: v for k, v in u.items() if k in tokens or k == "costUSD"} for m, u in usage.items()},
        "compression": ledger and ledger.get("compression"),
        "deferredTools": ledger and ledger.get("deferredTools"),
        "agents": ledger and {a: {"role": v["role"], "depth": v["depth"], "requests": v["requests"]} for a, v in ledger["agents"].items()},
        "work": repo,
    }
    if p.returncode:
        rec["stderr"] = (p.stderr or "")[-1500:]
        rec["stdout"] = (p.stdout or "")[-1500:]
    os.makedirs(os.path.join(out_dir, config), exist_ok=True)
    json.dump(rec, open(os.path.join(out_dir, config, f"{task}.json"), "w"), indent=2)
    return rec


def table(recs: list) -> str:
    rows = [f"{'task':<11}{'config':<7}{'ok':<11}{'cost':>8}{'tokens':>10}{'in+cw':>9}{'out':>7}{'secs':>6}  agents"]
    for r in sorted(recs, key=lambda r: (r["task"], r["config"])):
        t = r["tokens"]
        roles = {}
        for a in (r["agents"] or {}).values():
            roles[a["role"]] = roles.get(a["role"], 0) + 1
        cost = f"{r['cost']:.3f}" if r["cost"] is not None else "-"
        rows.append(f"{r['task']:<11}{r['config']:<7}{('Y' if r['success'] else 'N') + (' %g/%g' % tuple(r['score']) if r.get('score') else ''):<11}{cost:>8}{r['totalTokens']:>10}"
                    f"{t['inputTokens'] + t['cacheCreationInputTokens']:>9}{t['outputTokens']:>7}{r['seconds']:>6}  "
                    + " ".join(f"{k}:{v}" for k, v in sorted(roles.items())))
    return "\n".join(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", default="p2,p3")
    ap.add_argument("--tasks", default="core", help="task names or set names (core, hard, games), comma-separated")
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--out", default=os.path.join(ROOT, "bench", "results", "phase3"))
    ap.add_argument("--legion-home", help="a HOME with Legion installed (node bin/install.js --claude --global)")
    a = ap.parse_args()
    global LEGION_HOME
    LEGION_HOME = a.legion_home
    if "legion" in a.configs.split(",") and not (LEGION_HOME and os.path.isdir(os.path.join(LEGION_HOME, ".claude", "commands", "legion"))):
        ap.error("the legion config needs --legion-home with Legion installed")
    tasks = [t for name in a.tasks.split(",") for t in SETS.get(name, [name])]
    jobs = [(t, c) for t in tasks for c in a.configs.split(",")]
    recs = []
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        for f in cf.as_completed([ex.submit(run, t, c, a.out) for t, c in jobs]):
            r = f.result()
            recs.append(r)
            print(f"done {r['task']} {r['config']}: ok={r['success']} cost={r['cost']} tokens={r['totalTokens']}", flush=True)
    print(table(recs))
    open(os.path.join(a.out, "summary.md"), "w").write("```\n" + table(recs) + "\n```\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
