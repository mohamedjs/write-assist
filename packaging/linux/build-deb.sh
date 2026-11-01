#!/usr/bin/env bash
# Package dist/writeassist as a .deb for Debian/Ubuntu:
#   packaging/linux/build-deb.sh <version> [amd64]
set -euo pipefail
APP="writeassist"
VERSION="${1:-1.0.0}"
ARCH="${2:-amd64}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DIST="$ROOT/dist/$APP"

[ -d "$DIST" ] || { echo "Build first: $DIST directory missing" >&2; exit 1; }

PKG="$(mktemp -d)/${APP}_${VERSION}_${ARCH}"
mkdir -p "$PKG/DEBIAN" "$PKG/opt" "$PKG/usr/bin" "$PKG/usr/share/applications" \
         "$PKG/usr/share/icons/hicolor/512x512/apps" "$PKG/usr/lib/systemd/user"

cp -a "$DIST" "$PKG/opt/$APP"
ln -s "/opt/$APP/$APP" "$PKG/usr/bin/$APP"
install -m644 "$HERE/$APP.desktop" "$PKG/usr/share/applications/$APP.desktop"
install -m644 "$HERE/$APP.service" "$PKG/usr/lib/systemd/user/$APP.service"
install -m644 "$ROOT/packaging/icons/$APP.png" "$PKG/usr/share/icons/hicolor/512x512/apps/$APP.png"

SIZE="$(du -sk "$PKG" | cut -f1)"
cat > "$PKG/DEBIAN/control" <<CONTROL
Package: $APP
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Installed-Size: $SIZE
Maintainer: Mohamed Mahmoud <mohamed.mahmoud@tqniat.com>
Homepage: https://github.com/mohamedjs/$APP
Depends: libstdc++6, libgcc-s1, zlib1g
Description: Desktop application and background service for WriteAssist
 Fast, privacy-friendly AI writing, grammar, rewrite, and translation assistant.
CONTROL

cat > "$PKG/DEBIAN/prerm" <<PRERM
#!/bin/sh
for u in \$(loginctl list-users --no-legend 2>/dev/null | awk '{print \$2}'); do
  if systemctl --user -M "\$u@" is-active -q $APP.service 2>/dev/null; then
    echo "\$u" >> /run/$APP-was-running
    systemctl --user -M "\$u@" stop $APP.service 2>/dev/null || true
  fi
done
exit 0
PRERM

cat > "$PKG/DEBIAN/postinst" <<POSTINST
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q /usr/share/icons/hicolor || true
for u in \$(loginctl list-users --no-legend 2>/dev/null | awk '{print \$2}'); do
  systemctl --user -M "\$u@" daemon-reload 2>/dev/null || true
  if grep -qx "\$u" /run/$APP-was-running 2>/dev/null; then
    systemctl --user -M "\$u@" start $APP.service 2>/dev/null || true
  else
    systemctl --user -M "\$u@" try-restart $APP.service 2>/dev/null || true
  fi
done
rm -f /run/$APP-was-running
POSTINST
chmod 755 "$PKG/DEBIAN/postinst" "$PKG/DEBIAN/prerm"

mkdir -p "$ROOT/dist"
dpkg-deb --build --root-owner-group "$PKG" "$ROOT/dist/${APP}_${VERSION}_${ARCH}.deb"
echo "Built dist/${APP}_${VERSION}_${ARCH}.deb"
