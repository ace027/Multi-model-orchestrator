#!/bin/bash
# usage: run_spike.sh <name> <mode> <prompt>
S=${SPIKE_OUT:-/tmp/triad-spike}; mkdir -p $S/spikework
cd $S/spikework
export ANTHROPIC_API_KEY="$ORCHESTRATOR_API_KEY" SPIKE_LOG="$S/spike_$1.jsonl" SPIKE_MODE="$2"
rm -f "$SPIKE_LOG"
timeout 600 claude -p --model sonnet --plugin-dir /home/user/Multi-model-orchestrator/spike/triad-spike \
  --allowedTools "Bash,Agent,Read" --output-format json "$3" > $S/spike_$1.out.json 2> $S/spike_$1.err
echo "exit $?"
