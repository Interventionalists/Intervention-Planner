"""Regression tests for the Nov 2026 security audit / red-team findings.

Every test drives the real app (routes, auth dependencies and query code)
against an in-memory Supabase (fake_supabase.py) seeded with two schools, so
the school filters in supabase_client.py are actually exercised rather than
mocked away. Each test is an attack that used to succeed and must now fail.
"""
import time

import bcrypt
import pytest
from fastapi.testclient import TestClient

import database.supabase_client as sc
import main
from auth import security

from .fake_supabase import FakeSupabase

PW = "CorrectHorse1"
PW_HASH = bcrypt.hashpw(PW.encode(), bcrypt.gensalt(rounds=4)).decode()

T1 = "00000000-0000-4000-8000-000000000001"    # teacher, school 1
I1 = "00000000-0000-4000-8000-000000000002"    # interventionist, school 1
A1 = "00000000-0000-4000-8000-000000000003"    # admin, school 1
T2 = "00000000-0000-4000-8000-000000000004"    # teacher, school 2
DEMO = "00000000-0000-4000-8000-000000000005"  # read-only demo, school 1
NEW = "00000000-0000-4000-8000-000000000006"   # unassigned user


def account(id_, pid, role, school, email, ro=False):
    return {"id": id_, "public_id": pid, "role": role, "school": school,
            "email": email, "first_name": "F", "last_name": "L",
            "password_hash": PW_HASH, "read_only": ro,
            "failed_login_attempts": 0, "locked_until": None}


SEED = {
    "schools": [{"school_id": 1, "school_name": "School One"},
                {"school_id": 2, "school_name": "School Two"}],
    "users": [account(1, T1, "teacher", 1, "t1@one.test"),
              account(2, I1, "interventionist", 1, "i1@one.test"),
              account(3, A1, "admin", 1, "a1@one.test"),
              account(4, T2, "teacher", 2, "t2@two.test"),
              account(5, DEMO, "teacher", 1, "demo@one.test", ro=True),
              account(6, NEW, "teacher", None, "new@nowhere.test")],
    "students": [
        {"id": 101, "public_id": "s-101", "first_name": "Own", "last_name": "Student",
         "school": 1, "teacher": T1, "interventionist": None, "needs_interventions": True},
        {"id": 201, "public_id": "s-201", "first_name": "Other", "last_name": "Student",
         "school": 2, "teacher": T2, "interventionist": None, "needs_interventions": True},
    ],
    "notes": [{"id": 9001, "student_id": 201, "created_by": T2, "date": "2026-11-20",
               "privateNote": False, "text": "SCHOOL-TWO-NOTE"}],
    "calendar_events": [{"id": 8001, "public_id": "00000000-0000-4000-9000-000000008001",
                         "school": 2, "organizer": T2, "title": "school two meeting",
                         "starts_at": "2026-12-01T10:00:00+00:00",
                         "ends_at": "2026-12-01T11:00:00+00:00", "recurrence_id": None}],
}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(SEED)
    monkeypatch.setattr(sc, "supabase", fake)
    return fake


@pytest.fixture
def client(db):
    return TestClient(main.app, raise_server_exceptions=False)


def row(db, table, **match):
    return next(r for r in db.tables[table] if all(r.get(k) == v for k, v in match.items()))


def auth(db, uid):
    return {"Authorization": "Bearer " + security.create_access_token(row(db, "users", id=uid))}


def student_ids(response):
    return {s["id"] for s in response.json()["students"]}


# ---- H1: users must not be able to move themselves into another school ----

@pytest.mark.parametrize("method", ["GET", "PUT"])
@pytest.mark.parametrize("uid", [1, 3, 5])
def test_schools_update_route_is_gone(client, db, method, uid):
    response = client.request(
        method, "/schools-update",
        params={"user_id": uid, "new_school_id": 2}, headers=auth(db, uid),
    )
    assert response.status_code in (404, 405)
    assert row(db, "users", id=uid)["school"] == 1
    assert 201 not in student_ids(client.get("/students-fetch", headers=auth(db, uid)))


