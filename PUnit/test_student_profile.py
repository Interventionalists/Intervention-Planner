from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import students


def make_client(user):
    app = FastAPI()
    app.include_router(students.router)
    app.dependency_overrides[students.get_current_user] = lambda: user
    return TestClient(app)


def test_admin_can_update_student_and_parent_names(monkeypatch):
    user = {"public_id": "123e4567-e89b-12d3-a456-426614174000", "role": "admin"}
    client = make_client(user)
    saved = {}
    monkeypatch.setattr(students, "require_self_or_admin", lambda *_args: None)
    monkeypatch.setattr(students, "fetch_user_school_by_public_id", lambda _id: 7)

    def fake_update_student_profile(student_id, school_id, updates):
        saved.update(student_id=student_id, school_id=school_id, updates=updates)
        return {"id": student_id, **updates}

    monkeypatch.setattr(students, "update_student_profile", fake_update_student_profile)

    response = client.patch(
        "/students-profile/42",
        json={
            "requester_id": "123e4567-e89b-12d3-a456-426614174000",
            "first_name": "Jordan",
            "last_name": "Lee",
            "parent_name": "Taylor Lee",
        },
    )

    assert response.status_code == 200
    assert saved == {
        "student_id": 42,
        "school_id": 7,
        "updates": {
            "first_name": "Jordan",
            "last_name": "Lee",
            "parent_name": "Taylor Lee",
        },
    }


def test_non_admin_cannot_update_student_name(monkeypatch):
    user = {"public_id": "223e4567-e89b-12d3-a456-426614174000", "role": "teacher"}
    client = make_client(user)
    monkeypatch.setattr(students, "require_self_or_admin", lambda *_args: None)
    monkeypatch.setattr(
        students,
        "fetch_user_school_by_public_id",
        lambda _id: 7,
    )
    monkeypatch.setattr(
        students,
        "update_student_profile",
        lambda *_args: (_ for _ in ()).throw(AssertionError("Update should be blocked")),
    )

    response = client.patch(
        "/students-profile/42",
        json={
            "requester_id": "223e4567-e89b-12d3-a456-426614174000",
            "first_name": "Jordan",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"