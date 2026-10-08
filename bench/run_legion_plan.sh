#!/usr/bin/env bash
# Usage: bench/run_legion_plan.sh <work dir from run_legion.sh> <out dir>
# Adds a Phase 3 to the roadmap (as a Legion user would), then runs
# /triad:plan 3, /triad:build and /triad:review headless.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=$1; W=$2
rm -rf "$W" && cp -r "$SRC" "$W" && rm -rf "$W/.triad"
cd "$W"
python3 - <<'PY'
import re
r = open('.planning/ROADMAP.md').read()
r = r.replace('- [x] Phase 2: Reporting (2 plans)', '- [x] Phase 2: Reporting (2 plans)\n- [ ] Phase 3: Restock Orders (2 plans)')
r = r.replace('## Progress', '''### Phase 3: Restock Orders
**Goal**: Turn the low-stock report into restock orders with per-SKU reorder targets
**Requirements**: ORDER-01, ORDER-02, ORDER-03
**Recommended Agents**: engineering-senior-developer
**Success Criteria**:
- reorder targets are read from a JSON file of SKU -> target level; a SKU with no target uses a default of 20
- an order line asks for target minus level for every SKU at or below the threshold, never zero or negative
- `python -m invlib.cli order sample.json --targets targets.json --threshold 5` prints one `SKU QTY` line per order line, sorted by SKU, and exits 2 on a bad file

## Progress''')
r = r.rstrip('\n') + '\n| 3 — Restock Orders | 2 | 0 | Not started | — |\n'
open('.planning/ROADMAP.md', 'w').write(r)
p = open('.planning/PROJECT.md').read()
p = p.replace('### Out of Scope', '- ORDER-01: Reorder targets per SKU from a JSON file, default 20\n- ORDER-02: Order quantity is target minus level, only for SKUs at or below the threshold\n- ORDER-03: `order` CLI subcommand\n\n### Out of Scope')
open('.planning/PROJECT.md', 'w').write(p)
s = open('.planning/STATE.md').read()
s = re.sub(r'- \*\*Phase\*\*: .*', '- **Phase**: 3 of 3 (pending)', s)
open('.planning/STATE.md', 'w').write(s)
PY
git add -A && git commit -qm "roadmap: add phase 3 (restock orders)"
TOOLS="Agent,SendMessage,Read,Edit,Write,Bash,Glob,Grep,ToolSearch,mcp__triad__delegate_menial,mcp__triad__planning_status,mcp__triad__plan_write,mcp__triad__plan_check,mcp__triad__persona_brief,mcp__triad__build_phase,mcp__triad__review_phase"
for step in "plan 3" build review; do
  name=${step%% *}
  timeout 3600 "$ROOT/bench/hermetic.sh" claude -p --model opus --plugin-dir "$ROOT/triad" \
    --session-id "$(python3 -c 'import uuid; print(uuid.uuid4())')" \
    --allowedTools "$TOOLS" --output-format json "/triad:$step" < /dev/null > "$W.$name.json" 2> "$W.$name.err" || echo "exit $?" >> "$W.$name.err"
  cp .triad/ledger.json "$W.$name.ledger.json" 2>/dev/null || true
  # plans are written by the tool; commit them the way a user would before building
  if [ "$name" = plan ]; then git add -A .planning && git commit -qm "plan phase 3" || true; fi
done
python3 -m unittest -q 2>&1 | tail -1
git log --oneline
git status --short
