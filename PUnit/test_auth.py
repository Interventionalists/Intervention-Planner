# ------------------------------------------------------------------------------
#
# Name:        test_auth.py
# Purpose:     check login, account lockout, password changes, and account
#              profile updates without touching the real database.
#
# ------------------------------------------------------------------------------

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from auth import security
from routes import auth


def iso_in(minutes):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def make_user(**overrides):
    user = {
        "id": 5,
        "public_id": "pub-5",
        "email": "teacher@example.com",
        "first_name": "Tess",
        "last_name": "Teacher",
        "role": "teacher",
        "school": 2,
        "password_hash": "stored-hash",
        "failed_login_attempts": 0,
        "locked_until": None,
    }
    user.update(overrides)
    return user


@pytest.fixture
def fake_db(monkeypatch):
    """Fake user table + recorded login attempts. Password is 'correct-password'."""
    state = {"user": make_user(), "attempts": [], "lock_result": None}

    monkeypatch.setattr(
        auth,
        "fetch_user_by_email",
        lambda email: state["user"] if state["user"] and email == state["user"]["email"] else None,
    )
    monkeypatch.setattr(
        auth,
        "verify_password",
        lambda password, password_hash: password == "correct-password",
    )

    def fake_record(user_id, success, max_attempts, lock_minutes):
        state["attempts"].append(success)
        return state["lock_result"]

    monkeypatch.setattr(auth, "record_login_attempt", fake_record)
    return state


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(auth.router)
    with TestClient(app) as test_client:
        yield test_client


################################ is_locked ###################################

@pytest.mark.parametrize("value", [None, ""])
def test_is_locked_false_when_no_lock(value):
    assert auth.is_locked(value) is False


def test_is_locked_true_for_future_time():
    assert auth.is_locked(iso_in(10)) is True


def test_is_locked_false_once_lock_has_passed():
    assert auth.is_locked(iso_in(-1)) is False


################################ authenticate ################################

def test_authenticate_returns_user_for_correct_password(fake_db):
    user = auth.authenticate("teacher@example.com", "correct-password")

    assert user["id"] == 5
    # clean account: nothing to reset, so no write
    assert fake_db["attempts"] == []


def test_authenticate_resets_counter_after_earlier_failures(fake_db):
    fake_db["user"]["failed_login_attempts"] = 2

    auth.authenticate("teacher@example.com", "correct-password")

    assert fake_db["attempts"] == [True]


def test_unknown_email_gets_same_error_as_wrong_password(fake_db):
    with pytest.raises(HTTPException) as unknown:
        auth.authenticate("nobody@example.com", "correct-password")
    with pytest.raises(HTTPException) as wrong:
        auth.authenticate("teacher@example.com", "wrong-password")

    assert unknown.value.status_code == wrong.value.status_code == 401
    assert unknown.value.detail == wrong.value.detail


def test_wrong_password_is_recorded_as_failure(fake_db):
    with pytest.raises(HTTPException):
        auth.authenticate("teacher@example.com", "wrong-password")

    assert fake_db["attempts"] == [False]


def test_failure_that_triggers_lock_returns_423(fake_db):
    fake_db["lock_result"] = {"failed_login_attempts": 5, "locked_until": iso_in(15)}

    with pytest.raises(HTTPException) as exc:
        auth.authenticate("teacher@example.com", "wrong-password")

    assert exc.value.status_code == 423


def test_locked_account_rejects_correct_password_without_counting(fake_db):
    fake_db["user"]["locked_until"] = iso_in(5)

    with pytest.raises(HTTPException) as exc:
        auth.authenticate("teacher@example.com", "correct-password")

    assert exc.value.status_code == 423
    # attempts while locked must not extend the lock
    assert fake_db["attempts"] == []


def test_expired_lock_allows_login_and_clears_it(fake_db):
    fake_db["user"]["locked_until"] = iso_in(-5)

    auth.authenticate("teacher@example.com", "correct-password")

    assert fake_db["attempts"] == [True]


def test_user_without_password_hash_cannot_log_in(fake_db, monkeypatch):
    fake_db["user"]["password_hash"] = None
    monkeypatch.setattr(auth, "verify_password", lambda *args: pytest.fail("should not verify"))

    with pytest.raises(HTTPException) as exc:
        auth.authenticate("teacher@example.com", "anything")

    assert exc.value.status_code == 401


def test_database_failure_during_lookup_is_500(monkeypatch):
    def boom(email):
        raise RuntimeError("db down")

    monkeypatch.setattr(auth, "fetch_user_by_email", boom)

    with pytest.raises(HTTPException) as exc:
        auth.authenticate("teacher@example.com", "correct-password")

    assert exc.value.status_code == 500


################################ /login ######################################

