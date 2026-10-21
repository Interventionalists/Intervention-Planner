# ------------------------------------------------------------------------------
#
# Name:        test_system_health.py
# Purpose:     Tests for /health, /admin/system-health and the health checks.
#              Every outside call (status pages, Supabase) is mocked.
#
# ------------------------------------------------------------------------------

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

import main
from auth.security import create_access_token
from health import checks, collector
from health.normalize import make_result, normalize_statuspage, sanitize_details
from routes import health as health_route
from routes import system_health as system_health_route


def statuspage(indicator="none", components=(), incidents=()):
    return {
        "page": {"id": "abc", "name": "Provider", "url": "https://internal.example"},
        "status": {"indicator": indicator, "description": "All Systems Operational"},
        "components": list(components),
        "incidents": list(incidents),
    }


def component(cid, name, status="operational", group=False, group_id=None):
    return {"id": cid, "name": name, "status": status, "group": group, "group_id": group_id}


def token_for(role):
    return create_access_token({"public_id": "pub-1", "id": 1, "role": role})


@pytest.fixture(autouse=True)
def reset_caches():
    collector.clear_cache()
    health_route._ping_cache.update({"ok": None, "at": 0.0})
    yield
    collector.clear_cache()


# ------------------------------- normalization -------------------------------

def test_watched_components_ignore_unrelated_outages():
    # Cloudflare-style page: a PoP is down (page indicator "major") but the
    # components we use are fine, so we should report ok.
    payload = statuspage(
        indicator="major",
        components=[
            component("w", "Workers"),
            component("p", "Some City PoP", "major_outage"),
        ],
    )
    result = normalize_statuspage("cloudflare", payload, components=("Workers",))
    assert result["status"] == "ok"
    assert result["check_type"] == "status_page"


def test_watched_component_outage_is_reported_with_incident():
    payload = statuspage(
        components=[component("w", "Workers", "partial_outage"), component("d", "DNS")],
        incidents=[
            {"name": "Workers errors", "components": [{"id": "w"}]},
            {"name": "DNS issue", "components": [{"id": "d"}]},
        ],
    )
    result = normalize_statuspage("cloudflare", payload, components=("Workers",))
    assert result["status"] == "degraded"
    assert result["details"]["affected_components"] == ["Workers"]
    assert result["details"]["incidents"] == ["Workers errors"]


def test_group_filter_only_counts_that_region():
    payload = statuspage(components=[
        component("g1", "Oregon", group=True),
        component("g2", "Frankfurt", group=True),
        component("a", "Web Services - Free Tier", "operational", group_id="g1"),
        component("b", "Web Services - Free Tier", "major_outage", group_id="g2"),
    ])
    oregon = normalize_statuspage("render", payload, ("Web Services - Free Tier",), "Oregon")
    frankfurt = normalize_statuspage("render", payload, ("Web Services - Free Tier",), "Frankfurt")
    assert oregon["status"] == "ok"
    assert frankfurt["status"] == "down"


def test_page_indicator_used_when_no_components_given():
    assert normalize_statuspage("supabase", statuspage("none"))["status"] == "ok"
    assert normalize_statuspage("supabase", statuspage("minor"))["status"] == "degraded"
    assert normalize_statuspage("supabase", statuspage("critical"))["status"] == "down"
    assert normalize_statuspage("supabase", statuspage("weird"))["status"] == "unknown"


def test_missing_component_or_bad_payload_is_unknown():
    missing = normalize_statuspage("cloudflare", statuspage(), components=("Workers",))
    assert missing["status"] == "unknown"
    assert missing["details"] == {"reason": "not_found"}

    bad = normalize_statuspage("supabase", ["not", "a", "dict"])
    assert bad["status"] == "unknown"
    assert bad["details"] == {"reason": "bad_response"}


def test_unrecognized_component_status_is_unknown():
    payload = statuspage(components=[component("w", "Workers", "on_fire")])
    assert normalize_statuspage("cloudflare", payload, ("Workers",))["status"] == "unknown"


