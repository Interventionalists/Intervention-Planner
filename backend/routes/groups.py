from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from auth.security import get_current_user
from database.supabase_client import (
    create_groups,
    fetch_groups,
    fetch_interventionists,
    fetch_user_school_by_public_id,
)

router = APIRouter()


class GroupCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1)
    purpose: str = Field(min_length=1)


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
        interventionist_id = (
            user["public_id"] if user["role"] == "interventionist" else None
        )
        group = create_groups(
            school_id,
            payload.name,
            payload.purpose,
            interventionist_id,
        )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if group is None:
        raise HTTPException(status_code=500, detail="Group creation failed.")
    return {"group": group}
