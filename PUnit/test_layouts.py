import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import layouts


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(layouts.router)
    app.dependency_overrides[layouts.get_current_user] = lambda: {
        "id": 1,
        "public_id": "user-123",
        "role": "interventionist",
    }

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_get_layout_returns_saved_layout_for_signed_in_user(client, monkeypatch):
    calls = []

    def fake_fetch(user_id, page_key):
        calls.append((user_id, page_key))
        return {"layout": {"order": ["a", "b"]}, "updated_at": "2026-11-09T00:00:00Z"}

    monkeypatch.setattr(layouts, "fetch_user_layout", fake_fetch)

    response = client.get("/layouts/dashboard")

    assert response.status_code == 200
    assert response.json() == {
        "layout": {"order": ["a", "b"]},
        "updated_at": "2026-11-09T00:00:00Z",
    }
    assert calls == [("user-123", "dashboard")]


def test_get_layout_returns_null_when_nothing_saved(client, monkeypatch):
    monkeypatch.setattr(layouts, "fetch_user_layout", lambda *_args: None)

    response = client.get("/layouts/student-42")

    assert response.status_code == 200
    assert response.json() == {"layout": None, "updated_at": None}


def test_save_layout_upserts_for_token_user_only(client, monkeypatch):
    saved = []

    def fake_upsert(user_id, page_key, layout):
        saved.append((user_id, page_key, layout))
        return {"layout": layout, "updated_at": "now"}

    monkeypatch.setattr(layouts, "upsert_user_layout", fake_upsert)

    response = client.put(
        "/layouts/dashboard",
        json={"layout": {"order": ["x"], "sizes": {}}, "user_id": "someone-else"},
    )

    assert response.status_code == 200
    assert saved == [("user-123", "dashboard", {"order": ["x"], "sizes": {}})]


def test_save_layout_rejects_oversized_layout(client, monkeypatch):
    monkeypatch.setattr(
        layouts,
        "upsert_user_layout",
        lambda *_args: pytest.fail("oversized layout should not be saved"),
    )

    response = client.put(
        "/layouts/dashboard",
        json={"layout": {"order": ["x" * (layouts.MAX_LAYOUT_BYTES + 1)]}},
    )

    assert response.status_code == 413


def test_save_layout_requires_object_layout(client):
    response = client.put("/layouts/dashboard", json={"layout": ["not", "a", "dict"]})

    assert response.status_code == 422


@pytest.mark.parametrize("page_key", ["bad key", "a" * 101, "dash.board"])
def test_invalid_page_keys_are_rejected(client, monkeypatch, page_key):
    monkeypatch.setattr(layouts, "fetch_user_layout", lambda *_args: None)

    response = client.get(f"/layouts/{page_key}")

    assert response.status_code == 422


def test_reset_layout_deletes_for_token_user(client, monkeypatch):
    deleted = []
    monkeypatch.setattr(
        layouts,
        "delete_user_layout",
        lambda user_id, page_key: deleted.append((user_id, page_key)) or True,
    )

    response = client.delete("/layouts/dashboard")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert deleted == [("user-123", "dashboard")]
