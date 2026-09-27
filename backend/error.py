"""Error definitions for the Intervention Planner backend.

This module keeps a consistent set of business/API error codes and reusable
custom exceptions so logging and API responses can stay uniform across the app.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class AppError(Exception):
    """Base class for application-level exceptions.

    Attributes:
        code: Stable machine-readable code to use in logs and API payloads.
        message: Human-readable summary of the problem.
        status_code: HTTP status code for API responses.
        details: Optional structured metadata for debugging or frontend handling.
    """

    code: str = "GEN_000"
    status_code: int = 500

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.message = message
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.details = details or {}
        super().__init__(message)

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            payload["details"] = self.details
        return payload


class ValidationError(AppError):
    code = "VALIDATION_001"
    status_code = 400


class UnauthorizedError(AppError):
    code = "AUTH_001"
    status_code = 401


class ForbiddenError(AppError):
    code = "AUTH_002"
    status_code = 403


class NotFoundError(AppError):
    code = "NOT_FOUND_001"
    status_code = 404


class ConflictError(AppError):
    code = "CONFLICT_001"
    status_code = 409


class DatabaseError(AppError):
    code = "DB_001"
    status_code = 500


class ExternalServiceError(AppError):
    code = "EXTERNAL_001"
    status_code = 502


ERROR_CODES = {
    "GEN_000": "Unexpected internal server error",
    "VALIDATION_001": "Request validation failed",
    "AUTH_001": "Authentication required",
    "AUTH_002": "Permission denied",
    "NOT_FOUND_001": "Resource not found",
    "CONFLICT_001": "Resource conflict",
    "DB_001": "Database operation failed",
    "EXTERNAL_001": "External service request failed",
}


__all__ = [
    "AppError",
    "ValidationError",
    "UnauthorizedError",
    "ForbiddenError",
    "NotFoundError",
    "ConflictError",
    "DatabaseError",
    "ExternalServiceError",
    "ERROR_CODES",
]