@pytest.mark.parametrize("uid", [1, 2, 3])
def test_account_profile_cannot_change_school(client, db, uid):
    response = client.patch("/account/profile", json={"school": 2}, headers=auth(db, uid))
    assert response.status_code in (403, 422)
    assert row(db, "users", id=uid)["school"] == 1


def test_interventionist_still_cannot_read_other_school_notes(client, db):
    h = auth(db, 2)
    client.patch("/account/profile", json={"school": 2}, headers=h)
    response = client.get("/notes-fetchForStudent",
                          params={"user_id": I1, "student_id": 201}, headers=h)
    assert response.status_code == 404
    assert "SCHOOL-TWO-NOTE" not in response.text


# ---- H2: no unscoped note listing ----

def test_notes_by_date_endpoint_is_gone(client, db):
    response = client.get("/notes-fetchFromDate/2026-11-20", headers=auth(db, 1))
    assert response.status_code == 404
    assert "SCHOOL-TWO-NOTE" not in response.text


# ---- M1: student creation is admin-only and school-scoped ----

@pytest.mark.parametrize("uid", [1, 2])
def test_non_admin_cannot_create_students(client, db, uid):
    response = client.post("/students-insert", headers=auth(db, uid),
                           json={"first_name": "X", "last_name": "Y", "school": 1})
    assert response.status_code == 403
    assert not any(s["first_name"] == "X" for s in db.tables["students"])


def test_admin_cannot_create_student_in_other_school(client, db):
    response = client.post("/students-insert", headers=auth(db, 3),
                           json={"first_name": "X", "last_name": "Y", "school": 2})
    assert response.status_code == 403


def test_admin_cannot_assign_other_school_teacher(client, db):
    response = client.post("/students-insert", headers=auth(db, 3),
                           json={"first_name": "X", "last_name": "Y", "teacher": T2})
    assert response.status_code == 400


def test_admin_creates_student_in_own_school(client, db):
    response = client.post("/students-insert", headers=auth(db, 3),
                           json={"first_name": "New", "last_name": "Kid", "teacher": T1})
    assert response.status_code == 201
    assert str(row(db, "students", first_name="New")["school"]) == "1"


# ---- M2: admins are scoped to their own school ----

def test_admin_cannot_edit_user_in_other_school(client, db):
    response = client.patch("/admins-users/4", headers=auth(db, 3), json={
        "first_name": "F", "last_name": "L", "email": "t2@two.test", "role": "admin", "school": 2})
    assert response.status_code == 404
    assert row(db, "users", id=4)["role"] == "teacher"


def test_admin_cannot_move_user_into_other_school(client, db):
    response = client.patch("/admins-users/1", headers=auth(db, 3), json={
        "first_name": "F", "last_name": "L", "email": "t1@one.test", "role": "teacher", "school": 2})
    assert response.status_code == 403
    assert row(db, "users", id=1)["school"] == 1


def test_admin_can_bring_unassigned_user_into_own_school(client, db):
    response = client.patch("/admins-users/6", headers=auth(db, 3), json={
        "first_name": "F", "last_name": "L", "email": "new@nowhere.test", "role": "teacher", "school": 1})
    assert response.status_code == 200
    assert row(db, "users", id=6)["school"] == 1


def test_admin_cannot_lock_user_in_other_school(client, db):
    response = client.patch("/admins-users-lock/4", headers=auth(db, 3),
                            params={"locked_until": "2999-01-01T00:00:00Z"})
    assert response.status_code == 404
    assert row(db, "users", id=4)["locked_until"] is None


def test_admin_unlock_works_for_own_school(client, db):
    row(db, "users", id=1).update(locked_until="2999-01-01T00:00:00+00:00", failed_login_attempts=5)
    response = client.patch("/admins-users-lock/1", headers=auth(db, 3),
                            params={"locked_until": "2000-01-01T00:00:00Z"})
    assert response.status_code == 200
    assert row(db, "users", id=1)["failed_login_attempts"] == 0
    login = client.post("/login", json={"email": "t1@one.test", "password": PW})
    assert login.status_code == 200


