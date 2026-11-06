# ------------------------------------------------------------------------------
#
# Name:        test_sessions.py
# Purpose:     check session_details and session_groups fetch/edit routes:
#              who may read and write, and what gets sent to the database.
#
# ------------------------------------------------------------------------------

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from routes import calendar, sessions

EVENT_UUID = "11111111-2222-3333-4444-555555555555"
GROUP_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
ME = "user-1"
OTHER = "user-2"


def make_client(role="interventionist"):
    app = FastAPI()
    app.include_router(sessions.router)
    app.dependency_overrides[sessions.get_current_user] = lambda: {
        "id": 1, "public_id": ME, "role": role,
    }
    return TestClient(app)


@pytest.fixture
def client():
    return make_client()


@pytest.fixture
def admin_client():
    return make_client("admin")


@pytest.fixture
def world(monkeypatch):
    """One event (internal id 7) at school 1 with a session for student 42.
    The caller is at school 1 and has access to student 42 only."""
    state = {
        "event": {
            "id": 7, "public_id": EVENT_UUID, "school": 1, "organizer": ME,
            "title": "Reading", "event_type": "session",
            "starts_at": "2026-11-06T09:00:00+00:00",
            "ends_at": "2026-11-06T09:30:00+00:00",
        },
        "session": {"event_id": 7, "student_id": 42, "focus": "phonics", "status": "planned"},
        "group": {"id": 3, "public_id": GROUP_UUID, "school": 1, "name": "G1",
                  "purpose": "reading", "interventionist": ME},
        "updates": None,
    }

    def fake_event(public_id):
        return state["event"] if public_id == EVENT_UUID else None

    def fake_access(user, student_id):
        if user["role"] != "admin" and int(student_id) != 42:
            raise HTTPException(status_code=404, detail="Student not found")

    def fake_update_session(event_id, updates):
        state["updates"] = (event_id, updates)
        return {**state["session"], **updates} if event_id == 7 else None

    def fake_update_group(public_id, school_id, updates, interventionist_id=None):
        state["updates"] = (public_id, school_id, updates, interventionist_id)
        return {**state["group"], **updates}

    for module in (calendar, sessions):
        monkeypatch.setattr(module, "fetch_calendar_event", fake_event)
        monkeypatch.setattr(module, "require_student_access", fake_access)
        monkeypatch.setattr(module, "fetch_user_school_by_public_id", lambda pid: 1)
    monkeypatch.setattr(calendar, "fetch_student_ownership", lambda sid: {"school": 1})
    monkeypatch.setattr(
        sessions, "fetch_session_details",
        lambda eid: state["session"] if eid == 7 else None,
    )
    monkeypatch.setattr(sessions, "fetch_calendar_events_by_ids", lambda ids: [state["event"]])
    monkeypatch.setattr(sessions, "update_session_details", fake_update_session)
    monkeypatch.setattr(
        sessions, "fetch_session_group",
        lambda pid: state["group"] if pid == GROUP_UUID else None,
    )
    monkeypatch.setattr(sessions, "fetch_session_group_members", lambda gid: [42, 43])
    monkeypatch.setattr(sessions, "update_session_group", fake_update_group)
    return state


############################## SESSION DETAILS ###############################

def test_get_session_as_organizer(client, world):
    response = client.get(f"/sessions/{EVENT_UUID}")

    assert response.status_code == 200
    body = response.json()["session"]
    assert body["focus"] == "phonics"
    assert body["event"]["public_id"] == EVENT_UUID


def test_get_session_via_student_access_when_not_organizer(client, world):
    world["event"]["organizer"] = OTHER

    response = client.get(f"/sessions/{EVENT_UUID}")

    assert response.status_code == 200


def test_get_session_hidden_without_organizer_or_student_access(client, world):
    world["event"]["organizer"] = OTHER
    world["session"]["student_id"] = 99

    response = client.get(f"/sessions/{EVENT_UUID}")

    assert response.status_code == 404


def test_get_unknown_session_is_404(client, world):
    response = client.get("/sessions/99999999-9999-9999-9999-999999999999")
    assert response.status_code == 404


def test_list_sessions_for_student(client, world, monkeypatch):
    monkeypatch.setattr(sessions, "fetch_session_details_for_student", lambda sid: [world["session"]])

    response = client.get("/sessions", params={"student_id": 42})

    assert response.status_code == 200
    rows = response.json()["sessions"]
    assert rows[0]["event"]["title"] == "Reading"


def test_list_sessions_for_other_students_student_is_404(client, world):
    response = client.get("/sessions", params={"student_id": 99})
    assert response.status_code == 404


