# ------------------------------------------------------------------------------
#
# Name:        test_notes_access.py
# Purpose:     check that private notes stay private and that users can only
#              read, edit, and delete the notes they are allowed to.
#
# ------------------------------------------------------------------------------

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import notes

ME = {"id": 1, "public_id": "user-123", "role": "interventionist"}


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(notes.router)
    app.dependency_overrides[notes.get_current_user] = lambda: ME
    with TestClient(app) as test_client:
        yield test_client


############################## _visible_notes ################################

def test_public_notes_are_visible_to_everyone():
    result = notes._visible_notes([{"id": 1, "created_by": "other", "is_private": False}], ME)
    assert [note["id"] for note in result] == [1]


def test_private_notes_are_only_visible_to_their_author():
    rows = [
        {"id": 1, "created_by": "user-123", "privateNote": True},
        {"id": 2, "created_by": "someone-else", "privateNote": True},
    ]

    result = notes._visible_notes(rows, ME)

    assert [note["id"] for note in result] == [1]


def test_private_notes_hidden_even_from_admins():
    admin = {"id": 2, "public_id": "admin-1", "role": "admin"}
    rows = [{"id": 1, "created_by": "user-123", "privateNote": True}]

    assert notes._visible_notes(rows, admin) == []


@pytest.mark.parametrize("flag, visible", [("true", False), ("TRUE", False), ("false", True)])
def test_string_private_flags_are_understood(flag, visible):
    rows = [{"id": 1, "created_by": "someone-else", "privateNote": flag}]

    result = notes._visible_notes(rows, ME)

    assert bool(result) is visible


def test_visible_notes_always_include_a_boolean_is_private():
    rows = [
        {"id": 1, "created_by": "x"},
        {"id": 2, "created_by": "user-123", "privateNote": "true"},
    ]

    result = notes._visible_notes(rows, ME)

    assert [note["is_private"] for note in result] == [False, True]


def test_visible_notes_does_not_mutate_input():
    row = {"id": 1, "created_by": "x", "privateNote": False}
    notes._visible_notes([row], ME)
    assert "is_private" not in row


############################## ROUTES ########################################

def test_fetch_my_notes_filters_others_private_notes(client, monkeypatch):
    monkeypatch.setattr(
        notes,
        "fetch_notes_from_user",
        lambda public_id: [
            {"id": 1, "created_by": "user-123", "privateNote": True},
            {"id": 2, "created_by": "other", "privateNote": True},
        ],
    )

    response = client.get("/notes-userFetch/user-123")

    assert response.status_code == 200
    assert [note["id"] for note in response.json()["notes"]] == [1]


def test_cannot_fetch_another_users_notes(client, monkeypatch):
    monkeypatch.setattr(notes, "fetch_notes_from_user", lambda public_id: pytest.fail("should not query"))

    response = client.get("/notes-userFetch/someone-else")

    assert response.status_code == 403


def test_fetch_notes_for_student_requires_student_access(client, monkeypatch):
    from fastapi import HTTPException

    def deny(user, student_id):
        raise HTTPException(status_code=404, detail="Student not found")

    monkeypatch.setattr(notes, "require_student_access", deny)
    monkeypatch.setattr(notes, "fetch_notes_for_student", lambda sid: pytest.fail("should not query"))

    response = client.get(
        "/notes-fetchForStudent", params={"user_id": "user-123", "student_id": "42"}
    )

    assert response.status_code == 404


def test_create_note_as_someone_else_is_forbidden(client, monkeypatch):
    monkeypatch.setattr(notes, "create_note", lambda *args: pytest.fail("should not save"))

    response = client.post(
        "/notes-create",
        json={"student_id": None, "created_by": "someone-else", "text": "hi"},
    )

    assert response.status_code == 403


def test_create_general_note_skips_student_check(client, monkeypatch):
    monkeypatch.setattr(
        notes, "require_student_access", lambda *args: pytest.fail("no student to check")
    )
    monkeypatch.setattr(
        notes, "create_note", lambda sid, by, text, private: {"id": 3, "text": text}
    )

    response = client.post(
        "/notes-create", json={"student_id": None, "created_by": "user-123", "text": "todo"}
    )

    assert response.status_code == 200
    assert response.json()["note"]["id"] == 3


def test_edit_is_scoped_to_the_caller(client, monkeypatch):
    calls = {}

    def fake_edit(note_id, new_text, user_id):
        calls.update(note_id=note_id, user_id=user_id)
        return None

    monkeypatch.setattr(notes, "edit_text", fake_edit)

    response = client.put("/notes-editText", params={"note_id": "5", "new_text": "changed"})

    # the author filter comes from the token, not the request
    assert calls == {"note_id": "5", "user_id": "user-123"}
    assert response.status_code == 404


def test_delete_note(client, monkeypatch):
    monkeypatch.setattr(notes, "delete_note", lambda note_id, user_id: True)

    response = client.delete("/notes-delete", params={"note_id": "5", "user_id": "user-123"})

    assert response.status_code == 200
    assert response.json() == {"deleted": True}


def test_cannot_delete_as_another_user(client, monkeypatch):
    monkeypatch.setattr(notes, "delete_note", lambda *args: pytest.fail("should not delete"))

    response = client.delete("/notes-delete", params={"note_id": "5", "user_id": "someone-else"})

    assert response.status_code == 403


def test_delete_of_missing_note_is_404(client, monkeypatch):
    monkeypatch.setattr(notes, "delete_note", lambda note_id, user_id: False)

    response = client.delete("/notes-delete", params={"note_id": "5", "user_id": "user-123"})

    assert response.status_code == 404
