# ------------------------------------------------------------------------------
#
# Name:        test_admins.py
# Purpose:     check the admin user-directory routes. These routes are only
#              mounted behind require_admin in main.py (see test_app_wiring.py).
#
# ------------------------------------------------------------------------------

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import admins


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(admins.router)
    with TestClient(app) as test_client:
        yield test_client


VALID_USER = {
    "first_name": "Ada",
    "last_name": "Admin",
    "email": "ada@example.com",
    "role": "teacher",
    "school": 2,
}


############################## user directory ################################

@pytest.mark.parametrize("total, expected_pages", [(0, 0), (1, 1), (25, 1), (26, 2), (51, 3)])
def test_total_pages_rounds_up(client, monkeypatch, total, expected_pages):
    monkeypatch.setattr(
        admins,
        "fetch_users_page",
        lambda page, search, role: {"users": [], "total": total, "page_size": 25},
    )

    response = client.get("/admins-fetch-all-users")

    assert response.json()["total_pages"] == expected_pages


def test_search_is_trimmed_and_filters_passed_through(client, monkeypatch):
    seen = {}
    monkeypatch.setattr(
        admins,
        "fetch_users_page",
        lambda page, search, role: seen.update(page=page, search=search, role=role)
        or {"users": [], "total": 0, "page_size": 25},
    )

    client.get("/admins-fetch-all-users", params={"page": 3, "search": "  smith ", "role": "teacher"})

    assert seen == {"page": 3, "search": "smith", "role": "teacher"}


@pytest.mark.parametrize(
    "params",
    [{"page": 0}, {"role": "superuser"}, {"search": "x" * 101}],
)
def test_directory_rejects_bad_query_params(client, params):
    assert client.get("/admins-fetch-all-users", params=params).status_code == 422


############################## editing users #################################

def test_update_user_saves_validated_fields(client, monkeypatch):
    saved = {}
    monkeypatch.setattr(
        admins, "update_user",
        lambda user_id, updates: saved.update(id=user_id, updates=updates) or {"id": user_id, **updates},
    )

    response = client.patch("/admins-users/12", json={**VALID_USER, "first_name": "  Ada  "})

    assert response.status_code == 200
    assert saved == {"id": 12, "updates": VALID_USER}


@pytest.mark.parametrize(
    "change",
    [
        {"role": "superuser"},
        {"email": "not-an-email"},
        {"first_name": ""},
        {"school": 0},
    ],
)
def test_update_user_rejects_invalid_values(client, monkeypatch, change):
    monkeypatch.setattr(admins, "update_user", lambda *args: pytest.fail("should not save"))

    response = client.patch("/admins-users/12", json={**VALID_USER, **change})

    assert response.status_code == 422


def test_update_missing_user_is_404(client, monkeypatch):
    monkeypatch.setattr(admins, "update_user", lambda user_id, updates: None)

    assert client.patch("/admins-users/12", json=VALID_USER).status_code == 404


def test_update_database_error_does_not_leak_details(client, monkeypatch):
    def boom(user_id, updates):
        raise RuntimeError("connection string with secrets")

    monkeypatch.setattr(admins, "update_user", boom)

    response = client.patch("/admins-users/12", json=VALID_USER)

    assert response.status_code == 500
    assert "secrets" not in response.text


@pytest.mark.xfail(
    reason="Known bug: update_user_lock passes three arguments to "
    "update_user(user_id, updates), so locking/unlocking always returns 500.",
    strict=True,
)
def test_unlock_user_resets_lock_and_failed_attempts(client, monkeypatch):
    saved = {}

    # same signature as database.supabase_client.update_user
    def fake_update(user_id, updates):
        saved.update(id=user_id, updates=updates)
        return {"id": user_id}

    monkeypatch.setattr(admins, "update_user", fake_update)

    response = client.patch(
        "/admins-users-lock/12",
        params={"locked_until": "2026-01-01T00:00:00+00:00", "failed_login_attempts": 0},
    )

    assert response.status_code == 200
    assert saved["updates"] == {
        "locked_until": "2026-01-01T00:00:00+00:00",
        "failed_login_attempts": 0,
    }
