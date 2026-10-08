#!/usr/bin/env bash
# Phase 4 acceptance: one Haiku helper is given a job too big for its prompt ceiling.
# Usage: bench/ceiling/run.sh <work dir> [options json]   (e.g. '{"haikuCeiling":10000000,"haikuWrapAt":10000000}' for the control)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
W=$1
OPTS=${2:-'{}'}
rm -rf "$W" && mkdir -p "$W" && python3 "$ROOT/bench/ceiling/gen.py" "$W"
cd "$W" && git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm fixture
BRIEF='Read every file in notes/ in name order, one file at a time, each in full with the Read tool (no grep, no line limits). After reading each file, append one line to SUMMARY.md: "<file name>: <headline decision>; <number of items marked risk high> high-risk items". Writable files: SUMMARY.md'
PROMPT="Write SUMMARY.md with one line per file in notes/ (24 files). Delegate the reading: spawn one triad:triad-helper with exactly this brief, verbatim: '$BRIEF'. If a helper returns partial, review SUMMARY.md and spawn a fresh helper, with the same kind of brief, for the files that are left. Do not read the notes yourself."
"$ROOT/bench/hermetic.sh" timeout 2400 claude -p --model opus --plugin-dir "$ROOT/triad" --session-id "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
  --allowedTools "Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,mcp__triad__delegate_menial" \
  --settings "{\"pluginConfigs\":{\"triad@inline\":{\"options\":$OPTS}}}" \
  --output-format json "$PROMPT" < /dev/null > "$W.out.json" 2> "$W.err" || echo "exit $?" >> "$W.err"
python3 "$ROOT/bench/ceiling/check.py" "$W" "$W.out.json" || true
