import asyncio
import os
import time
from dataclasses import dataclass

from database.supabase_client import ping_database
from health.normalize import make_result, normalize_statuspage

#timeouts for every outbound call, in seconds
HTTP_TIMEOUT_SECONDS = 5.0
DB_TIMEOUT_SECONDS = 5.0

#a database round trip slower than this is reported as degraded
DB_SLOW_MS = 1500


@dataclass(frozen=True)
class StatusPageSource:
    service: str
    url: str
    components: tuple = ()
    group: str | None = None


#public Atlassian Statuspage feeds; no credentials needed. URLs are fixed here,
#never taken from a request, so the collector can't be pointed anywhere else.
#Render region is the one the backend service was created in (Render dashboard
#-> service -> Settings -> Region).
STATUS_PAGES = (
    StatusPageSource(
        service="supabase",
        url="https://status.supabase.com/api/v2/summary.json",
    ),
    StatusPageSource(
        service="cloudflare",
        url="https://www.cloudflarestatus.com/api/v2/summary.json",
        components=("Workers", "Workers Assets", "Workers Builds", "CDN/Cache"),
    ),
    StatusPageSource(
        service="render",
        url="https://status.render.com/api/v2/summary.json",
        components=("Web Services - Free Tier", "Builds and Deploys"),
        group=os.environ.get("HEALTH_RENDER_REGION", "Oregon"),
    ),
)


async def check_status_page(client, source: StatusPageSource):
    started = time.perf_counter()
    response = await client.get(source.url)
    latency_ms = (time.perf_counter() - started) * 1000
    response.raise_for_status()
    return normalize_statuspage(
        source.service,
        response.json(),
        components=source.components,
        group=source.group,
        latency_ms=latency_ms,
    )


#round trip from this backend to Supabase Postgres
async def check_database():
    started = time.perf_counter()
    await asyncio.wait_for(asyncio.to_thread(ping_database), timeout=DB_TIMEOUT_SECONDS)
    latency_ms = (time.perf_counter() - started) * 1000
    status = "degraded" if latency_ms > DB_SLOW_MS else "ok"
    return make_result("database", "db_ping", status, latency_ms)
