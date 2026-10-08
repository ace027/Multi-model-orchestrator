#!/usr/bin/env bash
# Usage: bench/run_rebuild.sh <finished run_workflow work repo> <phase> <plan id to mark model: opus> <out dir>
# A/B for the Opus coder: copies a finished structured-workflow run, rewinds it to the end of the
# previous phase (keeping that phase's plans), marks one plan `model: opus`, and reruns
# /triad:build and /triad:review for the phase. Grades and writes <out dir>/result.json like run_workflow.sh.
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=$1 N=$2 PLAN=$3 OUT=$(mkdir -p "$4" && cd "$4" && pwd)
WORK=$(mktemp -d "/tmp/wfo-XXXX")
W=$WORK/repo HOME_DIR=$WORK/home
cp -r "$SRC" "$W" && mkdir -p "$HOME_DIR"
cd "$W"
PH=$(ls -d .planning/phases/$(printf %02d "$N")-*)
mkdir -p "$WORK/keep" && cp "$PH"/*-PLAN.md "$PH"/*-CONTEXT.md "$WORK/keep/"
BASE=$(git log --format=%h --grep="phase $((N - 1)) review passed" -1)
git reset -q --hard "$BASE" && git clean -qfdx -e .planning -e settings.json
rm -rf "$PH" && mkdir -p "$PH" && cp "$WORK/keep"/* "$PH/"
python3 - "$PH/$PLAN-PLAN.md" <<'PY'
import sys
p = sys.argv[1]; t = open(p).read()
i = t.index('\n---', 3)  # end of the frontmatter
open(p, 'w').write(t[:i] + '\nmodel: opus' + t[i:])
PY
grep -q '^model: opus$' "$PH/$PLAN-PLAN.md" || { echo "could not mark $PLAN"; exit 1; }
TOOLS="Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,ToolSearch,mcp__triad"
NOTE="Non-interactive run: never ask the user; wherever a command says to ask, take the recommended option or default and say which you took."
T0=$(date +%s)
run() {
  name=$1; shift
  echo "$(date +%T) $name: $*" >> "$OUT/log"
  HOME=$HOME_DIR timeout 2400 "$ROOT/bench/hermetic.sh" claude -p --model opus --plugin-dir "$ROOT/triad" \
    --session-id "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
    --append-system-prompt "$NOTE" --allowedTools "$TOOLS" --output-format json "$*" \
    < /dev/null > "$OUT/$name.json" 2> "$OUT/$name.err" || echo "exit $?" >> "$OUT/$name.err"
  cp .triad/ledger.json "$OUT/$name.ledger.json" 2>/dev/null || true
}
run build$N /triad:build $N --auto
run review$N /triad:review $N --auto
SECS=$(( $(date +%s) - T0 ))
python3 "$ROOT/bench/tasks/tron/check.py" "$W" > "$OUT/check.txt" 2>&1; OK=$?
git log --oneline > "$OUT/gitlog.txt"
python3 - "$OUT" "$W" "$OK" "$SECS" <<'PY'
import json, glob, os, re, sys
out, work, ok, secs = sys.argv[1], sys.argv[2], sys.argv[3] == "0", int(sys.argv[4])
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
           "seconds": secs, "steps": steps, "byModel": by, "check": chk.strip()[-400:], "work": work},
          open(os.path.join(out, "result.json"), "w"), indent=2)
PY
echo "$(date +%T) done ok=$OK" >> "$OUT/log"
