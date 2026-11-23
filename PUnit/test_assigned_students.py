import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from auth import security
from routes import students

TEACHER_ID = "11111111-1111-1111-1111-111111111111"
INTERVENTIONIST_ID = "22222222-2222-2222-2222-222222222222"
OTHER_ID = "33333333-3333-3333-3333-333333333333"


def make_client(user):
    app = FastAPI()
    app.include_router(students.router)
    app.dependency_overrides[students.get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def record_fetch(monkeypatch):
    calls = []

    def fake_fetch(owner_id, owner_column, school_id):
        calls.append((owner_id, owner_column, school_id))
        return [{"id": 1, "first_name": "Ada"}]

    monkeypatch.setattr(students, "fetch_assigned_students", fake_fetch)
    return calls


def set_target_user(monkeypatch, role, school=7):
    monkeypatch.setattr(
        students,
        "fetch_user_role_and_school_by_public_id",
        lambda _public_id: {"role": role, "school": school},
    )


def test_teacher_gets_students_by_teacher_column(monkeypatch, record_fetch):
    set_target_user(monkeypatch, "teacher")
    client = make_client({"public_id": TEACHER_ID, "role": "teacher"})

    response = client.get(f"/students-fetch/{TEACHER_ID}")

    assert response.status_code == 200
    assert response.json() == {"students": [{"id": 1, "first_name": "Ada"}]}
    assert record_fetch == [(TEACHER_ID, "teacher", 7)]


def test_interventionist_gets_students_by_interventionist_column(
    monkeypatch, record_fetch
):
    set_target_user(monkeypatch, "interventionist")
    client = make_client(
        {"public_id": INTERVENTIONIST_ID, "role": "interventionist"}
    )

    response = client.get(f"/students-fetch/{INTERVENTIONIST_ID}")

    assert response.status_code == 200
    assert record_fetch == [(INTERVENTIONIST_ID, "interventionist", 7)]


def test_admin_viewing_a_teacher_uses_the_teachers_role(monkeypatch, record_fetch):
    set_target_user(monkeypatch, "teacher")
    monkeypatch.setattr(security, "fetch_user_school_by_public_id", lambda _id: 7)
    client = make_client({"public_id": OTHER_ID, "role": "admin", "school": 7})

    response = client.get(f"/students-fetch/{TEACHER_ID}")

    assert response.status_code == 200
    assert record_fetch == [(TEACHER_ID, "teacher", 7)]


def test_admin_cannot_view_teacher_in_another_school(monkeypatch, record_fetch):
    set_target_user(monkeypatch, "teacher", school=8)
    monkeypatch.setattr(security, "fetch_user_school_by_public_id", lambda _id: 8)
    client = make_client({"public_id": OTHER_ID, "role": "admin", "school": 7})

    response = client.get(f"/students-fetch/{TEACHER_ID}")

    assert response.status_code == 403
    assert record_fetch == []


def test_role_without_assigned_students_gets_empty_list(monkeypatch, record_fetch):
    set_target_user(monkeypatch, "admin")
    client = make_client({"public_id": OTHER_ID, "role": "admin"})

    response = client.get(f"/students-fetch/{OTHER_ID}")

    assert response.status_code == 200
    assert response.json() == {"students": []}
    assert record_fetch == []


def test_user_without_school_is_rejected(monkeypatch, record_fetch):
    set_target_user(monkeypatch, "teacher", school=None)
    client = make_client({"public_id": TEACHER_ID, "role": "teacher"})

    response = client.get(f"/students-fetch/{TEACHER_ID}")

    assert response.status_code == 403
    assert record_fetch == []


def test_teacher_cannot_fetch_another_users_students(monkeypatch, record_fetch):
    set_target_user(monkeypatch, "teacher")
    client = make_client({"public_id": TEACHER_ID, "role": "teacher"})

    response = client.get(f"/students-fetch/{OTHER_ID}")

    assert response.status_code == 403
    assert record_fetch == []
