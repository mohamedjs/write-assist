"""Unit tests for the overlay bounded module."""

from writeassist.modules.overlay import (
    NullOverlayAdapter,
    OverlayService,
    OverlayState,
    create_default_overlay_adapter,
)


def test_overlay_state():
    state = OverlayState(active_app="WINWORD.EXE", status="issues", issues_count=3)
    d = state.to_dict()
    assert d["active_app"] == "WINWORD.EXE"
    assert d["status"] == "issues"
    assert d["issues_count"] == 3


def test_overlay_service_with_null_adapter():
    adapter = NullOverlayAdapter()
    assert not adapter.is_available()

    actions_triggered = []
    service = OverlayService(
        port=adapter,
        on_action={
            "fix": lambda: actions_triggered.append("fix"),
            "rewrite": lambda: actions_triggered.append("rewrite"),
        },
    )

    assert not service.is_available()
    service.start()
    service.update_status(active_app="Excel", status="ready", issues_count=0)
    assert service.current.active_app == "Excel"
    assert service.current.status == "ready"
    service.stop()


def test_default_adapter_creation():
    adapter = create_default_overlay_adapter()
    assert adapter is not None


if __name__ == "__main__":
    test_overlay_state()
    test_overlay_service_with_null_adapter()
    test_default_adapter_creation()
    print("test_overlay PASSED")