def test_admin_lock_rejects_naive_timestamp(client, db):
    response = client.patch("/admins-users-lock/1", headers=auth(db, 3),
                            params={"locked_until": "2999-01-01T00:00:00"})
    assert response.status_code == 422


def test_admin_cannot_read_other_school_student(client, db):
    assert client.get("/students-fetchName/201", headers=auth(db, 3)).status_code == 404


def test_admin_cannot_create_calendar_event_in_other_school(client, db):
    response = client.post("/calendar-events", headers=auth(db, 3), json={
        "school": 2, "event_type": "meeting", "title": "x",
        "starts_at": "2026-12-02T10:00:00+00:00", "ends_at": "2026-12-02T11:00:00+00:00"})
    assert response.status_code == 403
    assert len(db.tables["calendar_events"]) == 1


def test_admin_cannot_delete_other_school_calendar_event(client, db):
    response = client.delete("/calendar-events/00000000-0000-4000-9000-000000008001",
                             headers=auth(db, 3))
    assert response.status_code == 404
    assert any(e["id"] == 8001 for e in db.tables["calendar_events"])


def test_admin_user_list_is_scoped_to_own_school_and_unassigned(monkeypatch):
    captured = {}

    class Query:
        def __getattr__(self, name):
            def method(*args, **kwargs):
                captured.setdefault(name, []).append(args)
                return self
            return method

        def execute(self):
            return type("R", (), {"data": [], "count": 0})()

    monkeypatch.setattr(sc, "supabase", type("S", (), {"table": lambda self, _t: Query()})())
    sc.fetch_users_page(1, 1, 'x",role.eq.admin')
    (expression,) = captured["or_"][0]
    assert expression.startswith("and(or(school.eq.1,school.is.null),or(")
    assert '\\"' in expression  # search value stays escaped inside its quotes

    captured.clear()
    sc.fetch_users_page(1, 1)
    assert captured["or_"] == [("school.eq.1,school.is.null",)]


# ---- M3: role and read_only come from the database, not the token ----

def test_demoted_admin_loses_access_immediately(client, db):
    h = auth(db, 3)
    row(db, "users", id=3)["role"] = "teacher"
    assert client.get("/admins-fetch", headers=h).status_code == 403


def test_account_made_read_only_is_blocked_immediately(client, db):
    h = auth(db, 1)
    row(db, "users", id=1)["read_only"] = True
    assert client.post("/todos", json={"description": "x"}, headers=h).status_code == 403


def test_token_for_deleted_user_is_rejected(client, db):
    h = auth(db, 1)
    db.tables["users"] = [u for u in db.tables["users"] if u["id"] != 1]
    assert client.get("/students-fetch", headers=h).status_code == 401


# ---- L1: login does not reveal which emails exist ----

def test_unknown_email_costs_the_same_bcrypt_time(client, db):
    row(db, "users", id=4)["password_hash"] = bcrypt.hashpw(b"x", bcrypt.gensalt()).decode()

    def timed(email):
        start = time.perf_counter()
        response = client.post("/login", json={"email": email, "password": "wrong"})
        assert response.status_code == 401
        return time.perf_counter() - start

    unknown = min(timed("ghost@nowhere.test") for _ in range(3))
    known = min(timed("t2@two.test") for _ in range(2))
    assert unknown > known * 0.5


def test_overlong_password_is_401_not_500(client, db):
    response = client.post("/login", json={"email": "t1@one.test", "password": "x" * 100})
    assert response.status_code == 401


# ---- L2: internal error text never reaches the client ----

def test_internal_error_text_is_not_returned(client, db, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError('column "secret_internal_column" does not exist')

    monkeypatch.setattr("routes.todos.fetch_todos_for_user", boom)
    response = client.get("/todos", headers=auth(db, 1))
    assert response.status_code == 500
    assert "secret_internal_column" not in response.text
