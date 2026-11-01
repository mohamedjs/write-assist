"""GTK3-based floating correction overlay for Linux desktop."""

import logging
import threading
import time
from typing import Callable

from ..domain import OverlayPort, OverlayState
from .workspaces import pin_to_all_workspaces

log = logging.getLogger(__name__)


def is_gtk_available() -> bool:
    try:
        import gi
        gi.require_version("Gdk", "3.0")
        gi.require_version("Gtk", "3.0")
        from gi.repository import Gdk, Gtk  # noqa: F401
        return True
    except Exception as exc:
        log.debug("GTK3 overlay unavailable: %s", exc)
        return False


class GtkOverlayAdapter(OverlayPort):
    """Floating translucent correction HUD always on top across all workspaces."""

    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._window = None
        self._lbl_app = None
        self._lbl_status = None
        self._btn_fix = None
        self._btn_rewrite = None
        self._actions: dict[str, Callable[[], None]] = {}

    def is_available(self) -> bool:
        return is_gtk_available()

    def start(self, actions: dict[str, Callable[[], None]]) -> None:
        if not self.is_available():
            log.info("GTK3 not available; floating overlay disabled.")
            return

        self._actions = actions
        self._thread = threading.Thread(target=self._run_gtk_loop, daemon=True, name="gtk-overlay")
        self._thread.start()

    def _run_gtk_loop(self) -> None:
        import gi
        gi.require_version("Gdk", "3.0")
        gi.require_version("Gtk", "3.0")
        from gi.repository import Gdk, GLib, Gtk

        win = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
        self._window = win
        win.set_title("WriteAssist Overlay")
        win.set_decorated(False)
        win.set_resizable(False)
        win.set_keep_above(True)       # ALWAYS ON TOP
        win.stick()                    # ON ALL WORKSPACES
        win.set_skip_taskbar_hint(True)
        win.set_skip_pager_hint(True)
        win.set_accept_focus(False)    # NEVER STEALS FOCUS FROM WORD / EXCEL
        win.set_type_hint(Gdk.WindowTypeHint.DOCK)
        win.set_app_paintable(True)

        screen = win.get_screen()
        if visual := screen.get_rgba_visual():
            win.set_visual(visual)

        # Position at top-right of primary monitor
        display = Gdk.Display.get_default()
        monitor = display.get_primary_monitor() if display else None
        geo = monitor.get_geometry() if monitor else Gdk.Rectangle()
        margin_right = 32
        margin_top = 32
        default_x = (geo.x + geo.width - 340 - margin_right) if geo.width > 0 else 1000
        default_y = (geo.y + margin_top) if geo.height > 0 else 32
        win.move(default_x, default_y)

        # Translucent dark pill CSS styling
        css = Gtk.CssProvider()
        css.load_from_data(
            b"window, window.background { background: none; border: none; box-shadow: none; }\n"
            b".wa-pill { background: rgba(15, 23, 42, 0.88); border: 1.5px solid rgba(59, 130, 246, 0.5); "
            b"border-radius: 999px; padding: 6px 14px; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }\n"
            b".wa-title { font-weight: 700; color: #60a5fa; font-size: 13px; }\n"
            b".wa-app { color: #94a3b8; font-size: 11px; font-weight: 600; }\n"
            b".wa-badge-clean { background: rgba(0, 255, 157, 0.15); color: #00ff9d; font-size: 11px; "
            b"font-weight: 700; border-radius: 999px; padding: 2px 8px; }\n"
            b".wa-badge-issue { background: rgba(255, 77, 109, 0.2); color: #ff4d6d; font-size: 11px; "
            b"font-weight: 700; border-radius: 999px; padding: 2px 8px; }\n"
            b".wa-btn { background: rgba(59, 130, 246, 0.2); color: #ffffff; border: 1px solid rgba(59, 130, 246, 0.4); "
            b"border-radius: 8px; padding: 2px 8px; font-size: 11px; font-weight: 700; }\n"
            b".wa-btn:hover { background: rgba(59, 130, 246, 0.4); }\n"
        )
        Gtk.StyleContext.add_provider_for_screen(screen, css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)

        # Draggable container box
        event_box = Gtk.EventBox()
        event_box.set_visible_window(False)

        def on_button_press(widget, event):
            if event.button == 1:
                if event.type == Gdk.EventType._2BUTTON_PRESS:
                    # Double-click opens dashboard
                    if "open" in self._actions:
                        self._actions["open"]()
                else:
                    win.begin_move_drag(event.button, int(event.x_root), int(event.y_root), event.time)

        event_box.connect("button-press-event", on_button_press)

        # Horizontal Pill layout
        pill_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        pill_box.get_style_context().add_class("wa-pill")

        # Brand / Icon
        lbl_logo = Gtk.Label(label="✍️")
        lbl_logo.get_style_context().add_class("wa-title")
        pill_box.pack_start(lbl_logo, False, False, 0)

        # Active App label
        self._lbl_app = Gtk.Label(label="Word / Desktop")
        self._lbl_app.get_style_context().add_class("wa-app")
        pill_box.pack_start(self._lbl_app, False, False, 0)

        # Status badge
        self._lbl_status = Gtk.Label(label="✓ Ready")
        self._lbl_status.get_style_context().add_class("wa-badge-clean")
        pill_box.pack_start(self._lbl_status, False, False, 0)

        # Quick action: Fix in-place
        btn_fix = Gtk.Button(label="⚡ Fix")
        btn_fix.get_style_context().add_class("wa-btn")
        btn_fix.connect("clicked", lambda b: self._actions.get("fix", lambda: None)())
        self._btn_fix = btn_fix
        pill_box.pack_start(btn_fix, False, False, 0)

        # Quick action: AI Rewrite
        btn_rewrite = Gtk.Button(label="✨ AI")
        btn_rewrite.get_style_context().add_class("wa-btn")
        btn_rewrite.connect("clicked", lambda b: self._actions.get("rewrite", lambda: None)())
        self._btn_rewrite = btn_rewrite
        pill_box.pack_start(btn_rewrite, False, False, 0)

        # Quick action: Open Dashboard
        btn_open = Gtk.Button(label="📖")
        btn_open.get_style_context().add_class("wa-btn")
        btn_open.connect("clicked", lambda b: self._actions.get("open", lambda: None)())
        pill_box.pack_start(btn_open, False, False, 0)

        event_box.add(pill_box)
        win.add(event_box)

        def on_map(widget, event):
            # Pin across all X11 desktops once mapped
            try:
                gdk_win = win.get_window()
                if gdk_win and hasattr(gdk_win, "get_xid"):
                    pin_to_all_workspaces(gdk_win.get_xid())
            except Exception:
                pass

        win.connect("map-event", on_map)
        win.show_all()

        log.info("GTK3 Floating correction overlay active on all workspaces.")
        Gtk.main()

    def update(self, state: OverlayState) -> None:
        if not self._window:
            return

        import gi
        gi.require_version("Gtk", "3.0")
        from gi.repository import GLib

        def apply_update():
            if self._lbl_app:
                app_clean = state.active_app.replace(".exe", "").replace(".EXE", "")
                self._lbl_app.set_text(app_clean[:14] if app_clean else "Active App")

            if self._lbl_status:
                ctx = self._lbl_status.get_style_context()
                ctx.remove_class("wa-badge-clean")
                ctx.remove_class("wa-badge-issue")

                if state.issues_count > 0:
                    self._lbl_status.set_text(f"⚠ {state.issues_count} issues")
                    ctx.add_class("wa-badge-issue")
                elif state.status == "checking":
                    self._lbl_status.set_text("Checking...")
                    ctx.add_class("wa-badge-issue")
                elif state.status == "fixed":
                    self._lbl_status.set_text("✓ Corrected!")
                    ctx.add_class("wa-badge-clean")
                else:
                    self._lbl_status.set_text("✓ Ready")
                    ctx.add_class("wa-badge-clean")

            return False

        GLib.idle_add(apply_update)

    def stop(self) -> None:
        if not self._window:
            return
        import gi
        gi.require_version("Gtk", "3.0")
        from gi.repository import GLib, Gtk

        GLib.idle_add(Gtk.main_quit)
        self._window = None
