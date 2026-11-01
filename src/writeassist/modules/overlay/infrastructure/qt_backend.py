"""Qt (PySide6) floating correction overlay for macOS, Windows, and Linux."""

import logging
import sys
import threading
from typing import Callable

from ..domain import OverlayPort, OverlayState
from .workspaces import pin_to_all_workspaces

log = logging.getLogger(__name__)


def is_qt_available() -> bool:
    try:
        from PySide6 import QtCore, QtWidgets  # noqa: F401
        return True
    except Exception as exc:
        log.debug("PySide6 overlay unavailable: %s", exc)
        return False


class QtOverlayAdapter(OverlayPort):
    """Floating transparent window implemented via PySide6."""

    def __init__(self) -> None:
        self._app = None
        self._widget = None
        self._actions: dict[str, Callable[[], None]] = {}

    def is_available(self) -> bool:
        return is_qt_available()

    def start(self, actions: dict[str, Callable[[], None]]) -> None:
        if not self.is_available():
            log.info("Qt not available; Qt overlay adapter skipped.")
            return

        self._actions = actions
        from PySide6 import QtCore, QtGui, QtWidgets

        app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(sys.argv)
        self._app = app
        app.setQuitOnLastWindowClosed(False)

        class FloatingPill(QtWidgets.QWidget):
            def __init__(self, actions: dict):
                super().__init__(
                    None,
                    QtCore.Qt.FramelessWindowHint
                    | QtCore.Qt.WindowStaysOnTopHint
                    | QtCore.Qt.Tool
                    | QtCore.Qt.WindowDoesNotAcceptFocus,
                )
                self.setAttribute(QtCore.Qt.WA_TranslucentBackground)
                self.setAttribute(QtCore.Qt.WA_ShowWithoutActivating)
                if sys.platform == "darwin":
                    self.setAttribute(QtCore.Qt.WA_MacAlwaysShowToolWindow)

                self._actions = actions
                self._drag_pos = None

                layout = QtWidgets.QHBoxLayout(self)
                layout.setContentsMargins(12, 6, 12, 6)
                layout.setSpacing(8)

                self.setStyleSheet("""
                    QWidget {
                        background: rgba(15, 23, 42, 220);
                        border: 1.5px solid rgba(59, 130, 246, 120);
                        border-radius: 18px;
                    }
                    QLabel {
                        border: none;
                        background: transparent;
                        color: #ffffff;
                        font-size: 12px;
                        font-weight: bold;
                    }
                    QPushButton {
                        background: rgba(59, 130, 246, 60);
                        color: #ffffff;
                        border: 1px solid rgba(59, 130, 246, 100);
                        border-radius: 8px;
                        padding: 2px 8px;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    QPushButton:hover {
                        background: rgba(59, 130, 246, 120);
                    }
                """)

                self.lbl_title = QtWidgets.QLabel("✍️ WriteAssist")
                layout.addWidget(self.lbl_title)

                self.lbl_status = QtWidgets.QLabel("✓ Ready")
                layout.addWidget(self.lbl_status)

                btn_fix = QtWidgets.QPushButton("⚡ Fix")
                btn_fix.clicked.connect(lambda: self._actions.get("fix", lambda: None)())
                layout.addWidget(btn_fix)

                btn_rewrite = QtWidgets.QPushButton("✨ AI")
                btn_rewrite.clicked.connect(lambda: self._actions.get("rewrite", lambda: None)())
                layout.addWidget(btn_rewrite)

                btn_open = QtWidgets.QPushButton("📖")
                btn_open.clicked.connect(lambda: self._actions.get("open", lambda: None)())
                layout.addWidget(btn_open)

            def mousePressEvent(self, event):
                if event.button() == QtCore.Qt.LeftButton:
                    self._drag_pos = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
                    event.accept()

            def mouseMoveEvent(self, event):
                if event.buttons() == QtCore.Qt.LeftButton and self._drag_pos:
                    self.move(event.globalPosition().toPoint() - self._drag_pos)
                    event.accept()

        self._widget = FloatingPill(self._actions)
        self._widget.show()
        pin_to_all_workspaces(int(self._widget.winId()))

    def update(self, state: OverlayState) -> None:
        if not self._widget:
            return
        if state.issues_count > 0:
            self._widget.lbl_status.setText(f"⚠ {state.issues_count} issues")
        elif state.status == "fixed":
            self._widget.lbl_status.setText("✓ Corrected!")
        else:
            self._widget.lbl_status.setText("✓ Ready")

    def stop(self) -> None:
        if self._widget:
            self._widget.close()
            self._widget = None
