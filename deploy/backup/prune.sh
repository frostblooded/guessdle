#!/bin/sh
# Usage: prune.sh <dir> <keep>: delete all but the <keep> newest *.dump (names sort by date).
set -eu
ls "$1"/*.dump 2>/dev/null | sort -r | tail -n +"$(($2 + 1))" | while read -r old; do
  echo "prune: $old"
  rm -f "$old"
done
