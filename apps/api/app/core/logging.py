"""Structured logging with request-id correlation and DSN masking (PLAN §5).

Log hygiene: request/response bodies, credentials, and emails are never logged.
The masking filter scrubs postgresql DSN credentials from any log line so a DB
connection error cannot leak a password.
"""

import logging
import re
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_DSN_RE = re.compile(r"(postgresql\+asyncpg://[^:/@\s]+:)([^@\s]+)(@)")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class DsnMaskingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
        except Exception:
            return True
        masked = _DSN_RE.sub(r"\1***\3", msg)
        if masked != msg:
            record.msg = masked
            record.args = ()
        return True


def setup_logging(level: str) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s")
    )
    handler.addFilter(RequestIdFilter())
    handler.addFilter(DsnMaskingFilter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
