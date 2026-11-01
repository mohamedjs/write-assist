"""In-process synchronous EventBus carrying past-tense facts."""

from collections import defaultdict
import logging
from typing import Any, Callable

log = logging.getLogger(__name__)

# Standard Event Facts
SETTINGS_CHANGED = "settings.changed"
DICTIONARY_UPDATED = "dictionary.updated"
SERVICE_STARTED = "service.started"
SERVICE_STOPPED = "service.stopped"
CHECK_COMPLETED = "check.completed"


class EventBus:
    """Synchronous typed pub/sub bus."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[Callable[[dict[str, Any]], None]]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        self._subscribers[event_type].append(handler)

        def unsubscribe() -> None:
            if handler in self._subscribers[event_type]:
                self._subscribers[event_type].remove(handler)

        return unsubscribe

    def publish(self, event_type: str, payload: dict[str, Any] | None = None) -> None:
        data = payload or {}
        for handler in list(self._subscribers.get(event_type, [])):
            try:
                handler(data)
            except Exception as exc:
                log.warning("Event handler for %r failed: %s", event_type, exc, exc_info=True)
