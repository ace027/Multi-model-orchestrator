#!/usr/bin/env bash
# Phase 7 benchmark: Opus only vs Legion vs Triad on the five bench tasks (SPEC section 7).
# Usage: bench/run_phase7.sh <legion checkout> [configs]   (configs default: opus,legion,triad)
# Legion is installed by its own installer into a throwaway HOME made from a copy
# of the checkout; the real ~/.claude is never touched. Needs ORCHESTRATOR_API_KEY.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
src=${1:?usage: bench/run_phase7.sh <legion checkout> [configs]}
configs=${2:-opus,legion,triad}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -r "$src" "$tmp/legion-src"
rm -rf "$tmp/legion-src/.git"
mkdir "$tmp/legion-home"
(cd "$tmp/legion-src" && env -i HOME="$tmp/legion-home" PATH="$PATH" node bin/install.js --claude --global >/dev/null)
python3 "$root/bench/run_bench.py" --configs "$configs" --jobs 3 --out "$root/bench/results/phase7" --legion-home "$tmp/legion-home"
