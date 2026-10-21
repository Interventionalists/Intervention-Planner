import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from routes import students


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(students.router)
    app.dependency_overrides[students.get_current_user] = lambda: {
        "id": 1,
        "public_id": "interventionist-123",
        "role": "interventionist",
    }
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_create_state_test_score(client, monkeypatch):
    saved = {}

    def fake_create_score(student, test_name, grade, school_id=None):
        saved.update(
            student=student,
            test_name=test_name,
            grade=grade,
            school_id=school_id,
        )
        return {"id": 11, **saved}

    monkeypatch.setattr(
        students, "fetch_user_school_by_public_id", lambda public_id: 4
    )
    monkeypatch.setattr(students, "create_state_test_score", fake_create_score)

    response = client.post(
        "/students-state-test-scoring",
        json={"student": 42, "test_name": "Custom District Test", "grade": 512},
    )

    assert response.status_code == 201
    assert saved == {
        "student": 42,
        "test_name": "Custom District Test",
        "grade": 512,
        "school_id": 4,
    }
    assert response.json()["score"]["id"] == 11


def test_create_state_test_score_rejects_teacher(client, monkeypatch):
    client.app.dependency_overrides[students.get_current_user] = lambda: {
        "id": 2,
        "public_id": "teacher-123",
        "role": "teacher",
    }
    monkeypatch.setattr(
        students,
        "create_state_test_score",
        lambda *args, **kwargs: pytest.fail("Unauthorized request reached database"),
    )

    response = client.post(
        "/students-state-test-scoring",
        json={"student": 42, "test_name": "SAT", "grade": 512},
    )

    assert response.status_code == 403