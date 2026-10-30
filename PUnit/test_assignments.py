# ------------------------------------------------------------------------------
#
# Name:        test_assignments.py
# Purpose:     check assignment (grade) routes: who may write grades, field
#              mapping to the database columns, and date-range filtering.
#
# ------------------------------------------------------------------------------

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from routes import assignments

ASSIGNMENT_ID = "11111111-2222-3333-4444-555555555555"


def make_client(role="interventionist"):
    app = FastAPI()
    app.include_router(assignments.router)
    app.dependency_overrides[assignments.get_current_user] = lambda: {
        "id": 1, "public_id": "user-1", "role": role,
    }
    return TestClient(app)


@pytest.fixture
def client():
    return make_client()


@pytest.fixture
def access(monkeypatch):
    """Student 42 is the caller's; any other student id is someone else's."""
    def fake_access(user, student_id):
        if int(student_id) != 42:
            raise HTTPException(status_code=404, detail="Student not found")

    monkeypatch.setattr(assignments, "require_student_access", fake_access)


@pytest.fixture
def stored_assignment(monkeypatch, access):
    row = {"id": ASSIGNMENT_ID, "student_id": 42, "subject": "math", "assignment": "Quiz 1", "grade": 88}
    monkeypatch.setattr(
        assignments,
        "fetch_assignment",
        lambda assignment_id: row if assignment_id == ASSIGNMENT_ID else None,
    )
    return row


################################ FETCH #######################################

def test_fetch_all_assignments_for_student(client, access, monkeypatch):
    monkeypatch.setattr(assignments, "fetch_assignments_for_student", lambda sid: [{"id": "a"}])

    response = client.get("/assignments-fetchForStudent/42")

    assert response.status_code == 200
    assert response.json() == {"assignments": [{"id": "a"}]}


def test_fetch_by_subject_uses_subject_query(client, access, monkeypatch):
    calls = {}
    monkeypatch.setattr(
        assignments,
        "fetch_assignments_for_student_subject",
        lambda sid, subject: calls.update(sid=sid, subject=subject) or [],
    )

    client.get("/assignments-fetchForStudent/42", params={"subject": "math"})

    assert calls == {"sid": 42, "subject": "math"}


def test_date_range_end_date_includes_the_whole_day(client, access, monkeypatch):
    calls = {}

    def fake_range(sid, start_iso, end_iso, subject):
        calls.update(sid=sid, start=start_iso, end=end_iso, subject=subject)
        return []

    monkeypatch.setattr(assignments, "fetch_assignments_for_student_in_range", fake_range)

    response = client.get(
        "/assignments-fetchForStudent/42",
        params={"start_date": "2026-09-01", "end_date": "2026-09-30", "subject": "science"},
    )

    assert response.status_code == 200
    # end is exclusive in the query, so it must be the following day
    assert calls == {"sid": 42, "start": "2026-09-01", "end": "2026-10-01", "subject": "science"}


def test_date_range_with_only_start_leaves_end_open(client, access, monkeypatch):
    calls = {}
    monkeypatch.setattr(
        assignments,
        "fetch_assignments_for_student_in_range",
        lambda sid, start_iso, end_iso, subject: calls.update(end=end_iso) or [],
    )

    client.get("/assignments-fetchForStudent/42", params={"start_date": "2026-09-01"})

    assert calls == {"end": None}


def test_start_after_end_is_rejected(client, access):
    response = client.get(
        "/assignments-fetchForStudent/42",
        params={"start_date": "2026-10-02", "end_date": "2026-10-01"},
    )
    assert response.status_code == 400


def test_fetch_for_other_users_student_is_404(client, access):
    response = client.get("/assignments-fetchForStudent/7")
    assert response.status_code == 404


def test_fetch_single_assignment(client, stored_assignment):
    response = client.get(f"/assignments-fetch/{ASSIGNMENT_ID}")

    assert response.status_code == 200
    assert response.json()["assignment"]["grade"] == 88


def test_fetch_missing_assignment_is_404(client, stored_assignment):
    response = client.get("/assignments-fetch/99999999-2222-3333-4444-555555555555")
    assert response.status_code == 404


def test_fetch_rejects_non_uuid_id(client, stored_assignment):
    response = client.get("/assignments-fetch/not-a-uuid")
    assert response.status_code == 422


################################ CREATE ######################################

def test_create_maps_fields_to_database_columns(client, access, monkeypatch):
    saved = {}
    monkeypatch.setattr(
        assignments,
        "create_assignment",
        lambda data: saved.update(data) or {"id": ASSIGNMENT_ID, **data},
    )

    response = client.post(
        "/assignments-create",
        json={"student_id": 42, "subject": "  math ", "assignment": "Quiz 1", "grade": 91.5},
    )

    assert response.status_code == 200
    # no created_at sent, so the database default is used
    assert saved == {"student_id": 42, "class": "math", "Assignment": "Quiz 1", "grade": 91.5}


