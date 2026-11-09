# ------------------------------------------------------------------------------
#
# Name:        test_notes.py
# Purpose:     ensure note creation and privacy work properly
# Author:      Dudley D. (09/23/2026)
#
# ------------------------------------------------------------------------------

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routes import notes
from auth import security

# gets the client up and running with fake user data
@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(notes.router)
    app.dependency_overrides[notes.get_current_user] = lambda: {
        "id": 1,
        "public_id": "user-123",
        "role": "interventionist",
    }

    # Allows FastApi to route directly without needing a web server
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


# This uses monkeypath to do a fake note creation
def test_create_note(client, monkeypatch):
    saved = {}

    def fake_fetch_student_ownership(student_id):
        if student_id != 42:
            return None
        return {
            "school": 1,
            "teacher": None,
            "interventionist": "user-123",
        }

    # Sets up a fake note creation call, without using the actual database
    def fake_create_note(student_id, created_by, text, is_private=False, session_id=None):
        saved.update(
            student_id=student_id,
            created_by=created_by,
            text=text,
            is_private=is_private,
            session_id=session_id,
        )
        return {
            "id": 7,
            "student_id": student_id,
            "session_id": session_id,
            "created_by": created_by,
            "text": text,
            "privateNote": is_private,
        }

    # Built in pytest feature, replaces enviornment values. 
    monkeypatch.setattr(notes, "create_note", fake_create_note)
    monkeypatch.setattr(security, "fetch_student_ownership", fake_fetch_student_ownership)

    # Now tests using the mock database
    response = client.post(
        "/notes-create",
        json={
            "student_id": 42,
            "created_by": "user-123",
            "text": "Met with student today",
            "is_private": True,
        },
    )

    # Assert depending on the outcome
    assert response.status_code == 200
    assert saved == {
        "student_id": 42,
        "created_by": "user-123",
        "text": "Met with student today",
        "is_private": True,
        "session_id": None,
    }
    assert response.json()["note"]["id"] == 7
    assert response.json()["note"]["privateNote"] is True


def test_create_session_note(client, monkeypatch):
    saved = {}

    def fake_fetch_session(session_id):
        if str(session_id) != "99":
            return None
        return {"id": 99, "student_id": 42}

    def fake_create_note(student_id, created_by, text, is_private=False, session_id=None):
        saved.update(
            student_id=student_id,
            created_by=created_by,
            text=text,
            is_private=is_private,
            session_id=session_id,
        )
        return {
            "id": 8,
            "student_id": student_id,
            "session_id": session_id,
            "created_by": created_by,
            "text": text,
            "privateNote": is_private,
        }

    monkeypatch.setattr(notes, "fetch_session", fake_fetch_session)
    monkeypatch.setattr(notes, "create_note", fake_create_note)
    monkeypatch.setattr(notes, "require_student_access", lambda *_args, **_kwargs: None)

    response = client.post(
        "/notes-create",
        json={
            "student_id": 42,
            "session_id": 99,
            "created_by": "user-123",
            "text": "Session follow-up note",
            "is_private": False,
        },
    )

    assert response.status_code == 200
    assert saved["session_id"] == 99
    assert response.json()["note"]["session_id"] == 99