def test_make_result_shape_and_coercion():
    result = make_result("database", "db_ping", "bogus", latency_ms=12.6)
    assert set(result) == {"service", "check_type", "status", "latency_ms", "details", "checked_at"}
    assert result["status"] == "unknown"
    assert result["latency_ms"] == 13
    assert make_result("x", "y", "ok", latency_ms=-5)["latency_ms"] is None


def test_sanitize_details_is_an_allowlist():
    dirty = {
        "reason": "Traceback: secret at db.internal",
        "description": "x" * 1000,
        "incidents": ["ok incident", 42, None, {"nested": "dict"}],
        "page": {"url": "https://internal.example"},
        "token": "sk-123",
    }
    clean = sanitize_details(dirty)
    assert set(clean) == {"description", "incidents"}
    assert len(clean["description"]) == 160
    assert clean["incidents"] == ["ok incident"]


# ---------------------- one source failing, others continue ---------------------

def test_one_failing_source_does_not_stop_the_others(monkeypatch):
    def handler(request: httpx.Request):
        host = request.url.host
        if host == "status.supabase.com":
            return httpx.Response(200, json=statuspage("none"))
        if host == "www.cloudflarestatus.com":
            raise httpx.ConnectError("boom: internal-host.example:5432", request=request)
        if host == "status.render.com":
            return httpx.Response(500, text="<html>stack trace secret</html>")
        raise AssertionError(f"unexpected request to {host}")

    def broken_db():
        raise RuntimeError("password=hunter2 at db.internal")

    monkeypatch.setattr(checks, "ping_database", broken_db)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await collector.run_all_checks(client)

    results = {r["service"]: r for r in asyncio.run(run())}

    assert set(results) == {"database", "supabase", "cloudflare", "render"}
    assert results["supabase"]["status"] == "ok"
    assert results["database"]["status"] == "down"
    assert results["cloudflare"]["status"] == "unknown"
    assert results["cloudflare"]["details"] == {"reason": "unreachable"}
    assert results["render"]["status"] == "unknown"
    assert results["render"]["details"] == {"reason": "http_error"}

    # no exception text, hosts or bodies leak into the results
    dumped = json.dumps(results)
    for secret in ("hunter2", "internal", "stack trace", "boom"):
        assert secret not in dumped


def test_slow_status_page_times_out_as_unknown(monkeypatch):
    def handler(request: httpx.Request):
        if request.url.host == "status.supabase.com":
            raise httpx.ReadTimeout("timed out", request=request)
        return httpx.Response(200, json=statuspage("none"))

    monkeypatch.setattr(checks, "ping_database", lambda: True)

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await collector.run_all_checks(client)

    results = {r["service"]: r for r in asyncio.run(run())}
    assert results["supabase"]["details"] == {"reason": "timeout"}
    assert results["database"]["status"] == "ok"


def test_storage_failure_still_returns_live_results(monkeypatch):
    async def fake_run_all_checks(client=None):
        return [make_result("database", "db_ping", "ok", 5)]

    def broken_insert(rows):
        raise RuntimeError("db down")

    monkeypatch.setattr(collector, "run_all_checks", fake_run_all_checks)
    monkeypatch.setattr(collector, "insert_health_checks", broken_insert)
    monkeypatch.setattr(collector, "delete_health_checks_before", lambda cutoff: None)

    results = asyncio.run(collector.collect_and_store())
    assert results[0]["status"] == "ok"


def test_results_are_stored_at_most_once_per_interval(monkeypatch):
    async def fake_run_all_checks(client=None):
        return [make_result("database", "db_ping", "ok", 5)]

    inserts = []
    attempts = {"fail": True}

    def flaky_insert(rows):
        if attempts["fail"]:
            attempts["fail"] = False
            raise RuntimeError("db down")
        inserts.append(rows)

    monkeypatch.setattr(collector, "run_all_checks", fake_run_all_checks)
    monkeypatch.setattr(collector, "insert_health_checks", flaky_insert)
    monkeypatch.setattr(collector, "delete_health_checks_before", lambda cutoff: None)

    asyncio.run(collector.collect_and_store())  # insert fails: not counted as stored
    asyncio.run(collector.collect_and_store())  # retried and stored
    asyncio.run(collector.collect_and_store())  # within the interval: skipped
    assert len(inserts) == 1

    # once the interval has passed, it stores again
    collector._last_stored["at"] -= collector.STORE_INTERVAL_SECONDS
    asyncio.run(collector.collect_and_store())
    assert len(inserts) == 2


