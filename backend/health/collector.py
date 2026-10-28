import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone

import httpx

from database.supabase_client import delete_health_checks_before, insert_health_checks
from health.checks import (
    HTTP_TIMEOUT_SECONDS,
    STATUS_PAGES,
    check_database,
    check_status_page,
)
from health.normalize import failure_result

logger = logging.getLogger("health")

RETENTION_DAYS = 5

#live results are reused for this long, so an auto-refreshing page (or several
#admins at once) doesn't re-run every check and write new rows on each request
CACHE_SECONDS = 30

#results are saved at most this often, no matter how many times the page is
#opened or refreshed, to keep the table small (at most ~576 rows/day)
STORE_INTERVAL_SECONDS = 10 * 60

_cache = {"results": None, "at": 0.0}
_cache_lock = asyncio.Lock()
_last_stored = {"at": None}


def _failure_reason(exc: Exception) -> str:
    if isinstance(exc, (httpx.TimeoutException, asyncio.TimeoutError, TimeoutError)):
        return "timeout"
    if isinstance(exc, httpx.HTTPStatusError):
        return "http_error"
    if isinstance(exc, httpx.RequestError):
        return "unreachable"
    #json.JSONDecodeError is a ValueError
    if isinstance(exc, ValueError):
        return "bad_response"
    return "error"


#runs one check and turns any exception into a normalized failure row, so one
#broken source can never stop the others. Logs only the service and exception
#class: exception text can include URLs or response bodies.
async def _guarded(service, check_type, failure_status, check):
    try:
        return await check()
    except Exception as exc:
        reason = _failure_reason(exc)
        logger.warning("health check failed: service=%s reason=%s error=%s",
                       service, reason, type(exc).__name__)
        return failure_result(service, check_type, failure_status, reason)


async def run_all_checks(client: httpx.AsyncClient | None = None):
    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(
            timeout=httpx.Timeout(HTTP_TIMEOUT_SECONDS),
            follow_redirects=False,
            headers={"User-Agent": "Interventioner-health-check"},
        )
    try:
        checks = [
            #if we can't reach our own database, that's an outage, not "unknown"
            _guarded("database", "db_ping", "down", check_database),
            *(
                _guarded(source.service, "status_page", "unknown",
                         lambda source=source: check_status_page(client, source))
                for source in STATUS_PAGES
            ),
        ]
        return list(await asyncio.gather(*checks))
    finally:
        if owns_client:
            await client.aclose()


def _store_due() -> bool:
    last = _last_stored["at"]
    return last is None or time.monotonic() - last >= STORE_INTERVAL_SECONDS


#runs every check and, if STORE_INTERVAL_SECONDS has passed, stores the results
#and prunes old rows. Storage problems are logged but never hide the live
#results from the caller.
async def collect_and_store(client: httpx.AsyncClient | None = None):
    results = await run_all_checks(client)
    if not _store_due():
        return results
    try:
        await asyncio.to_thread(insert_health_checks, results)
        _last_stored["at"] = time.monotonic()
    except Exception as exc:
        #not marked as stored, so the next request tries again
        logger.warning("health check insert failed: error=%s", type(exc).__name__)
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
        await asyncio.to_thread(delete_health_checks_before, cutoff.isoformat())
    except Exception as exc:
        logger.warning("health check retention failed: error=%s", type(exc).__name__)
    return results


async def get_live_results():
    async with _cache_lock:
        fresh = time.monotonic() - _cache["at"] < CACHE_SECONDS
        if _cache["results"] is None or not fresh:
            _cache["results"] = await collect_and_store()
            _cache["at"] = time.monotonic()
        return _cache["results"]


def clear_cache():
    _cache["results"] = None
    _cache["at"] = 0.0
    _last_stored["at"] = None
