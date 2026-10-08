#!/usr/bin/env bash
# Usage: bench/run_phase6.sh <work dir>
# Phase 6 acceptance on the Legion-format fixture (phase 2 planned, not built):
#   1. /triad:build --dry-run --skip-frontend   prerequisite report, filter preview, no writes
#   2. /triad:build --just-harden --just-document   rejected by the intent validator
#   3. /triad:board meet <topic>   a 3-member board, 1 discussion round, vote, artifacts, commit
# Headless, so the run is told to take the recommended option instead of asking.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$1
rm -rf "$W" && cp -r "$ROOT/bench/legion/repo" "$W"
cd "$W"
python3 - <<'PY'
import json
s = json.load(open('settings.json'))
s['board'] = {'default_size': 3, 'min_size': 3, 'discussion_rounds': 1}
json.dump(s, open('settings.json', 'w'), indent=2)
PY
git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm "legion project (phase 2 planned)"
git config user.email t@t && git config user.name t
TOOLS="Read,Glob,Grep,ToolSearch,mcp__triad__planning_status,mcp__triad__build_phase,mcp__triad__intent,mcp__triad__dry_run,mcp__triad__board,mcp__triad__persona_brief,mcp__triad__persona_run"
NOTE="Non-interactive acceptance run: never ask the user; wherever the command says to ask, take the recommended option and say which you took."
run() {
  name=$1; shift
  timeout 3600 "$ROOT/bench/hermetic.sh" claude -p --model opus --plugin-dir "$ROOT/triad" \
    --session-id "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
    --append-system-prompt "$NOTE" --allowedTools "$TOOLS" --output-format json "$*" < /dev/null > "$W.$name.json" 2> "$W.$name.err" || echo "exit $?" >> "$W.$name.err"
  cp .triad/ledger.json "$W.$name.ledger.json" 2>/dev/null || true
}
run dryrun /triad:build 2 --dry-run --skip-frontend
git status --short > "$W.dryrun.status"
run invalid /triad:build --just-harden --just-document
run board /triad:board meet Store the inventory in SQLite instead of JSON files
git log --oneline
git status --short
find .planning/board -type f | sort