# ----------------------------------- /health ----------------------------------

def test_health_ok_body_is_minimal(monkeypatch):
    monkeypatch.setattr(health_route, "ping_database", lambda: True)
    response = TestClient(main.app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_degraded_body_is_minimal(monkeypatch):
    def broken():
        raise RuntimeError("could not connect to db.abcdefgh.supabase.co")

    monkeypatch.setattr(health_route, "ping_database", broken)
    response = TestClient(main.app).get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "degraded"}
    assert "supabase" not in response.text


def test_health_needs_no_auth(monkeypatch):
    monkeypatch.setattr(health_route, "ping_database", lambda: True)
    response = TestClient(main.app).get("/health", headers={"Authorization": "Bearer garbage"})
    assert response.status_code == 200


# ---------------------------- /admin/system-health ----------------------------

@pytest.fixture
def fake_health_data(monkeypatch):
    async def fake_live_results():
        return [
            make_result("database", "db_ping", "ok", 42),
            make_result("cloudflare", "status_page", "unknown", None, {"reason": "timeout"}),
        ]

    history_rows = [
        {"service": "database", "check_type": "db_ping", "status": "ok",
         "latency_ms": 40, "details": {}, "checked_at": "2026-10-19T10:05:00+00:00"},
        {"service": "database", "check_type": "db_ping", "status": "ok",
         "latency_ms": 38, "details": {}, "checked_at": "2026-10-19T10:00:00+00:00"},
    ]
    event_rows = [
        {"service": "render", "check_type": "status_page", "status": "degraded",
         "latency_ms": 90, "details": {"incidents": ["Deploys delayed"], "raw": "leak"},
         "checked_at": "2026-10-19T09:00:00+00:00"},
    ]
    monkeypatch.setattr(system_health_route, "get_live_results", fake_live_results)
    monkeypatch.setattr(system_health_route, "fetch_health_history", lambda service, since: history_rows)
    monkeypatch.setattr(system_health_route, "fetch_health_events", lambda since: event_rows)


def test_system_health_rejects_unauthenticated(fake_health_data):
    response = TestClient(main.app).get("/admin/system-health")
    assert response.status_code == 401


def test_system_health_rejects_bad_token(fake_health_data):
    response = TestClient(main.app).get(
        "/admin/system-health", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize("role", ["teacher", "interventionist", None])
def test_system_health_rejects_non_admins(fake_health_data, role):
    response = TestClient(main.app).get(
        "/admin/system-health", headers={"Authorization": f"Bearer {token_for(role)}"}
    )
    assert response.status_code == 403


def test_system_health_returns_sanitized_data_for_admin(fake_health_data):
    response = TestClient(main.app).get(
        "/admin/system-health", headers={"Authorization": f"Bearer {token_for('admin')}"}
    )
    assert response.status_code == 200
    body = response.json()

    assert {s["service"] for s in body["services"]} == {"database", "cloudflare"}
    assert body["history_available"] is True
    # history comes back oldest first for charting
    assert [p["latency_ms"] for p in body["latency_history"]] == [38, 40]
    assert body["events"][0]["details"] == {"incidents": ["Deploys delayed"]}
    assert "leak" not in response.text


def test_system_health_still_works_when_history_read_fails(fake_health_data, monkeypatch):
    def broken(*args):
        raise RuntimeError("relation health_checks does not exist")

    monkeypatch.setattr(system_health_route, "fetch_health_history", broken)
    response = TestClient(main.app).get(
        "/admin/system-health", headers={"Authorization": f"Bearer {token_for('admin')}"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["history_available"] is False
    assert body["latency_history"] == []
    assert len(body["services"]) == 2
    assert "relation" not in response.text
