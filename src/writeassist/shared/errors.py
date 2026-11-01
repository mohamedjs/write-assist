"""Structured application errors."""

from typing import Any


class AppError(Exception):
    """Base structured error for WriteAssist."""

    def __init__(self, code: str, message: str, retryable: bool = False, cause: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.cause = cause

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": True,
            "code": self.code,
            "message": self.message,
            "retryable": self.retryable,
        }


class NeedsSetup(AppError):
    """Raised when an API key or essential configuration is missing."""

    def __init__(self, message: str) -> None:
        super().__init__(code="NEEDS_SETUP", message=message, retryable=False)


class NetworkError(AppError):
    """Raised when external network services fail."""

    def __init__(self, message: str, cause: Any = None) -> None:
        super().__init__(code="NETWORK_ERROR", message=message, retryable=True, cause=cause)
