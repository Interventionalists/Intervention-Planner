# ------------------------------------------------------------------------------
#
# Name:        test_students.py
# Purpose:     check student listing, assignment to interventionists, profile
#              updates, and goal setting. State test scores live in
#              test_state_test_scoring.py.
#
# ------------------------------------------------------------------------------

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from routes import students

ME = "11111111-1111-1111-1111-111111111111"
OTHER = "22222222-2222-2222-2222-222222222222"
INTERVENTIONIST = "33333333-3333-3333-3333-333333333333"


def make_client(role="interventionist", public_id=ME):
    app = FastAPI()
    app.include_router(students.router)
    app.dependency_overrides[students.get_current_user] = lambda: {
        "id": 1, "public_id": public_id, "role": role,
    }
    return TestClient(app)


@pytest.fixture
def client():
    return make_client()


@pytest.fixture
def school(monkeypatch):
    """Every user is in school 4 unless a test overrides it."""
    monkeypatch.setattr(students, "fetch_user_school_by_public_id", lambda public_id: 4)


################################ LISTING #####################################

def test_students_are_scoped_to_callers_school(client, monkeypatch, school):
    seen = {}
    monkeypatch.setattr(
        students, "fetch_students", lambda school_id: seen.update(school=school_id) or [{"id": 1}]
    )

    response = client.get("/students-fetch")

    assert response.status_code == 200
    assert seen == {"school": 4}


def test_user_without_school_sees_no_students(client, monkeypatch):
    monkeypatch.setattr(students, "fetch_user_school_by_public_id", lambda public_id: None)
    monkeypatch.setattr(students, "fetch_students", lambda school_id: pytest.fail("must not list all"))

    response = client.get("/students-fetch")

    assert response.json() == {"students": []}


def test_cannot_list_another_interventionists_students(client, school):
    response = client.get(f"/students-fetch/{OTHER}")
    assert response.status_code == 403


def test_unassigned_students_need_a_school(client, monkeypatch):
    monkeypatch.setattr(students, "fetch_user_school_by_public_id", lambda public_id: None)

    response = client.get(f"/students-unassigned-fetch/{ME}")

    assert response.status_code == 403


################################ ASSIGNMENT ##################################

def test_assign_student_within_school(client, monkeypatch, school):
    calls = {}

    def fake_assign(student_id, interventionist_id, school_id):
        calls.update(student=student_id, interventionist=interventionist_id, school=school_id)
        return {"id": student_id}

    monkeypatch.setattr(students, "assign_student_to_interventionist", fake_assign)

    response = client.patch(
        "/students-assign/8",
        json={"interventionist_id": INTERVENTIONIST, "requester_id": ME},
    )

    assert response.status_code == 200
    assert calls == {"student": 8, "interventionist": INTERVENTIONIST, "school": 4}


def test_assign_to_unknown_interventionist_is_400(client, monkeypatch, school):
    def fake_assign(*args):
        raise ValueError("Interventionist not found.")

    monkeypatch.setattr(students, "assign_student_to_interventionist", fake_assign)

    response = client.patch(
        "/students-assign/8",
        json={"interventionist_id": INTERVENTIONIST, "requester_id": ME},
    )

    assert response.status_code == 400


def test_assign_already_assigned_student_is_404(client, monkeypatch, school):
    monkeypatch.setattr(students, "assign_student_to_interventionist", lambda *args: None)

    response = client.patch(
        "/students-assign/8",
        json={"interventionist_id": INTERVENTIONIST, "requester_id": ME},
    )

    assert response.status_code == 404


def test_assign_on_behalf_of_someone_else_is_forbidden(client, school):
    response = client.patch(
        "/students-assign/8",
        json={"interventionist_id": INTERVENTIONIST, "requester_id": OTHER},
    )
    assert response.status_code == 403


################################ PROFILE #####################################

@pytest.fixture
def profile_store(monkeypatch, school):
    saved = {}
    monkeypatch.setattr(
        students,
        "fetch_interventionists",
        lambda school_id: [{"public_id": INTERVENTIONIST}],
    )

    def fake_update(student_id, school_id, updates):
        saved.update(student=student_id, school=school_id, updates=updates)
        return {"id": student_id, **updates}

    monkeypatch.setattr(students, "update_student_profile", fake_update)
    return saved


def test_profile_update_needs_at_least_one_field(client, profile_store):
    response = client.patch("/students-profile/8", json={"requester_id": ME})

    assert response.status_code == 422
    assert profile_store == {}


