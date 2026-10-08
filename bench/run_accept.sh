#!/usr/bin/env bash
# Usage: bench/run_accept.sh <work dir> [prompt]
# Copies the shop fixture into <work dir>, runs the Opus orchestrator headless
# with the triad plugin, and leaves the ledger in <work dir>/.triad/ledger.json.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
W=$1
PROMPT=${2:-"Implement the feature described in TASK.md."}
rm -rf "$W" && cp -r "$ROOT/bench/shop" "$W"
cd "$W" && git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm fixture
export ANTHROPIC_API_KEY="${ORCHESTRATOR_API_KEY:?set ORCHESTRATOR_API_KEY}"
timeout 1800 claude -p --model opus --plugin-dir "$ROOT/triad" \
  --allowedTools "Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,mcp__triad__delegate_menial" \
  --output-format json "$PROMPT" < /dev/null > "$W.out.json" 2> "$W.err" || echo "exit $?" >> "$W.err"
python3 -m unittest -q 2>&1 | tail -1
git status --short
