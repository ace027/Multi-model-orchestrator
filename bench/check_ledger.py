"""Checks a Triad ledger for the Phase 2 acceptance: every agent ran on its tier's model.

Usage: python3 bench/check_ledger.py <work dir>/.triad/ledger.json
Exits 1 when a check fails.
"""
import json
import sys

WANT = {"orchestrator": "opus", "coder": "sonnet", "helper": "haiku", "compressor": "haiku"}


def main(path: str) -> int:
    ledger = json.load(open(path))
    failures = []
    print(f"{'agent':<28}{'role':<14}{'parent':<12}{'depth':>5}{'req':>5}  models / status")
    for agent_id, a in ledger["agents"].items():
        print(f"{agent_id[:26]:<28}{a['role']:<14}{str(a.get('parent', '-'))[:10]:<12}{a['depth']:>5}{a['requests']:>5}  {', '.join(a['models'])} / {a.get('status', '-')}")
        want = WANT.get(a["role"])
        wrong = [m for m in a["models"] if want not in m]
        if want is None:
            failures.append(f"{agent_id}: unknown role {a['role']}")
        elif wrong:
            failures.append(f"{agent_id} ({a['role']}) ran on {wrong}, expected {want}")
        if a["role"] not in ("orchestrator", "compressor") and a["depth"] > 2:
            failures.append(f"{agent_id} is at depth {a['depth']}")
    print()
    total = 0.0
    for tier, t in ledger["tiers"].items():
        total += t["cost"]
        print(f"{tier:<8}{t['requests']:>5} req  in {t['input']:>8}  out {t['output']:>7}  cache r {t['cacheRead']:>9} w {t['cacheWrite']:>8}  ${t['cost']:.4f}")
    print(f"total   ${total:.4f}  (agent requests; the engine's own side calls are not counted)")
    h = ledger["haiku"]
    print(f"haiku: {h['requests']} requests, largest prompt {h['maxPrompt']}, {h['overLine']} over 100k")
    print(f"refusals: {len(ledger['refusals'])}, replies sent back: {ledger['rejectedReplies']}, context injections: {ledger.get('contextInjections')}")
    if h["overLine"]:
        failures.append(f"{h['overLine']} Haiku requests over the 100k line")
    roles = {a["role"] for a in ledger["agents"].values() if a["requests"]}
    for role in ("orchestrator", "coder"):
        if role not in roles:
            failures.append(f"no {role} made a request")
    print()
    for f in failures:
        print("FAIL", f)
    print("PASS" if not failures else f"{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
