import logging
import threading
import time

from fastapi import APIRouter, Response

from database.supabase_client import ping_database

router = APIRouter()
logger = logging.getLogger("health")

#public endpoint, so the database ping is cached briefly: hammering /health
#can't turn into a flood of database queries
PING_CACHE_SECONDS = 10

_ping_cache = {"ok": None, "at": 0.0}
_ping_lock = threading.Lock()


def _database_ok() -> bool:
    with _ping_lock:
        if _ping_cache["ok"] is not None and time.monotonic() - _ping_cache["at"] < PING_CACHE_SECONDS:
            return _ping_cache["ok"]
        try:
            ok = bool(ping_database())
        except Exception as exc:
            logger.warning("/health database ping failed: error=%s", type(exc).__name__)
            ok = False
        _ping_cache["ok"] = ok
        _ping_cache["at"] = time.monotonic()
        return ok


#public and unauthenticated. Deliberately says nothing beyond ok/degraded:
#no hostnames, versions, timings, or error text.
@router.get("/health")
def health(response: Response):
    if _database_ok():
        return {"status": "ok"}
    response.status_code = 503
    return {"status": "degraded"}
