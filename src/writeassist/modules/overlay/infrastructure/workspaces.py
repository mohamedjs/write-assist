"""Cross-platform workspace stickiness to keep floating overlay across all desktops."""

import ctypes
import ctypes.util
import logging
import os
import sys

log = logging.getLogger(__name__)

ALL_DESKTOPS = 0xFFFFFFFF
_ADD = 1
_CLIENT_MESSAGE = 33
_REDIRECT = (1 << 20) | (1 << 19)


class _ClientMessage(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("serial", ctypes.c_ulong),
        ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p),
        ("window", ctypes.c_ulong),
        ("message_type", ctypes.c_ulong),
        ("format", ctypes.c_int),
        ("l", ctypes.c_long * 5),
    ]


class _Event(ctypes.Union):
    _fields_ = [("xclient", _ClientMessage), ("pad", ctypes.c_long * 24)]


def _stick_x11(window_xid: int) -> None:
    try:
        x11_name = ctypes.util.find_library("X11") or "libX11.so.6"
        x = ctypes.cdll.LoadLibrary(x11_name)
        display = x.XOpenDisplay(None)
        if not display:
            return

        atom = lambda name: x.XInternAtom(display, name, 0)
        desktop = atom(b"_NET_WM_DESKTOP")
        x.XChangeProperty(
            display,
            window_xid,
            desktop,
            atom(b"CARDINAL"),
            32,
            0,
            ctypes.byref((ctypes.c_ulong * 1)(ALL_DESKTOPS)),
            1,
        )
        root = x.XDefaultRootWindow(display)
        for message_type, data in (
            (desktop, (ALL_DESKTOPS, 1, 0, 0, 0)),
            (atom(b"_NET_WM_STATE"), (_ADD, atom(b"_NET_WM_STATE_STICKY"), 0, 1, 0)),
        ):
            event = _Event()
            event.xclient = _ClientMessage(
                _CLIENT_MESSAGE,
                0,
                1,
                display,
                window_xid,
                message_type,
                32,
                (ctypes.c_long * 5)(*[ctypes.c_long(v & 0xFFFFFFFF).value for v in data]),
            )
            x.XSendEvent(display, root, 0, _REDIRECT, ctypes.byref(event))
        x.XFlush(display)
        x.XCloseDisplay(display)
    except Exception as exc:
        log.debug("X11 workspace stickiness failed: %s", exc)


def _stick_macos(view_ptr: int) -> None:
    try:
        objc = ctypes.cdll.LoadLibrary(ctypes.util.find_library("objc"))
        objc.sel_registerName.restype = ctypes.c_void_p
        objc.sel_registerName.argtypes = [ctypes.c_char_p]
        get = ctypes.CFUNCTYPE(ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p)(
            ctypes.cast(objc.objc_msgSend, ctypes.c_void_p).value
        )
        put = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong)(
            ctypes.cast(objc.objc_msgSend, ctypes.c_void_p).value
        )
        window = get(view_ptr, objc.sel_registerName(b"window"))
        if window:
            # NSWindowCollectionBehaviorCanJoinAllSpaces | Stationary | FullScreenAuxiliary
            put(window, objc.sel_registerName(b"setCollectionBehavior:"), (1 << 0) | (1 << 4) | (1 << 8))
    except Exception as exc:
        log.debug("macOS Space stickiness failed: %s", exc)


def pin_to_all_workspaces(window_id: int) -> None:
    """Pins a native window across all workspaces / Spaces."""
    if sys.platform == "darwin":
        _stick_macos(window_id)
    elif sys.platform.startswith("linux") and os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
        _stick_x11(window_id)
