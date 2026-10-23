"""Single source of truth for serializing datetimes to the API.

SQLite stores naive datetimes (UTC). The API must always emit an explicit
timezone so JavaScript never re-interprets them as local time.
"""
from __future__ import annotations

from datetime import datetime, timezone


def to_utc_iso(value: datetime | None) -> str | None:
    """Serialize a datetime as UTC ISO-8601 ending in ``Z``.

    Naive values are assumed to already be UTC (SQLite/SQLAlchemy stores them
    that way). Aware values are converted to UTC first.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")
