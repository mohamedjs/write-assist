#!/usr/bin/env bash
# Package the Chrome/Edge/Firefox extension into dist/writeassist-<version>-extension.zip
set -euo pipefail
VERSION="${1:-1.0.0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
DIST="$ROOT/dist"
EXT_SRC="$ROOT/extension"

mkdir -p "$DIST"
OUT="$DIST/writeassist-$VERSION-extension.zip"

rm -f "$OUT"
(cd "$EXT_SRC" && zip -r "$OUT" . -x "*.DS_Store" "*__pycache__*")
echo "Built extension package: $OUT ($(du -sh "$OUT" | cut -f1))"