def test_list_sessions_defaults_to_my_sessions(client, world, monkeypatch):
    calls = {}
    monkeypatch.setattr(
        sessions, "fetch_session_details_created_by",
        lambda pid: calls.update(pid=pid) or [],
    )

    response = client.get("/sessions")

    assert response.status_code == 200
    assert calls == {"pid": ME}


def test_edit_session_sends_only_set_fields(client, world):
    response = client.put(
        f"/sessions/{EVENT_UUID}",
        json={"status": "done", "scheduled_time": "2026-11-06T09:00:00-06:00"},
    )

    assert response.status_code == 200
    assert world["updates"] == (
        7, {"status": "done", "scheduled_time": "2026-11-06T09:00:00-06:00"},
    )


def test_edit_session_rejects_naive_time(client, world):
    response = client.put(f"/sessions/{EVENT_UUID}", json={"scheduled_time": "2026-11-06T09:00:00"})
    assert response.status_code == 422


def test_edit_session_rejects_empty_body(client, world):
    response = client.put(f"/sessions/{EVENT_UUID}", json={})
    assert response.status_code == 400


def test_edit_session_by_non_organizer_is_404(client, world):
    world["event"]["organizer"] = OTHER

    response = client.put(f"/sessions/{EVENT_UUID}", json={"status": "done"})

    assert response.status_code == 404
    assert world["updates"] is None


def test_edit_session_to_inaccessible_student_is_404(client, world):
    response = client.put(f"/sessions/{EVENT_UUID}", json={"student_id": 99})

    assert response.status_code == 404
    assert world["updates"] is None


def test_admin_can_edit_any_session(admin_client, world):
    world["event"]["organizer"] = OTHER

    response = admin_client.put(f"/sessions/{EVENT_UUID}", json={"focus": "fluency"})

    assert response.status_code == 200
    assert response.json()["session"]["focus"] == "fluency"


############################## SESSION GROUPS ################################

def test_get_group_includes_members(client, world):
    response = client.get(f"/session-groups/{GROUP_UUID}")

    assert response.status_code == 200
    assert response.json()["group"]["members"] == [42, 43]


def test_get_group_at_other_school_is_404(client, world):
    world["group"]["school"] = 2
    response = client.get(f"/session-groups/{GROUP_UUID}")
    assert response.status_code == 404


def test_list_groups_scoped_to_callers_school(client, world, monkeypatch):
    calls = {}
    monkeypatch.setattr(sessions, "fetch_session_groups", lambda sid: calls.update(sid=sid) or [])

    response = client.get("/session-groups", params={"school": 5})

    assert response.status_code == 200
    assert calls == {"sid": 1}


def test_admin_list_groups_uses_requested_school(admin_client, world, monkeypatch):
    calls = {}
    monkeypatch.setattr(sessions, "fetch_session_groups", lambda sid: calls.update(sid=sid) or [])

    admin_client.get("/session-groups", params={"school": 5})

    assert calls == {"sid": 5}


def test_edit_group_as_its_interventionist(client, world):
    response = client.put(f"/session-groups/{GROUP_UUID}", json={"name": "Group A"})

    assert response.status_code == 200
    assert world["updates"] == (GROUP_UUID, 1, {"name": "Group A"}, ME)


def test_edit_group_not_mine_is_404(client, world):
    world["group"]["interventionist"] = OTHER

    response = client.put(f"/session-groups/{GROUP_UUID}", json={"name": "X"})

    assert response.status_code == 404
    assert world["updates"] is None


def test_edit_group_rejects_null_name(client, world):
    response = client.put(f"/session-groups/{GROUP_UUID}", json={"name": None})
    assert response.status_code == 422


def test_non_admin_cannot_reassign_group(client, world):
    response = client.put(f"/session-groups/{GROUP_UUID}", json={"interventionist": OTHER_UUID})
    assert response.status_code == 403


OTHER_UUID = "99999999-8888-7777-6666-555555555555"


def test_admin_reassign_requires_interventionist_at_school(admin_client, world, monkeypatch):
    monkeypatch.setattr(
        sessions, "fetch_user_role_and_school",
        lambda pid: {"role": "teacher", "school": 1},
    )

    response = admin_client.put(f"/session-groups/{GROUP_UUID}", json={"interventionist": OTHER_UUID})

    assert response.status_code == 422


def test_admin_can_reassign_group(admin_client, world, monkeypatch):
    monkeypatch.setattr(
        sessions, "fetch_user_role_and_school",
        lambda pid: {"role": "interventionist", "school": 1},
    )

    response = admin_client.put(f"/session-groups/{GROUP_UUID}", json={"interventionist": OTHER_UUID})

    assert response.status_code == 200
    assert world["updates"] == (GROUP_UUID, 1, {"interventionist": OTHER_UUID}, None)
