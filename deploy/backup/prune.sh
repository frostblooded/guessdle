#!/bin/sh
# Usage: prune.sh <dir> <keep> [ext=dump]: delete all but the <keep> newest *.<ext> (names sort by date).
set -eu
ls "$1"/*."${3:-dump}" 2>/dev/null | sort -r | tail -n +"$(($2 + 1))" | while read -r old; do
  echo "prune: $old"
  rm -f "$old"
done
