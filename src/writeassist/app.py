"""CLI entrypoint and command router for WriteAssist."""

import argparse
import logging
import signal
import sys
import threading

from . import __app_name__, __version__

log = logging.getLogger("writeassist")


def _setup_logging(verbose: bool = False) -> None:
    from logging.handlers import RotatingFileHandler

    from .shared import paths

    handlers: list[logging.Handler] = [logging.StreamHandler()]
    try:
        paths.log_dir().mkdir(parents=True, exist_ok=True)
        log_file = paths.log_dir() / "writeassist.log"
        handlers.append(
            RotatingFileHandler(log_file, maxBytes=1_000_000, backupCount=2, encoding="utf-8")
        )
    except Exception:
        pass

    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        handlers=handlers,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def cmd_run(args) -> int:
    """Run the background daemon service."""
    from .bootstrap import build
    from .modules.dashboard import app_window_or_browser, running_url

    # Check if another daemon is already running
    alive_url = running_url(args.port)
    if alive_url:
        print(f"WriteAssist is already running at {alive_url}")
        if not args.no_window:
            app_window_or_browser(alive_url)
        return 0

    c = build()
    if args.port:
        c.settings.update({"port": args.port})

    try:
        c.server.start()
    except OSError as exc:
        print(f"Error: port {c.settings.current.port} is busy ({exc}).", file=sys.stderr)
        return 1

    print(f"{__app_name__} v{__version__} daemon started at {c.server.url}")

    # Start floating overlay if available and requested
    use_overlay = getattr(args, "overlay", False) and not getattr(args, "no_overlay", False)
    if use_overlay and c.overlay.is_available():
        print("Starting floating correction overlay across all monitors and workspaces...")
        c.overlay.start()

    # Open window unless explicitly told not to (e.g. autostart / systemd service)
    if not args.no_window:
        app_window_or_browser(c.server.url)

    stop_event = threading.Event()

    def handle_signal(sig, frame):
        log.info("Shutdown signal received")
        stop_event.set()

    signal.signal(signal.SIGINT, handle_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, handle_signal)

    try:
        stop_event.wait()
    finally:
        if use_overlay and c.overlay.is_available():
            c.overlay.stop()
        c.server.stop()
        print("WriteAssist stopped.")

    return 0


def cmd_overlay(args) -> int:
    """Launch floating correction overlay HUD on top of all desktop apps."""
    from .bootstrap import build

    c = build()
    if not c.overlay.is_available():
        print("Floating overlay is not available on this desktop (requires GTK3 or PySide6).", file=sys.stderr)
        return 1

    print("WriteAssist Floating Correction Overlay running...")
    print("Pinned across all monitors & virtual workspaces above Word, Excel, Notes, and Desktop apps.")
    print("Press Ctrl+C to close.")
    c.overlay.start()
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        c.overlay.stop()
        print("\nOverlay closed.")
    return 0


def cmd_dashboard(args) -> int:
    """Open the native desktop dashboard window."""
    from .bootstrap import build
    from .modules.dashboard import app_window_or_browser, running_url, show_window

    port = args.port or 43817
    alive = running_url(port)
    if alive:
        app_window_or_browser(alive)
        return 0

    # If daemon is not running, run a standalone dashboard server while window is open
    c = build()
    c.server.start()
    print(f"Opening desktop dashboard at {c.server.url}")
    try:
        show_window(c.server.url)
    finally:
        c.server.stop()
    return 0


def cmd_window(args) -> int:
    """Open a chromeless native window for a given URL."""
    from .modules.dashboard import show_window

    url = args.url
    show_window(url)
    return 0


def cmd_doctor(args) -> int:
    """Run self-test diagnostics."""
    from .bootstrap import build
    from .selftest import print_doctor

    c = build()
    return print_doctor(c.settings.current)


