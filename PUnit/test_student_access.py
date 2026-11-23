import pytest
from fastapi import HTTPException

from auth import security

STUDENT = {"school": 7, "teacher": "teacher-1", "interventionist": "interv-1"}


@pytest.fixture
def student_in_school_7(monkeypatch):
    monkeypatch.setattr(security, "fetch_student_ownership", lambda _id: dict(STUDENT))


def set_user_school(monkeypatch, school):
    monkeypatch.setattr(security, "fetch_user_school_by_public_id", lambda _id: school)


def user(role, public_id):
    return {"id": 1, "public_id": public_id, "role": role}


def test_admin_can_reach_student_in_own_school(student_in_school_7, monkeypatch):
    set_user_school(monkeypatch, 7)
    security.require_student_access(user("admin", "admin-1"), 42)


@pytest.mark.parametrize("school", [8, None])
def test_admin_blocked_outside_own_school(student_in_school_7, monkeypatch, school):
    set_user_school(monkeypatch, school)
    with pytest.raises(HTTPException) as error:
        security.require_student_access(user("admin", "admin-1"), 42)
    assert error.value.status_code == 404


def test_assigned_teacher_can_reach_student(student_in_school_7):
    security.require_student_access(user("teacher", "teacher-1"), 42)


def test_other_teacher_in_same_school_is_blocked(student_in_school_7, monkeypatch):
    set_user_school(monkeypatch, 7)
    with pytest.raises(HTTPException) as error:
        security.require_student_access(user("teacher", "teacher-2"), 42)
    assert error.value.status_code == 404


def test_assigned_interventionist_can_reach_student(student_in_school_7, monkeypatch):
    monkeypatch.setattr(
        security,
        "fetch_user_school_by_public_id",
        lambda _id: pytest.fail("owner check should not need a school lookup"),
    )
    security.require_student_access(user("interventionist", "interv-1"), 42)


def test_interventionist_can_reach_unassigned_student_in_own_school(
    student_in_school_7, monkeypatch
):
    set_user_school(monkeypatch, 7)
    security.require_student_access(user("interventionist", "interv-2"), 42)


@pytest.mark.parametrize("school", [8, None])
def test_interventionist_blocked_outside_own_school(
    student_in_school_7, monkeypatch, school
):
    set_user_school(monkeypatch, school)
    with pytest.raises(HTTPException) as error:
        security.require_student_access(user("interventionist", "interv-2"), 42)
    assert error.value.status_code == 404


def test_unknown_role_is_blocked(student_in_school_7):
    with pytest.raises(HTTPException) as error:
        security.require_student_access(user("parent", "someone"), 42)
    assert error.value.status_code == 404


def test_missing_student_is_404(monkeypatch):
    monkeypatch.setattr(security, "fetch_student_ownership", lambda _id: None)
    with pytest.raises(HTTPException) as error:
        security.require_student_access(user("admin", "admin-1"), 42)
    assert error.value.status_code == 404
