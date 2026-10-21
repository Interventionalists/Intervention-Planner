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

    # Sets up a fake note creation call, without using the actual database
    def fake_create_note(student_id, created_by, text, is_private=False):
        saved.update(
            student_id=student_id,
            created_by=created_by,
            text=text,
            is_private=is_private,
        )
        return {
            "id": 7,
            "student_id": student_id,
            "created_by": created_by,
            "text": text,
            "privateNote": is_private,
        }

    # Built in pytest feature, replaces enviornment values. 
    monkeypatch.setattr(notes, "create_note", fake_create_note)

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
    }
    assert response.json()["note"]["id"] == 7
    assert response.json()["note"]["privateNote"] is True