def test_login_returns_token_and_hides_password_hash(client, fake_db):
    response = client.post(
        "/login", json={"email": "teacher@example.com", "password": "correct-password"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert set(body["user"]) == {
        "id", "public_id", "email", "first_name", "last_name", "role", "school"
    }
    assert "password_hash" not in response.text
    assert "locked_until" not in body["user"]


def test_login_token_is_accepted_by_protected_routes(client, fake_db):
    token = client.post(
        "/login", json={"email": "teacher@example.com", "password": "correct-password"}
    ).json()["access_token"]

    identity = security.get_current_user(
        security.HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    )
    assert identity == {"id": 5, "public_id": "pub-5", "role": "teacher"}


def test_login_with_bad_password_is_401(client, fake_db):
    response = client.post(
        "/login", json={"email": "teacher@example.com", "password": "nope"}
    )
    assert response.status_code == 401


############################### /change-password #############################

@pytest.fixture
def password_store(monkeypatch, fake_db):
    saved = {}
    monkeypatch.setattr(auth, "hash_password", lambda password: f"hashed:{password}")

    def fake_update(email, password_hash):
        saved.update(email=email, password_hash=password_hash)
        return {"id": 5}

    monkeypatch.setattr(auth, "update_user_password", fake_update)
    return saved


def test_change_password_saves_new_hash(client, password_store):
    response = client.post(
        "/change-password",
        json={
            "email": "teacher@example.com",
            "current_password": "correct-password",
            "new_password": "brand-new-password",
        },
    )

    assert response.status_code == 200
    assert password_store == {
        "email": "teacher@example.com",
        "password_hash": "hashed:brand-new-password",
    }


def test_change_password_rejects_short_password(client, password_store):
    response = client.post(
        "/change-password",
        json={
            "email": "teacher@example.com",
            "current_password": "correct-password",
            "new_password": "short",
        },
    )

    assert response.status_code == 400
    assert password_store == {}


def test_change_password_rejects_reusing_current_password(client, password_store):
    response = client.post(
        "/change-password",
        json={
            "email": "teacher@example.com",
            "current_password": "correct-password",
            "new_password": "correct-password",
        },
    )

    assert response.status_code == 400
    assert password_store == {}


def test_change_password_requires_current_password(client, password_store):
    response = client.post(
        "/change-password",
        json={
            "email": "teacher@example.com",
            "current_password": "wrong-password",
            "new_password": "brand-new-password",
        },
    )

    assert response.status_code == 401
    assert password_store == {}


############################### /account/profile #############################

def profile_client(role):
    app = FastAPI()
    app.include_router(auth.router)
    app.dependency_overrides[auth.get_current_user] = lambda: {
        "id": 9, "public_id": "pub-9", "role": role,
    }
    return TestClient(app)


@pytest.fixture
def saved_profile(monkeypatch):
    saved = {}

    def fake_update(user_id, updates):
        saved.update(user_id=user_id, updates=updates)
        return {"id": user_id, **updates}

    monkeypatch.setattr(auth, "update_user", fake_update)
    return saved


FULL_PROFILE = {"first_name": "Ada", "last_name": "Admin", "email": "ada@example.com"}


def test_teacher_cannot_update_profile(saved_profile):
    response = profile_client("teacher").patch("/account/profile", json={"school": 2})

    assert response.status_code == 403
    assert saved_profile == {}


def test_interventionist_can_change_school_only(saved_profile):
    client = profile_client("interventionist")

    ok = client.patch("/account/profile", json={"school": 3})
    assert ok.status_code == 200
    assert saved_profile == {"user_id": 9, "updates": {"school": 3}}

    blocked = client.patch("/account/profile", json={"school": 3, "first_name": "New"})
    assert blocked.status_code == 403


def test_admin_must_send_full_name_and_email(saved_profile):
    response = profile_client("admin").patch(
        "/account/profile", json={"first_name": "Ada"}
    )

    assert response.status_code == 422
    assert saved_profile == {}


def test_admin_profile_update_trims_and_saves(saved_profile):
    response = profile_client("admin").patch(
        "/account/profile",
        json={"first_name": "  Ada ", "last_name": "Admin", "email": "ada@example.com"},
    )

    assert response.status_code == 200
    assert saved_profile["updates"]["first_name"] == "Ada"


@pytest.mark.parametrize("email", ["not-an-email", "a@b", "two words@example.com"])
def test_admin_profile_rejects_invalid_email(saved_profile, email):
    response = profile_client("admin").patch(
        "/account/profile", json={**FULL_PROFILE, "email": email}
    )

    assert response.status_code == 422
    assert saved_profile == {}


def test_profile_rejects_unknown_fields(saved_profile):
    # extra="forbid" stops callers from setting role/password_hash this way
    response = profile_client("admin").patch(
        "/account/profile", json={**FULL_PROFILE, "role": "admin"}
    )

    assert response.status_code == 422
    assert saved_profile == {}


def test_profile_duplicate_email_is_409(monkeypatch):
    class UniqueViolation(Exception):
        code = "23505"

    def fake_update(user_id, updates):
        raise UniqueViolation("duplicate key")

    monkeypatch.setattr(auth, "update_user", fake_update)

    response = profile_client("admin").patch("/account/profile", json=FULL_PROFILE)

    assert response.status_code == 409


def test_profile_missing_user_is_404(monkeypatch):
    monkeypatch.setattr(auth, "update_user", lambda user_id, updates: None)

    response = profile_client("admin").patch("/account/profile", json=FULL_PROFILE)

    assert response.status_code == 404
