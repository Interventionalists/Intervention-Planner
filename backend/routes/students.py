from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from auth.security import get_current_user, require_self_or_admin
from database.supabase_client import (
    assign_student_to_interventionist,
    create_student,
    fetch_interventionists,
    fetch_interventionist_students,
    fetch_students,
    fetch_unassigned_students,
    fetch_user_school_by_public_id,
    update_student_profile,
)

router = APIRouter()


class StudentCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    grade_level: int | None = Field(default=None, ge=-32768, le=32767)
    teacher: UUID | None = None
    interventionist: UUID | None = None
    school: int | None = Field(default=None, ge=1, le=9223372036854775807)
    profile_api_link: str | None = None


class StudentAssignmentRequest(BaseModel):
    interventionist_id: UUID
    requester_id: UUID


class StudentProfileUpdateRequest(BaseModel):
    requester_id: UUID
    interventionist: UUID | None = None
    group_number: int | None = Field(default=None, ge=1)


#admins see every student; everyone else only sees students in their own school.
@router.get("/students-fetch")
def get_all_students(user: dict = Depends(get_current_user)):
    try:
        if user["role"] == "admin":
            students = fetch_students()
        else:
            school_id = fetch_user_school_by_public_id(user["public_id"])
            students = [] if school_id is None else fetch_students(school_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"students": students}


@router.get("/students-fetch/{interventionist_id}")
def get_students(interventionist_id: UUID, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, interventionist_id)
    try:
        school_id = fetch_user_school_by_public_id(str(interventionist_id))
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        students = fetch_interventionist_students(
            str(interventionist_id), school_id
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"students": students}


@router.get("/students-unassigned-fetch/{requester_id}")
def get_unassigned_students(requester_id: UUID, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, requester_id)
    try:
        school_id = fetch_user_school_by_public_id(str(requester_id))
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        students = fetch_unassigned_students(school_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"students": students}


@router.patch("/students-assign/{student_id}")
def assign_student(
    student_id: int,
    payload: StudentAssignmentRequest,
    user: dict = Depends(get_current_user),
):
    require_self_or_admin(user, payload.requester_id)
    try:
        school_id = fetch_user_school_by_public_id(str(payload.requester_id))
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        student = assign_student_to_interventionist(
            student_id, str(payload.interventionist_id), school_id
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if student is None:
        raise HTTPException(
            status_code=404,
            detail="Unassigned student not found.",
        )
    return {"student": student}


@router.patch("/students-profile/{student_id}")
def update_student(
    student_id: int,
    payload: StudentProfileUpdateRequest,
    user: dict = Depends(get_current_user),
):
    require_self_or_admin(user, payload.requester_id)
    updates = payload.model_dump(
        exclude={"requester_id"},
        exclude_unset=True,
    )
    if not updates:
        raise HTTPException(
            status_code=422,
            detail="Provide an interventionist or group number to update.",
        )
    if "interventionist" in updates and updates["interventionist"] is None:
        updates["group_number"] = None

    try:
        school_id = fetch_user_school_by_public_id(str(payload.requester_id))
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )

        interventionist_id = updates.get("interventionist")
        if interventionist_id is not None:
            interventionist = fetch_interventionists(school_id)
            if not any(
                str(candidate["public_id"]) == str(interventionist_id)
                for candidate in interventionist
            ):
                raise HTTPException(
                    status_code=400,
                    detail="The interventionist must belong to your school.",
                )
            updates["interventionist"] = str(interventionist_id)

        student = update_student_profile(student_id, school_id, updates)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    if student is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    return {"student": student}


@router.get("/students-fetchName/{student_id}")
def get_student_name(student_id: str):
    try:
        student_name = fetch_student_name(student_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"student_name": student_name}

#insert a new student into the database
@router.post("/students-insert", status_code=status.HTTP_201_CREATED)
def insert_student(payload: StudentCreateRequest):
    try:
        student = create_student(**payload.model_dump(mode="json", exclude_none=True))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to create student: {e}",
        ) from e
    return {"student": student}