"""Phase 3 benchmark: runs each task under each config and records success, tokens and cost.

Usage: python3 bench/run_bench.py [--configs p2,p3] [--tasks a,b] [--jobs 3] [--out bench/results/phase3]

Each run copies tasks/<task>/repo to a scratch dir (plus setup.py if present), commits it,
runs `claude -p` headless through bench/hermetic.sh, then runs tasks/<task>/check.py.
Writes <out>/<config>/<task>.json and prints a summary table. Needs ORCHESTRATOR_API_KEY.
"""
import argparse
import concurrent.futures as cf
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TASKS = os.path.join(ROOT, "bench", "tasks")
PROMPT = "Do the task described in TASK.md."
TOOLS = "Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,mcp__triad__delegate_menial"

# None = no plugin (Opus alone); otherwise the triad options.
CONFIGS = {
    "opus": None,
    "p2": {"compress": False, "deferTools": False},
    "p3": {},
}


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

    cmd = [os.path.join(ROOT, "bench", "hermetic.sh"), "timeout", "2400", "claude", "-p", "--model", "opus",
           "--session-id", str(uuid.uuid4()), "--output-format", "json"]
    opts = CONFIGS[config]
    if opts is None:
        cmd += ["--allowedTools", "Agent,Read,Edit,Write,Bash,Glob,Grep"]
    else:
        cmd += ["--plugin-dir", os.path.join(ROOT, "triad"), "--allowedTools", TOOLS,
                "--settings", json.dumps({"pluginConfigs": {"triad@inline": {"options": opts}}})]
    cmd.append(PROMPT)
    t0 = time.time()
    p = subprocess.run(cmd, cwd=repo, stdin=subprocess.DEVNULL, capture_output=True, text=True)
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
        "task": task, "config": config, "options": opts, "seconds": secs, "exit": p.returncode,
        "success": chk.returncode == 0, "check": chk.stdout.strip()[-500:],
        "cost": cli.get("total_cost_usd"), "turns": cli.get("num_turns"),
        "tokens": tokens, "totalTokens": sum(tokens.values()),
        "byModel": {m: {k: v for k, v in u.items() if k in tokens or k == "costUSD"} for m, u in usage.items()},
        "compression": ledger and ledger.get("compression"),
        "deferredTools": ledger and ledger.get("deferredTools"),
        "agents": ledger and {a: {"role": v["role"], "depth": v["depth"], "requests": v["requests"]} for a, v in ledger["agents"].items()},
        "work": repo,
    }
    os.makedirs(os.path.join(out_dir, config), exist_ok=True)
    json.dump(rec, open(os.path.join(out_dir, config, f"{task}.json"), "w"), indent=2)
    return rec


def table(recs: list) -> str:
    rows = [f"{'task':<11}{'config':<7}{'ok':<4}{'cost':>8}{'tokens':>10}{'in+cw':>9}{'out':>7}{'secs':>6}  agents"]
    for r in sorted(recs, key=lambda r: (r["task"], r["config"])):
        t = r["tokens"]
        roles = {}
        for a in (r["agents"] or {}).values():
            roles[a["role"]] = roles.get(a["role"], 0) + 1
        cost = f"{r['cost']:.3f}" if r["cost"] is not None else "-"
        rows.append(f"{r['task']:<11}{r['config']:<7}{'Y' if r['success'] else 'N':<4}{cost:>8}{r['totalTokens']:>10}"
                    f"{t['inputTokens'] + t['cacheCreationInputTokens']:>9}{t['outputTokens']:>7}{r['seconds']:>6}  "
                    + " ".join(f"{k}:{v}" for k, v in sorted(roles.items())))
    return "\n".join(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", default="p2,p3")
    ap.add_argument("--tasks", default=",".join(sorted(os.listdir(TASKS))))
    ap.add_argument("--jobs", type=int, default=3)
    ap.add_argument("--out", default=os.path.join(ROOT, "bench", "results", "phase3"))
    a = ap.parse_args()
    jobs = [(t, c) for t in a.tasks.split(",") for c in a.configs.split(",")]
    recs = []
    with cf.ThreadPoolExecutor(a.jobs) as ex:
        for f in cf.as_completed([ex.submit(run, t, c, a.out) for t, c in jobs]):
            r = f.result()
            recs.append(r)
            print(f"done {r['task']} {r['config']}: ok={r['success']} cost={r['cost']} tokens={r['totalTokens']}", flush=True)
    print(table(recs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