def cmd_assist(args) -> int:
    """Check, fix, or rewrite text in the currently active OS application."""
    from .bootstrap import build

    c = build()
    action = args.action or "fix"
    tone = args.tone or "clear"
    target = args.target or "en"
    in_place = not args.copy_only

    print(f"Checking text in active desktop application...")
    res = c.system_assist.assist_active_app(action=action, tone=tone, target_lang=target, in_place=in_place)

    if not res.success:
        print(f"[{res.active_app}] Assist failed: {res.error_message}", file=sys.stderr)
        return 1

    print(f"[{res.active_app}] Action: {res.action} · Issues found: {res.issue_count}")
    if in_place:
        print(f"Successfully replaced text directly inside {res.active_app}!")
    else:
        print(f"Copied improved text to clipboard:")
        print(res.improved_text)
    return 0


def cmd_watch(args) -> int:
    """Watch clipboard in background and assist whenever text is copied across OS apps."""
    from .bootstrap import build

    c = build()
    print("WriteAssist OS Watcher running... (Press Ctrl+C to stop)")
    print("Write in any app (Notes, Word, Excel, Slack) and copy text to get instant assistance.")

    def on_clip(app: str, text: str):
        print(f"\n[Detected in {app}]: \"{text[:60]}...\"")
        res = c.assistant.check_grammar(text)
        count = len(res.matches)
        print(f"  -> Found {count} issues.")
        if count > 0:
            for m in res.matches[:3]:
                print(f"     • {m.message} (suggestions: {', '.join(m.replacements[:3])})")

    c.system_assist.start_watcher(on_clip)
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        c.system_assist.stop_watcher()
        print("\nWatcher stopped.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="writeassist",
        description="WriteAssist — AI writing, grammar, rewrite, and translation desktop assistant.",
    )
    parser.add_argument("--version", action="version", version=f"{__app_name__} {__version__}")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose debug logging")

    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # run
    p_run = subparsers.add_parser("run", help="Run background daemon service")
    p_run.add_argument("--no-window", action="store_true", help="Do not open desktop dashboard window")
    p_run.add_argument("--overlay", action="store_true", help="Launch floating correction overlay HUD on top of all apps")
    p_run.add_argument("--no-overlay", action="store_true", help="Do not launch floating overlay HUD")
    p_run.add_argument("--port", type=int, default=43817, help="Loopback port to bind (default: 43817)")

    # overlay
    subparsers.add_parser("overlay", help="Launch floating correction overlay HUD on top of all desktop apps")

    # dashboard
    p_dash = subparsers.add_parser("dashboard", help="Open the desktop dashboard window")
    p_dash.add_argument("--port", type=int, default=43817, help="Port to connect to")

    # window
    p_win = subparsers.add_parser("window", help="Open a chromeless native window for URL")
    p_win.add_argument("url", help="URL to open")

    # doctor / selftest
    subparsers.add_parser("doctor", help="Run system diagnostics and verify dependencies")
    subparsers.add_parser("selftest", help="Alias for doctor")

    # assist (OS wide active app)
    p_ast = subparsers.add_parser("assist", help="Check, fix, or rewrite text in the currently active OS application")
    p_ast.add_argument("--action", choices=["fix", "rewrite", "translate"], default="fix", help="Assistance action")
    p_ast.add_argument("--tone", default="clear", help="Tone for AI rewrite (e.g. professional, friendly, formal)")
    p_ast.add_argument("--target", default="en", help="Target language for translation (default: en)")
    p_ast.add_argument("--copy-only", action="store_true", help="Copy result to clipboard without replacing in-place")

    # watch (OS wide background listener)
    subparsers.add_parser("watch", help="Monitor clipboard and writing in background across all OS applications")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    _setup_logging(args.verbose)

    if not args.command:
        # Default behavior: run daemon or open dashboard
        args.no_window = False
        args.port = 43817
        return cmd_run(args)

    if args.command == "run":
        return cmd_run(args)
    if args.command == "overlay":
        return cmd_overlay(args)
    if args.command == "dashboard":
        return cmd_dashboard(args)
    if args.command == "window":
        return cmd_window(args)
    if args.command in ("doctor", "selftest"):
        return cmd_doctor(args)
    if args.command == "assist":
        return cmd_assist(args)
    if args.command == "watch":
        return cmd_watch(args)

    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
