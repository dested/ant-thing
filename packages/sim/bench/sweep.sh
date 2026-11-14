#!/usr/bin/env bash
# Dev sweep: [ANTS=n] bench/sweep.sh <puzzle> <seeds> <max> "<set1>" "<set2>" ...
puzzle=$1; seeds=$2; max=$3; shift 3
for s in "$@"; do
  bun bench/run.ts --puzzle "$puzzle" --seeds "$seeds" --max "$max" --jobs 16 ${ANTS:+--ants $ANTS} ${s:+--set "$s"} | sed -n 2p | tr -d '\n'
  echo "  | $s"
done