def test_create_accepts_legacy_field_names(client, access, monkeypatch):
    saved = {}
    monkeypatch.setattr(assignments, "create_assignment", lambda data: saved.update(data) or data)

    response = client.post(
        "/assignments-create",
        json={"student_id": 42, "class": "english", "Asignment": "Essay"},
    )

    assert response.status_code == 200
    assert saved["class"] == "english"
    assert saved["Assignment"] == "Essay"


def test_create_sends_created_at_as_iso_string(client, access, monkeypatch):
    saved = {}
    monkeypatch.setattr(assignments, "create_assignment", lambda data: saved.update(data) or data)

    client.post(
        "/assignments-create",
        json={"student_id": 42, "subject": "math", "assignment": "Quiz",
              "created_at": "2026-09-15T08:30:00"},
    )

    assert saved["created_at"] == "2026-09-15T08:30:00"


@pytest.mark.parametrize(
    "payload",
    [
        {"student_id": 0, "subject": "math", "assignment": "Quiz"},
        {"student_id": 42, "subject": "", "assignment": "Quiz"},
        {"student_id": 42, "subject": "math", "assignment": "   "},
        {"student_id": 42, "subject": "math", "assignment": "Quiz", "grade": -1},
        {"student_id": 42, "subject": "math", "assignment": "Quiz", "grade": 1000},
    ],
)
def test_create_rejects_invalid_payloads(client, access, monkeypatch, payload):
    monkeypatch.setattr(assignments, "create_assignment", lambda data: pytest.fail("should not save"))

    response = client.post("/assignments-create", json=payload)

    assert response.status_code == 422


def test_create_for_other_users_student_is_404(client, access, monkeypatch):
    monkeypatch.setattr(assignments, "create_assignment", lambda data: pytest.fail("should not save"))

    response = client.post(
        "/assignments-create", json={"student_id": 7, "subject": "math", "assignment": "Quiz"}
    )

    assert response.status_code == 404


def test_admins_cannot_write_grades(access, stored_assignment, monkeypatch):
    client = make_client("admin")
    monkeypatch.setattr(assignments, "create_assignment", lambda data: pytest.fail("should not save"))

    create = client.post(
        "/assignments-create", json={"student_id": 42, "subject": "math", "assignment": "Quiz"}
    )
    update = client.put(f"/assignments-update/{ASSIGNMENT_ID}", json={"grade": 50})
    delete = client.delete(f"/assignments-delete/{ASSIGNMENT_ID}")

    assert create.status_code == update.status_code == delete.status_code == 403


def test_create_database_failure_is_500(client, access, monkeypatch):
    monkeypatch.setattr(assignments, "create_assignment", lambda data: None)

    response = client.post(
        "/assignments-create", json={"student_id": 42, "subject": "math", "assignment": "Quiz"}
    )

    assert response.status_code == 500


################################ UPDATE / DELETE #############################

def test_update_only_sends_fields_that_were_set(client, stored_assignment, monkeypatch):
    saved = {}
    monkeypatch.setattr(
        assignments,
        "update_assignment",
        lambda assignment_id, updates: saved.update(id=assignment_id, updates=updates) or {"id": assignment_id},
    )

    response = client.put(
        f"/assignments-update/{ASSIGNMENT_ID}", json={"grade": 75, "subject": "science"}
    )

    assert response.status_code == 200
    assert saved == {"id": ASSIGNMENT_ID, "updates": {"grade": 75, "class": "science"}}


def test_update_with_no_fields_is_400(client, stored_assignment):
    response = client.put(f"/assignments-update/{ASSIGNMENT_ID}", json={})
    assert response.status_code == 400


def test_update_missing_assignment_is_404(client, stored_assignment, monkeypatch):
    monkeypatch.setattr(assignments, "update_assignment", lambda *args: pytest.fail("should not save"))

    response = client.put(
        "/assignments-update/99999999-2222-3333-4444-555555555555", json={"grade": 75}
    )

    assert response.status_code == 404


def test_update_checks_access_to_assignments_student(client, monkeypatch, access):
    other = {"id": ASSIGNMENT_ID, "student_id": 7}
    monkeypatch.setattr(assignments, "fetch_assignment", lambda assignment_id: other)
    monkeypatch.setattr(assignments, "update_assignment", lambda *args: pytest.fail("should not save"))

    response = client.put(f"/assignments-update/{ASSIGNMENT_ID}", json={"grade": 75})

    assert response.status_code == 404


def test_delete_assignment(client, stored_assignment, monkeypatch):
    deleted = []
    monkeypatch.setattr(
        assignments, "delete_assignment", lambda assignment_id: deleted.append(assignment_id) or True
    )

    response = client.delete(f"/assignments-delete/{ASSIGNMENT_ID}")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert deleted == [ASSIGNMENT_ID]


def test_delete_that_removes_nothing_is_404(client, stored_assignment, monkeypatch):
    monkeypatch.setattr(assignments, "delete_assignment", lambda assignment_id: False)

    response = client.delete(f"/assignments-delete/{ASSIGNMENT_ID}")

    assert response.status_code == 404
