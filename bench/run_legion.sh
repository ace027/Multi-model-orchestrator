#!/usr/bin/env bash
# Usage: bench/run_legion.sh <work dir>
# Phase 5 acceptance: copies the Legion-format fixture (bench/legion/repo: a
# project Legion planned, phase 1 done, phase 2 planned), then runs /triad:build
# and /triad:review headless with the triad plugin. No migration step.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$1
rm -rf "$W" && cp -r "$ROOT/bench/legion/repo" "$W"
cd "$W" && git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm "legion project (phase 2 planned)"
git config user.email t@t && git config user.name t
TOOLS="Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,ToolSearch,mcp__triad__delegate_menial,mcp__triad__planning_status,mcp__triad__build_phase,mcp__triad__review_phase,mcp__triad__plan_check,mcp__triad__persona_brief"
for step in build review; do
  timeout 3600 "$ROOT/bench/hermetic.sh" claude -p --model opus --plugin-dir "$ROOT/triad" \
    --session-id "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
    --allowedTools "$TOOLS" --output-format json "/triad:$step" < /dev/null > "$W.$step.json" 2> "$W.$step.err" || echo "exit $?" >> "$W.$step.err"
  cp .triad/ledger.json "$W.$step.ledger.json" 2>/dev/null || true
done
python3 -m unittest -q 2>&1 | tail -1
git log --oneline
git status --short
