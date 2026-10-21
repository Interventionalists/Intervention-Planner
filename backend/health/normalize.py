from datetime import datetime, timezone

#every check result, stored or returned, is reduced to this shape:
#service, check_type, status, latency_ms, details, checked_at
STATUSES = ("ok", "degraded", "down", "unknown")
SEVERITY = {"ok": 0, "unknown": 1, "degraded": 2, "down": 3}

#why a check could not produce a real status. Only these fixed strings are ever
#stored or shown, never exception text, URLs, or provider error bodies.
FAILURE_REASONS = ("timeout", "unreachable", "http_error", "bad_response", "not_found", "error")

#Atlassian Statuspage component statuses and page-level indicators
COMPONENT_STATUS = {
    "operational": "ok",
    "degraded_performance": "degraded",
    "partial_outage": "degraded",
    "under_maintenance": "degraded",
    "major_outage": "down",
}
PAGE_INDICATOR = {
    "none": "ok",
    "minor": "degraded",
    "maintenance": "degraded",
    "major": "down",
    "critical": "down",
}

MAX_TEXT = 160
MAX_ITEMS = 10


def _clean_text(value):
    if not isinstance(value, str):
        return None
    #collapse whitespace/control characters and cap the length
    text = " ".join(value.split())
    return text[:MAX_TEXT] or None


def _clean_text_list(values):
    if not isinstance(values, (list, tuple)):
        return []
    cleaned = (_clean_text(value) for value in values)
    return [value for value in cleaned if value][:MAX_ITEMS]


#allowlist sanitizer: anything not listed here is dropped, so a raw provider
#payload can never pass through to the database or the browser by accident.
def sanitize_details(details):
    if not isinstance(details, dict):
        return {}
    clean = {}
    if details.get("reason") in FAILURE_REASONS:
        clean["reason"] = details["reason"]
    if details.get("indicator") in PAGE_INDICATOR:
        clean["indicator"] = details["indicator"]
    description = _clean_text(details.get("description"))
    if description:
        clean["description"] = description
    for key in ("affected_components", "incidents"):
        items = _clean_text_list(details.get(key))
        if items:
            clean[key] = items
    return clean


def worst_status(statuses):
    statuses = list(statuses)
    if not statuses:
        return "unknown"
    return max(statuses, key=lambda status: SEVERITY.get(status, SEVERITY["unknown"]))


def make_result(service, check_type, status, latency_ms=None, details=None, checked_at=None):
    if status not in STATUSES:
        status = "unknown"
    if isinstance(latency_ms, (int, float)) and latency_ms >= 0:
        latency_ms = int(round(latency_ms))
    else:
        latency_ms = None
    if checked_at is None:
        checked_at = datetime.now(timezone.utc).isoformat()
    return {
        "service": str(service)[:64],
        "check_type": str(check_type)[:64],
        "status": status,
        "latency_ms": latency_ms,
        "details": sanitize_details(details),
        "checked_at": checked_at,
    }


def failure_result(service, check_type, status, reason, latency_ms=None):
    return make_result(service, check_type, status, latency_ms, {"reason": reason})


#turns an Atlassian Statuspage /api/v2/summary.json payload into one result.
#
#components: optional names to watch (e.g. Cloudflare "Workers"). Big providers
#list hundreds of components, so the page-level indicator is usually "something
#somewhere is broken" and not about us. When given, only these count.
#group: optional component-group name (e.g. a Render region) the watched
#components must belong to.
def normalize_statuspage(service, payload, components=None, group=None, latency_ms=None):
    check_type = "status_page"
    if not isinstance(payload, dict) or not isinstance(payload.get("status"), dict):
        return failure_result(service, check_type, "unknown", "bad_response", latency_ms)

    indicator = payload["status"].get("indicator")
    all_components = [c for c in payload.get("components") or [] if isinstance(c, dict)]
    open_incidents = [i for i in payload.get("incidents") or [] if isinstance(i, dict)]

    if not components:
        status = PAGE_INDICATOR.get(indicator, "unknown")
        details = {
            "indicator": indicator,
            "description": payload["status"].get("description"),
            "affected_components": [
                c.get("name") for c in all_components
                if not c.get("group") and c.get("status") != "operational"
            ],
            "incidents": [i.get("name") for i in open_incidents],
        }
        return make_result(service, check_type, status, latency_ms, details)

    group_id = None
    if group:
        group_id = next(
            (c.get("id") for c in all_components if c.get("group") and c.get("name") == group),
            None,
        )
        if group_id is None:
            return failure_result(service, check_type, "unknown", "not_found", latency_ms)

    watched = [
        c for c in all_components
        if c.get("name") in components
        and not c.get("group")
        and (group_id is None or c.get("group_id") == group_id)
    ]
    if not watched:
        return failure_result(service, check_type, "unknown", "not_found", latency_ms)

    status = worst_status(COMPONENT_STATUS.get(c.get("status"), "unknown") for c in watched)
    watched_ids = {c.get("id") for c in watched}
    details = {
        "affected_components": [
            c.get("name") for c in watched if c.get("status") != "operational"
        ],
        #only incidents that name one of the watched components
        "incidents": [
            i.get("name") for i in open_incidents
            if any(
                isinstance(c, dict) and c.get("id") in watched_ids
                for c in i.get("components") or []
            )
        ],
    }
    return make_result(service, check_type, status, latency_ms, details)
