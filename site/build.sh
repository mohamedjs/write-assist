#!/usr/bin/env bash
# Assemble the landing page into _site/ for GitHub Pages.
set -euo pipefail
REPO="mohamedjs/write-assist"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/_site"
rm -rf "$OUT"
mkdir -p "$OUT/assets" "$OUT/fonts"
cp "$ROOT"/site/index.html "$ROOT"/site/site.css "$ROOT"/site/site.js "$OUT/"
[ -d "$ROOT/site/assets" ] && cp -r "$ROOT"/site/assets/. "$OUT/assets/"
[ -d "$ROOT/site/fonts" ] && cp -r "$ROOT"/site/fonts/. "$OUT/fonts/" 2>/dev/null || true

if command -v curl >/dev/null; then
  auth=()
  [ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  curl -fsSL "${auth[@]}" "https://api.github.com/repos/$REPO/releases/latest" -o "$OUT/release.json" \
    || echo "warning: no release.json; the page will ask the GitHub API"
fi
touch "$OUT/.nojekyll"
echo "built $OUT ($(du -sh "$OUT" | cut -f1))"
