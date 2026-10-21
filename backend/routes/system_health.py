import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from database.supabase_client import fetch_health_events, fetch_health_history
from health.collector import get_live_results
from health.normalize import make_result

router = APIRouter()
logger = logging.getLogger("health")

HISTORY_HOURS = 24
EVENTS_DAYS = 5


#re-shapes a stored or live row through the same allowlist used on write, so
#only normalized fields ever reach the browser
def _public_row(row: dict) -> dict:
    return make_result(
        row.get("service"),
        row.get("check_type"),
        row.get("status"),
        row.get("latency_ms"),
        row.get("details"),
        row.get("checked_at"),
    )


#admin only: enforced by Depends(require_admin) where this router is included in
#main.py. Runs the checks live (cached for a short time) and returns stored history.
@router.get("/admin/system-health")
async def get_system_health():
    now = datetime.now(timezone.utc)
    services = [_public_row(row) for row in await get_live_results()]

    history_available = True
    try:
        history, events = await asyncio.gather(
            asyncio.to_thread(
                fetch_health_history,
                "database",
                (now - timedelta(hours=HISTORY_HOURS)).isoformat(),
            ),
            asyncio.to_thread(
                fetch_health_events,
                (now - timedelta(days=EVENTS_DAYS)).isoformat(),
            ),
        )
    except Exception as exc:
        logger.warning("health history read failed: error=%s", type(exc).__name__)
        history, events, history_available = [], [], False

    return {
        "generated_at": now.isoformat(),
        "services": services,
        #oldest first, ready to chart
        "latency_history": [
            {"checked_at": row["checked_at"], "status": row["status"], "latency_ms": row["latency_ms"]}
            for row in map(_public_row, reversed(history or []))
        ],
        "events": [_public_row(row) for row in events or []],
        "history_available": history_available,
    }
