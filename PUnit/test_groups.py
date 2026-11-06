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
        groups, "fetch_group_student_ids", lambda group_ids: {3: [11, 12]}
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
            "student_ids": [11, 12],
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


def test_create_group_adds_selected_assigned_students(client, monkeypatch):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    monkeypatch.setattr(
        groups,
        "fetch_interventionist_students",
        lambda interventionist_id, school_id: [
            {"id": 11, "school": school_id, "interventionist": interventionist_id}
        ],
    )
    monkeypatch.setattr(
        groups,
        "create_groups",
        lambda school_id, name, purpose, interventionist_id: {
            "id": 3,
            "school": school_id,
            "name": name,
            "purpose": purpose,
            "interventionist": interventionist_id,
        },
    )
    added_members = {}

    def fake_add_students_to_group(group_id, student_ids, added_by):
        added_members.update(
            group_id=group_id, student_ids=student_ids, added_by=added_by
        )
        return [{"group_id": group_id, "student_id": student_ids[0]}]

    monkeypatch.setattr(groups, "add_students_to_group", fake_add_students_to_group)

    response = client.post(
        "/groups-create",
        json={
            "name": "Reading group",
            "purpose": "Fluency practice",
            "student_ids": [11],
        },
    )

    assert response.status_code == 200
    assert added_members == {
        "group_id": 3,
        "student_ids": [11],
        "added_by": "user-123",
    }


def test_create_group_rejects_students_not_assigned_to_interventionist(
    client, monkeypatch
):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    monkeypatch.setattr(
        groups, "fetch_interventionist_students", lambda *_args: []
    )
    monkeypatch.setattr(
        groups,
        "create_groups",
        lambda *_args: pytest.fail("Invalid student reached group creation"),
    )

    response = client.post(
        "/groups-create",
        json={
            "name": "Reading group",
            "purpose": "Fluency practice",
            "student_ids": [11],
        },
    )

    assert response.status_code == 400


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


def test_edit_group_updates_name_and_purpose_in_callers_school(client, monkeypatch):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    updated = {}

    def fake_update_group(group_id, school_id, updates):
        updated.update(group_id=group_id, school_id=school_id, **updates)
        return {"id": group_id, "school": school_id, **updates}

    monkeypatch.setattr(groups, "update_group_record", fake_update_group)

    response = client.put(
        "/groups-edit/3",
        json={"name": "Updated group", "purpose": "Updated purpose"},
    )

    assert response.status_code == 200
    assert updated == {
        "group_id": 3,
        "school_id": 7,
        "name": "Updated group",
        "purpose": "Updated purpose",
    }
    assert response.json()["group"] == {
        "id": 3,
        "school": 7,
        "name": "Updated group",
        "purpose": "Updated purpose",
    }


def test_edit_group_rejects_missing_group(client, monkeypatch):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    monkeypatch.setattr(groups, "update_group_record", lambda *_args: None)

    response = client.put(
        "/groups-edit/999",
        json={"name": "Updated group", "purpose": "Updated purpose"},
    )

    assert response.status_code == 404


def test_edit_group_replaces_selected_students(client, monkeypatch):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    monkeypatch.setattr(
        groups,
        "fetch_interventionist_students",
        lambda interventionist_id, school_id: [
            {"id": 11, "school": school_id, "interventionist": interventionist_id},
            {"id": 12, "school": school_id, "interventionist": interventionist_id},
        ],
    )
    monkeypatch.setattr(
        groups,
        "update_group_record",
        lambda group_id, school_id, updates: {
            "id": group_id,
            "school": school_id,
            **updates,
        },
    )
    replaced = {}

    def fake_replace_group_students(group_id, student_ids, added_by):
        replaced.update(
            group_id=group_id, student_ids=student_ids, added_by=added_by
        )
        return student_ids

    monkeypatch.setattr(groups, "replace_group_students", fake_replace_group_students)

    response = client.put(
        "/groups-edit/3",
        json={
            "name": "Reading group",
            "purpose": "Fluency practice",
            "student_ids": [12],
        },
    )

    assert response.status_code == 200
    assert replaced == {
        "group_id": 3,
        "student_ids": [12],
        "added_by": "user-123",
    }
    assert response.json()["group"]["student_ids"] == [12]


def test_edit_group_rejects_students_not_assigned_to_interventionist(
    client, monkeypatch
):
    monkeypatch.setattr(
        groups, "fetch_user_school_by_public_id", lambda _public_id: 7
    )
    monkeypatch.setattr(
        groups, "fetch_interventionist_students", lambda *_args: []
    )
    monkeypatch.setattr(
        groups,
        "update_group_record",
        lambda *_args: pytest.fail("Invalid student reached group update"),
    )

    response = client.put(
        "/groups-edit/3",
        json={
            "name": "Reading group",
            "purpose": "Fluency practice",
            "student_ids": [11],
        },
    )

    assert response.status_code == 400