def test_profile_update_sets_group(client, profile_store):
    response = client.patch("/students-profile/8", json={"requester_id": ME, "group_number": 2})

    assert response.status_code == 200
    assert profile_store == {"student": 8, "school": 4, "updates": {"group_number": 2}}


def test_unassigning_interventionist_also_clears_group(client, profile_store):
    client.patch("/students-profile/8", json={"requester_id": ME, "interventionist": None})

    assert profile_store["updates"] == {"interventionist": None, "group_number": None}


def test_interventionist_must_be_in_same_school(client, profile_store):
    response = client.patch(
        "/students-profile/8", json={"requester_id": ME, "interventionist": OTHER}
    )

    assert response.status_code == 400
    assert profile_store == {}


def test_reassigning_to_school_interventionist_saves_id_as_string(client, profile_store):
    response = client.patch(
        "/students-profile/8", json={"requester_id": ME, "interventionist": INTERVENTIONIST}
    )

    assert response.status_code == 200
    assert profile_store["updates"] == {"interventionist": INTERVENTIONIST}


@pytest.mark.parametrize("group", [0, -1])
def test_group_number_must_be_positive(client, profile_store, group):
    response = client.patch("/students-profile/8", json={"requester_id": ME, "group_number": group})
    assert response.status_code == 422


def test_profile_update_of_missing_student_is_404(client, monkeypatch, school):
    monkeypatch.setattr(students, "update_student_profile", lambda *args: None)

    response = client.patch("/students-profile/8", json={"requester_id": ME, "group_number": 1})

    assert response.status_code == 404


################################ GOALS #######################################

def test_goals_accept_known_subjects_in_range():
    request = students.StudentGoalsRequest(goals={"math": 0, "p_e": 100, "science": 72.5})
    assert request.goals["science"] == 72.5


@pytest.mark.parametrize(
    "goals",
    [
        {"history": 80},
        {"math": -1},
        {"math": 100.01},
        {"math": float("nan")},
        {"math": float("inf")},
    ],
)
def test_goals_reject_bad_subjects_or_grades(goals):
    with pytest.raises(ValidationError):
        students.StudentGoalsRequest(goals=goals)


@pytest.fixture
def goal_store(monkeypatch):
    state = {"existing": None, "created": None, "updated": None}
    monkeypatch.setattr(students, "require_student_access", lambda user, student_id: None)
    monkeypatch.setattr(students, "get_student_goals_record", lambda sid: state["existing"])
    monkeypatch.setattr(
        students, "insert_student_goals",
        lambda sid, goals: state.update(created=goals) or goals,
    )
    monkeypatch.setattr(
        students, "save_student_goals",
        lambda sid, goals: state.update(updated=goals) or goals,
    )
    return state


def test_first_goals_are_inserted(client, goal_store):
    response = client.post("/students-setGoals/8", json={"goals": {"math": 80}})

    assert response.status_code == 200
    assert goal_store["created"] == {"math": 80}
    assert goal_store["updated"] is None


def test_existing_goals_are_updated(client, goal_store):
    goal_store["existing"] = {"math": 70}

    client.post("/students-setGoals/8", json={"goals": {"math": 85}})

    assert goal_store["updated"] == {"math": 85}
    assert goal_store["created"] is None


def test_goals_require_student_access(client, monkeypatch):
    def deny(user, student_id):
        raise HTTPException(status_code=404, detail="Student not found")

    monkeypatch.setattr(students, "require_student_access", deny)

    assert client.post("/students-setGoals/8", json={"goals": {"math": 85}}).status_code == 404
    assert client.get("/students-fetchGoals/8").status_code == 404


################################ CREATE ######################################

def test_create_student_drops_unset_fields(client, monkeypatch):
    saved = {}
    monkeypatch.setattr(students, "create_student", lambda **kw: saved.update(kw) or {"id": 1, **kw})

    response = client.post(
        "/students-insert",
        json={"first_name": " Sam ", "last_name": "Student", "interventionist": INTERVENTIONIST},
    )

    assert response.status_code == 201
    assert saved == {"first_name": "Sam", "last_name": "Student", "interventionist": INTERVENTIONIST}


def test_create_student_requires_names(client, monkeypatch):
    monkeypatch.setattr(students, "create_student", lambda **kw: pytest.fail("should not save"))

    response = client.post("/students-insert", json={"first_name": "", "last_name": "Student"})

    assert response.status_code == 422
