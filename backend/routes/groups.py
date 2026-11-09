from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from auth.security import get_current_user
from database.supabase_client import (
    add_students_to_group,
    create_groups,
    fetch_groups,
    fetch_group_student_ids,
    fetch_interventionist_students,
    fetch_interventionists,
    fetch_students,
    fetch_user_school_by_public_id,
    edit_group as update_group_record,
    replace_group_students,
)

router = APIRouter()


class GroupCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    purpose: str = Field(min_length=1)
    student_ids: list[int] | None = None


@router.get("/groups-fetch")
def get_groups(user: dict = Depends(get_current_user)):
    try:
        school_id = fetch_user_school_by_public_id(user["public_id"])
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        groups = fetch_groups(school_id)
        student_ids_by_group = fetch_group_student_ids(
            [group["id"] for group in groups]
        )
        interventionists = fetch_interventionists(school_id)
        names_by_id = {
            str(interventionist["public_id"]): " ".join(
                part
                for part in (
                    interventionist.get("first_name"),
                    interventionist.get("last_name"),
                )
                if part
            )
            for interventionist in interventionists
        }
        groups = [
            {
                **group,
                "student_ids": student_ids_by_group.get(group["id"], []),
                "interventionist_name": names_by_id.get(
                    str(group.get("interventionist"))
                ),
            }
            for group in groups
        ]
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"groups": groups}


@router.post("/groups-create")
def add_group(
    payload: GroupCreate,
    user: dict = Depends(get_current_user),
):
    if user["role"] not in ("admin", "interventionist"):
        raise HTTPException(
            status_code=403,
            detail="Only admins and interventionists can create groups.",
        )
    try:
        school_id = fetch_user_school_by_public_id(user["public_id"])
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        student_ids = payload.student_ids or []
        if len(student_ids) != len(set(student_ids)):
            raise HTTPException(
                status_code=400,
                detail="A student can only be added to the group once.",
            )
        if student_ids:
            available_students = (
                fetch_students(school_id)
                if user["role"] == "admin"
                else fetch_interventionist_students(user["public_id"], school_id)
            )
            available_student_ids = {
                student["id"] for student in available_students
            }
            if not set(student_ids).issubset(available_student_ids):
                raise HTTPException(
                    status_code=400,
                    detail="One or more selected students are not available to you.",
                )
        interventionist_id = (
            user["public_id"] if user["role"] == "interventionist" else None
        )
        group = create_groups(
            school_id,
            payload.name,
            payload.purpose,
            interventionist_id,
        )
        if group is not None and student_ids:
            members = add_students_to_group(
                group["id"], student_ids, user["public_id"]
            )
            if not members:
                raise HTTPException(
                    status_code=500,
                    detail="The group was created, but adding students failed.",
                )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if group is None:
        raise HTTPException(status_code=500, detail="Group creation failed.")
    return {"group": group}


@router.put("/groups-edit/{group_id}")
def update_group(
    group_id: int,
    payload: GroupCreate,
    user: dict = Depends(get_current_user),
):
    if user["role"] not in ("admin", "interventionist"):
        raise HTTPException(
            status_code=403,
            detail="Only admins and interventionists can edit groups.",
        )
    try:
        school_id = fetch_user_school_by_public_id(user["public_id"])
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        if payload.student_ids is not None:
            if len(payload.student_ids) != len(set(payload.student_ids)):
                raise HTTPException(
                    status_code=400,
                    detail="A student can only be added to the group once.",
                )
            if payload.student_ids:
                available_students = (
                    fetch_students(school_id)
                    if user["role"] == "admin"
                    else fetch_interventionist_students(
                        user["public_id"], school_id
                    )
                )
                available_student_ids = {
                    student["id"] for student in available_students
                }
                if not set(payload.student_ids).issubset(available_student_ids):
                    raise HTTPException(
                        status_code=400,
                        detail="One or more selected students are not available to you.",
                    )
        updates = {
            "name": payload.name,
            "purpose": payload.purpose,
        }
        group = update_group_record(group_id, school_id, updates)
        if group is not None and payload.student_ids is not None:
            replace_group_students(
                group_id, payload.student_ids, user["public_id"]
            )
            group["student_ids"] = payload.student_ids
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found.")
    return {"group": group}