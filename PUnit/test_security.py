# ------------------------------------------------------------------------------
#
# Name:        test_security.py
# Purpose:     check session tokens and the access-control helpers every
#              protected route relies on.
#
# ------------------------------------------------------------------------------

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from auth import security


def creds(token):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def signed(payload, secret=security.JWT_SECRET):
    return jwt.encode(payload, secret, algorithm=security.JWT_ALGORITHM)


USER_ROW = {"id": 7, "public_id": "pub-7", "role": "teacher", "password_hash": "x"}


############################### TOKENS #######################################

def test_token_round_trips_to_the_same_identity():
    token = security.create_access_token(USER_ROW)

    assert security.get_current_user(creds(token)) == {
        "id": 7,
        "public_id": "pub-7",
        "role": "teacher",
    }


def test_token_only_carries_identity_claims():
    token = security.create_access_token({**USER_ROW, "school": 3, "email": "a@b.co"})
    payload = jwt.decode(token, security.JWT_SECRET, algorithms=[security.JWT_ALGORITHM])

    assert set(payload) == {"sub", "uid", "role", "iat", "exp"}


def test_token_expires_after_ttl():
    token = security.create_access_token(USER_ROW)
    payload = jwt.decode(token, security.JWT_SECRET, algorithms=[security.JWT_ALGORITHM])

    assert payload["exp"] - payload["iat"] == security.TOKEN_TTL_HOURS * 3600


def test_missing_credentials_are_rejected():
    with pytest.raises(HTTPException) as exc:
        security.get_current_user(None)
    assert exc.value.status_code == 401


def test_expired_token_is_rejected():
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    token = signed({"sub": "pub-7", "uid": 7, "role": "admin", "exp": past})

    with pytest.raises(HTTPException) as exc:
        security.get_current_user(creds(token))
    assert exc.value.status_code == 401


def test_token_signed_with_another_secret_is_rejected():
    future = datetime.now(timezone.utc) + timedelta(hours=1)
    token = signed(
        {"sub": "pub-7", "uid": 7, "role": "admin", "exp": future},
        secret="attacker-secret-attacker-secret-0123456789",
    )

    with pytest.raises(HTTPException) as exc:
        security.get_current_user(creds(token))
    assert exc.value.status_code == 401


@pytest.mark.parametrize("missing", ["exp", "sub", "uid"])
def test_token_missing_a_required_claim_is_rejected(missing):
    payload = {
        "sub": "pub-7",
        "uid": 7,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    payload.pop(missing)

    with pytest.raises(HTTPException) as exc:
        security.get_current_user(creds(signed(payload)))
    assert exc.value.status_code == 401


def test_garbage_token_is_rejected():
    with pytest.raises(HTTPException) as exc:
        security.get_current_user(creds("not.a.jwt"))
    assert exc.value.status_code == 401


############################### ROLE CHECKS ##################################

def test_require_admin_allows_admin():
    admin = {"id": 1, "public_id": "a", "role": "admin"}
    assert security.require_admin(admin) is admin


@pytest.mark.parametrize("role", ["teacher", "interventionist", None])
def test_require_admin_rejects_everyone_else(role):
    with pytest.raises(HTTPException) as exc:
        security.require_admin({"id": 1, "public_id": "a", "role": role})
    assert exc.value.status_code == 403


def test_require_self_or_admin_allows_self():
    security.require_self_or_admin({"role": "teacher", "public_id": "pub-1"}, "pub-1")


def test_require_self_or_admin_compares_ids_as_strings():
    # UUID path params arrive as UUID objects, tokens carry strings
    from uuid import UUID

    uid = UUID("12345678-1234-5678-1234-567812345678")
    security.require_self_or_admin({"role": "teacher", "public_id": str(uid)}, uid)


def test_require_self_or_admin_allows_admin_on_anyone():
    security.require_self_or_admin({"role": "admin", "public_id": "pub-1"}, "pub-2")


def test_require_self_or_admin_blocks_other_users():
    with pytest.raises(HTTPException) as exc:
        security.require_self_or_admin({"role": "interventionist", "public_id": "pub-1"}, "pub-2")
    assert exc.value.status_code == 403


############################### STUDENT ACCESS ###############################

OWNERSHIP = {"school": 1, "teacher": "teacher-1", "interventionist": "int-1"}


@pytest.fixture
def ownership(monkeypatch):
    monkeypatch.setattr(
        security,
        "fetch_student_ownership",
        lambda student_id: OWNERSHIP if student_id == 42 else None,
    )


def test_unknown_student_is_not_found(ownership):
    with pytest.raises(HTTPException) as exc:
        security.require_student_access({"role": "admin", "public_id": "a"}, 99)
    assert exc.value.status_code == 404


def test_admin_can_access_any_student(ownership):
    security.require_student_access({"role": "admin", "public_id": "someone"}, 42)


@pytest.mark.parametrize(
    "role, public_id",
    [("teacher", "teacher-1"), ("interventionist", "int-1")],
)
def test_assigned_staff_can_access_student(ownership, role, public_id):
    security.require_student_access({"role": role, "public_id": public_id}, 42)


@pytest.mark.parametrize(
    "role, public_id",
    [
        ("teacher", "teacher-2"),
        ("interventionist", "int-2"),
        # a teacher id must not unlock the interventionist column, and vice versa
        ("teacher", "int-1"),
        ("interventionist", "teacher-1"),
        ("parent", "teacher-1"),
        (None, "teacher-1"),
    ],
)
def test_other_users_get_not_found_instead_of_forbidden(ownership, role, public_id):
    with pytest.raises(HTTPException) as exc:
        security.require_student_access({"role": role, "public_id": public_id}, 42)
    # 404, not 403, so student ids can't be probed
    assert exc.value.status_code == 404
