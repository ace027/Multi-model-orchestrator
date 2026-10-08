"""Checks the ceiling acceptance run. Usage: check.py <work dir> <cli json>
Passes when no Haiku request went over 100,000 prompt tokens, the ledger saw every
Haiku request the CLI billed, and SUMMARY.md names every file with its headline."""
import glob
import json
import os
import re
import sys

W, CLI = sys.argv[1], sys.argv[2]
ledger = json.load(open(f"{W}/.triad/ledger.json"))
cli = json.load(open(CLI))
fails = []
h = ledger["haiku"]
print(f"haiku requests {h['requests']}, largest prompt {h['maxPrompt']}, over the line {h['overLine']}")
print("ceiling", ledger.get("ceiling"))
if h["overLine"]:
    fails.append(f"{h['overLine']} Haiku requests over 100k")
# Billed usage: the CLI's Haiku totals must equal the helpers' requests in the ledger
# (every request was seen). The mod's own one-shots ($.model.complete: summaries,
# progress notes) are not in the CLI's totals; they are reported apart.
billed = {k: sum(u.get(k, 0) for m, u in cli.get("modelUsage", {}).items() if "haiku" in m)
          for k in ("inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens")}
helpers = [v for v in ledger["agents"].values() if v["role"] == "helper"]
seen = {"inputTokens": sum(v["input"] for v in helpers), "outputTokens": sum(v["output"] for v in helpers),
        "cacheReadInputTokens": sum(v["cacheRead"] for v in helpers), "cacheCreationInputTokens": sum(v["cacheWrite"] for v in helpers)}
print("billed haiku (CLI)", billed)
print("ledger helpers   ", seen)
oneshot = ledger["agents"].get("compressor")
if oneshot:
    print(f"mod one-shots: {oneshot['requests']} requests, ${oneshot['cost']:.4f} (not in the CLI's totals)")
if billed != seen:
    fails.append("the ledger's helper usage differs from the billed Haiku usage (a request went unseen)")
for a, v in ledger["agents"].items():
    if v["role"] == "helper":
        print(f"helper {a[:10]} req {v['requests']} status {v.get('status')}")
expected = {}
for p in sorted(glob.glob(f"{W}/notes/*.md")):
    text = open(p).read()
    expected[os.path.basename(p)] = (re.search(r"Headline decision: (.+?)\.", text).group(1), text.count("risk high"))
summary = open(f"{W}/SUMMARY.md").read() if os.path.exists(f"{W}/SUMMARY.md") else ""
named = [f for f in expected if f in summary or f[:-3] in summary]
right = [f for f in expected if any((f in l or f[:-3] in l) and expected[f][0].lower() in l.lower() for l in summary.splitlines())]
counts = [f for f in expected if any((f in l or f[:-3] in l) and re.search(rf"\b{expected[f][1]}\b", l) for l in summary.splitlines())]
print(f"SUMMARY.md: {len(named)}/24 files named, {len(right)}/24 headlines right, {len(counts)}/24 high-risk counts right")
if len(right) < 24:
    fails.append(f"SUMMARY.md has {len(right)}/24 correct headlines")
print(f"cost ${cli.get('total_cost_usd', 0):.4f}")
for f in fails:
    print("FAIL", f)
print("PASS" if not fails else "FAIL")
sys.exit(1 if fails else 0)
