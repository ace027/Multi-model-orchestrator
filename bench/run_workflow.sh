#!/usr/bin/env bash
# Usage: bench/run_workflow.sh <task> <out dir>
# Runs a task through Triad's structured workflow, one headless session per command:
#   /triad:start (from TASK.md), then per roadmap phase /triad:plan N, /triad:build N, /triad:review N,
# all with --auto and control mode autonomous. Grades with tasks/<task>/check.py and writes
# <out dir>/result.json (cost summed over the commands) and the per-command JSON next to it.
# OPTS (JSON) sets Triad's options, e.g. OPTS='{"allOpus":true}' for the all-Opus baseline.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TASK=$1 OUT=$(mkdir -p "$2" && cd "$2" && pwd)
WORK=$(mktemp -d "/tmp/wf-$TASK-XXXX")
W=$WORK/repo HOME_DIR=$WORK/home
cp -r "$ROOT/bench/tasks/$TASK/repo" "$W" && mkdir -p "$HOME_DIR"
cd "$W"
echo '{ "control_mode": "autonomous", "execution": { "auto_commit": true, "commit_prefix": "triad" } }' > settings.json
git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm fixture
git config user.email t@t && git config user.name t
TOOLS="Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,ToolSearch,mcp__triad"
NOTE="Non-interactive run: never ask the user; wherever a command says to ask, take the recommended option or default and say which you took."
T0=$(date +%s)
run() {
  name=$1; shift
  echo "$(date +%T) $name: $*" >> "$OUT/log"
  HOME=$HOME_DIR timeout 2400 "$ROOT/bench/hermetic.sh" claude -p --model opus --plugin-dir "$ROOT/triad" \
    --session-id "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
    --settings "{\"pluginConfigs\":{\"triad@inline\":{\"options\":${OPTS:-{\}}}}}" \
    --append-system-prompt "$NOTE" --allowedTools "$TOOLS" --output-format json "$*" \
    < /dev/null > "$OUT/$name.json" 2> "$OUT/$name.err" || echo "exit $?" >> "$OUT/$name.err"
  cp .triad/ledger.json "$OUT/$name.ledger.json" 2>/dev/null || true
}
run start "/triad:start The project is fully specified in TASK.md and docs/spec.md: read both; they are the requirements, so take every answer from them."
PHASES=$(grep -cE '^- \[[ x]\] Phase [0-9]+' .planning/ROADMAP.md 2>/dev/null || echo 0)
for n in $(seq 1 "$PHASES"); do
  run plan$n /triad:plan $n --auto
  run build$n /triad:build $n --auto
  run review$n /triad:review $n --auto
done
SECS=$(( $(date +%s) - T0 ))
python3 "$ROOT/bench/tasks/$TASK/check.py" "$W" > "$OUT/check.txt" 2>&1; OK=$?
cp -r .planning "$OUT/planning" 2>/dev/null
git log --oneline > "$OUT/gitlog.txt"
python3 - "$OUT" "$W" "$OK" "$SECS" "$PHASES" <<'PY'
import json, glob, os, re, sys
out, work, ok, secs, phases = sys.argv[1], sys.argv[2], sys.argv[3] == "0", int(sys.argv[4]), int(sys.argv[5])
steps, by = {}, {}
for f in sorted(glob.glob(os.path.join(out, "*.json"))):
    name = os.path.basename(f)[:-5]
    if name == "result" or name.endswith(".ledger"): continue
    try: d = json.load(open(f))
    except Exception: d = {}
    steps[name] = {"cost": d.get("total_cost_usd"), "turns": d.get("num_turns"), "error": d.get("is_error")}
    for m, u in d.get("modelUsage", {}).items():
        by[m] = round(by.get(m, 0) + u.get("costUSD", 0), 4)
chk = open(os.path.join(out, "check.txt")).read()
m = re.search(r"score ([\d.]+)/(\d+)", chk)
json.dump({"success": ok, "score": m and [float(m[1]), int(m[2])], "cost": round(sum(s["cost"] or 0 for s in steps.values()), 4),
           "seconds": secs, "phases": phases, "steps": steps, "byModel": by, "check": chk.strip()[-400:], "work": work},
          open(os.path.join(out, "result.json"), "w"), indent=2)
PY
echo "$(date +%T) done ok=$OK" >> "$OUT/log"
