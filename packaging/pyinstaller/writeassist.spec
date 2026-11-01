# -*- mode: python -*-
import re
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).resolve().parents[1]
SRC = ROOT / "src"
WRITEASSIST = SRC / "writeassist"
ICON_PNG = ROOT / "packaging" / "icons" / "writeassist.png"

datas = [
    (str(WRITEASSIST / "shared" / "i18n" / "*.json"), "writeassist/shared/i18n"),
    (str(WRITEASSIST / "modules" / "dashboard" / "infrastructure" / "static"), "writeassist/modules/dashboard/infrastructure/static"),
]
binaries = []
hidden = collect_submodules("writeassist")

for package in ("webview",):
    try:
        d, b, h = collect_all(package)
        datas += d
        binaries += b
        hidden += h
    except Exception:
        pass

entry_py = str(ROOT / "packaging" / "pyinstaller" / "entry.py")
a = Analysis(
    [entry_py],
    pathex=[str(SRC)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    excludes=["tkinter"],
    noarchive=False,
)

# Linux: do not bundle host GPU or libc/glib libraries that conflict with newer host distros
HOST_LIBS = re.compile(
    r"^lib(stdc\+\+|gcc_s|gbm|xcb-glx|GL|GLX|EGL|OpenGL|drm|"
    r"(glib|gio|gobject|gmodule|gthread)-2\.0|pcre2-8|selinux|mount|blkid|"
    r"X11|X11-xcb|fontconfig|freetype|harfbuzz|fribidi|uuid|z)\.so(\.|$)"
)
if sys.platform.startswith("linux"):
    a.binaries = [b for b in a.binaries if not HOST_LIBS.match(Path(b[0]).name)]

pyz = PYZ(a.pure)

icon = str(ROOT / "packaging" / "icons" / ("writeassist.ico" if sys.platform.startswith("win") else "writeassist.png"))

cli = EXE(pyz, a.scripts, [], exclude_binaries=True, name="writeassist", console=True, icon=icon)
gui = EXE(pyz, a.scripts, [], exclude_binaries=True, name="WriteAssistApp", console=False, icon=icon)
coll = COLLECT(cli, gui, a.binaries, a.datas, name="writeassist")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="WriteAssist.app",
        icon=icon,
        bundle_identifier="com.mohamedjs.writeassist",
        info_plist={
            "CFBundleExecutable": "WriteAssistApp",
            "CFBundleName": "WriteAssist",
            "CFBundleDisplayName": "WriteAssist",
            "NSLocalNetworkUsageDescription": "WriteAssist connects to local assistant services on this machine.",
            "CFBundleShortVersionString": "1.0.0",
            "NSHighResolutionCapable": True,
        },
    )
