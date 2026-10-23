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

    def fake_create_score(student, test_name, grade, year_taken, school_id=None):
        saved.update(
            student=student,
            test_name=test_name,
            grade=grade,
            year_taken=year_taken,
            school_id=school_id,
        )
        return {"id": 11, **saved}

    monkeypatch.setattr(
        students, "fetch_user_school_by_public_id", lambda public_id: 4
    )
    monkeypatch.setattr(students, "create_state_test_score", fake_create_score)

    response = client.post(
        "/students-state-test-scoring",
        json={
            "student": 42,
            "test_name": "Custom District Test",
            "grade": 512,
            "year_taken": 2026,
        },
    )

    assert response.status_code == 201
    assert saved == {
        "student": 42,
        "test_name": "Custom District Test",
        "grade": 512,
        "year_taken": 2026,
        "school_id": 4,
    }
    assert response.json()["score"]["id"] == 11


def test_fetch_state_test_scores(client, monkeypatch):
    saved_scores = [
        {"id": 11, "student": 42, "test_name": "SAT", "grade": 1200, "year_taken": 2026}
    ]
    requested = {}

    def fake_fetch_scores(student, school_id=None):
        requested.update(student=student, school_id=school_id)
        return saved_scores

    monkeypatch.setattr(
        students, "fetch_user_school_by_public_id", lambda public_id: 4
    )
    monkeypatch.setattr(students, "fetch_state_test_scores", fake_fetch_scores)

    response = client.get("/students-state-test-scoring/42")

    assert response.status_code == 200
    assert response.json()["scores"] == saved_scores
    assert requested == {"student": 42, "school_id": 4}


def test_fetch_state_test_scores_rejects_teacher_without_school(client, monkeypatch):
    client.app.dependency_overrides[students.get_current_user] = lambda: {
        "id": 2,
        "public_id": "teacher-123",
        "role": "teacher",
    }
    monkeypatch.setattr(
        students, "fetch_user_school_by_public_id", lambda public_id: None
    )
    monkeypatch.setattr(
        students,
        "fetch_state_test_scores",
        lambda *args, **kwargs: pytest.fail("Unauthorized request reached database"),
    )

    response = client.get("/students-state-test-scoring/42")

    assert response.status_code == 403


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
        json={
            "student": 42,
            "test_name": "SAT",
            "grade": 510,
            "year_taken": 2026,
        },
    )

    assert response.status_code == 403


@pytest.mark.parametrize("score", [390, 401, 1601])
def test_create_sat_score_rejects_scores_outside_valid_range(client, monkeypatch, score):
    monkeypatch.setattr(
        students,
        "create_state_test_score",
        lambda *args, **kwargs: pytest.fail("Invalid SAT score reached database"),
    )

    response = client.post(
        "/students-state-test-scoring",
        json={
            "student": 42,
            "test_name": "SAT",
            "grade": score,
            "year_taken": 2026,
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize("score", [1, 36])
def test_create_act_score_accepts_valid_boundaries(client, monkeypatch, score):
    monkeypatch.setattr(
        students, "fetch_user_school_by_public_id", lambda public_id: 4
    )
    monkeypatch.setattr(
        students,
        "create_state_test_score",
        lambda student, test_name, grade, year_taken, school_id=None: {
            "student": student,
            "test_name": test_name,
            "grade": grade,
            "year_taken": year_taken,
        },
    )

    response = client.post(
        "/students-state-test-scoring",
        json={
            "student": 42,
            "test_name": "ACT",
            "grade": score,
            "year_taken": 2026,
        },
    )

    assert response.status_code == 201
    assert response.json()["score"]["grade"] == score


@pytest.mark.parametrize("score", [0, 37])
def test_create_act_score_rejects_scores_outside_range(client, monkeypatch, score):
    monkeypatch.setattr(
        students,
        "create_state_test_score",
        lambda *args, **kwargs: pytest.fail("Invalid ACT score reached database"),
    )

    response = client.post(
        "/students-state-test-scoring",
        json={
            "student": 42,
            "test_name": "ACT",
            "grade": score,
            "year_taken": 2026,
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize("test_name", ["MCA-Reading", "MCA-Math", "MCA-Science"])
@pytest.mark.parametrize("score", [200, 1300])
def test_create_mca_score_accepts_range_boundaries(
    client, monkeypatch, test_name, score
):
    monkeypatch.setattr(
        students, "fetch_user_school_by_public_id", lambda public_id: 4
    )
    monkeypatch.setattr(
        students,
        "create_state_test_score",
        lambda student, test_name, grade, year_taken, school_id=None: {
            "student": student,
            "test_name": test_name,
            "grade": grade,
            "year_taken": year_taken,
        },
    )

    response = client.post(
        "/students-state-test-scoring",
        json={
            "student": 42,
            "test_name": test_name,
            "grade": score,
            "year_taken": 2026,
        },
    )

    assert response.status_code == 201
    assert response.json()["score"]["grade"] == score


@pytest.mark.parametrize("test_name", ["MCA-Reading", "MCA-Math", "MCA-Science"])
@pytest.mark.parametrize("score", [199, 1301])
def test_create_mca_score_rejects_values_outside_range(
    client, monkeypatch, test_name, score
):
    monkeypatch.setattr(
        students,
        "create_state_test_score",
        lambda *args, **kwargs: pytest.fail("Invalid MCA score reached database"),
    )

    response = client.post(
        "/students-state-test-scoring",
        json={
            "student": 42,
            "test_name": test_name,
            "grade": score,
            "year_taken": 2026,
        },
    )

    assert response.status_code == 422