import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import groups


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(groups.router)
    app.dependency_overrides[groups.get_current_user] = lambda: {
        "id": 1,
        "public_id": "user-123",
        "role": "interventionist",
    }

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_fetch_groups_scopes_to_school_and_includes_interventionist_name(
    client, monkeypatch
):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    monkeypatch.setattr(
        groups,
        "fetch_groups",
        lambda school_id: [
            {
                "id": 3,
                "name": "Reading group",
                "purpose": "Fluency practice",
                "interventionist": "user-123",
                "school": school_id,
            }
        ],
    )
    monkeypatch.setattr(
        groups,
        "fetch_interventionists",
        lambda school_id: [
            {
                "public_id": "user-123",
                "first_name": "Taylor",
                "last_name": "Teacher",
            }
        ],
    )

    response = client.get("/groups-fetch")

    assert response.status_code == 200
    assert response.json()["groups"] == [
        {
            "id": 3,
            "name": "Reading group",
            "purpose": "Fluency practice",
            "interventionist": "user-123",
            "school": 7,
            "interventionist_name": "Taylor Teacher",
        }
    ]


def test_create_group_assigns_interventionist_caller(client, monkeypatch):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    created = {}

    def fake_create_groups(school_id, name, purpose, interventionist_id):
        created.update(
            school_id=school_id,
            name=name,
            purpose=purpose,
            interventionist_id=interventionist_id,
        )
        return {"id": 3, **created}

    monkeypatch.setattr(groups, "create_groups", fake_create_groups)

    response = client.post(
        "/groups-create",
        json={"name": "Reading group", "purpose": "Fluency practice"},
    )

    assert response.status_code == 200
    assert created == {
        "school_id": 7,
        "name": "Reading group",
        "purpose": "Fluency practice",
        "interventionist_id": "user-123",
    }
    assert response.json()["group"]["id"] == 3


def test_create_group_rejects_teacher(client, monkeypatch):
    app = client.app
    app.dependency_overrides[groups.get_current_user] = lambda: {
        "id": 2,
        "public_id": "teacher-123",
        "role": "teacher",
    }
    monkeypatch.setattr(
        groups,
        "create_groups",
        lambda *_args: pytest.fail("Unauthorized group creation reached database"),
    )

    response = client.post(
        "/groups-create",
        json={"name": "Reading group", "purpose": "Fluency practice"},
    )

    assert response.status_code == 403


def test_create_group_rejects_blank_fields(client):
    response = client.post(
        "/groups-create",
        json={"name": "  ", "purpose": "  "},
    )

    assert response.status_code == 422
