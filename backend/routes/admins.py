import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from auth.security import require_admin, same_school, user_school
from database.supabase_client import (
    fetch_admins,
    fetch_user_school,
    fetch_users_page,
    update_user,
)

router = APIRouter()


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=254)
    role: Literal["teacher", "interventionist", "admin"]
    school: int | None = Field(default=None, ge=1)

    @field_validator("email")
    @classmethod
    def validate_email(cls, email: str) -> str:
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise ValueError("Enter a valid email address.")
        return email


#the admin's own school; every admin route is scoped to it
def _require_admin_school(admin: dict):
    school_id = user_school(admin)
    if school_id is None:
        raise HTTPException(
            status_code=403,
            detail="The signed-in user does not have a school assigned.",
        )
    return school_id


#admins may manage users in their own school and unassigned users (so they can
#bring new accounts into their school). Anyone else reads as not found.
def _require_manageable_user(admin: dict, user_id: int) -> None:
    _require_admin_school(admin)
    target_school = fetch_user_school(user_id)
    if target_school is not None and not same_school(admin, target_school):
        raise HTTPException(status_code=404, detail="User not found.")


#fetch the admins in the caller's school
@router.get("/admins-fetch")
def get_admins(admin: dict = Depends(require_admin)):
    school_id = _require_admin_school(admin)
    try:
        admins = fetch_admins(school_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Unable to load admins.") from e
    return {"admins": admins}

@router.get("/admins-fetch-all-users")
def get_all_users(
    page: int = Query(default=1, ge=1),
    search: str = Query(default="", max_length=100),
    role: Literal["teacher", "interventionist", "admin"] | None = None,
    admin: dict = Depends(require_admin),
):
    school_id = _require_admin_school(admin)
    try:
        result = fetch_users_page(school_id, page, search.strip(), role)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Unable to load users.") from e
    total_pages = (result["total"] + result["page_size"] - 1) // result["page_size"]
    return {**result, "page": page, "total_pages": total_pages}


@router.patch("/admins-users/{user_id}")
def update_user_info(
    user_id: int,
    payload: UserUpdateRequest,
    admin: dict = Depends(require_admin),
):
    _require_manageable_user(admin, user_id)
    #an admin can only assign their own school (or unassign); never move a user
    #into a school they don't administer
    if payload.school is not None and not same_school(admin, payload.school):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only assign users to your own school.",
        )
    try:
        updated_user = update_user(
            user_id,
            payload.model_dump(),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update user.",
        ) from e
    if updated_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return {"user": updated_user}

#updates the locked-until time for a user; a time in the past unlocks them.
#locked_until must carry a timezone, since login compares it to an aware now.
@router.patch("/admins-users-lock/{user_id}")
def update_user_lock(
    user_id: int,
    locked_until: datetime,
    failed_login_attempts: int = Query(default=0, ge=0),
    admin: dict = Depends(require_admin),
):
    if locked_until.tzinfo is None or locked_until.utcoffset() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="locked_until must include a timezone.",
        )
    _require_manageable_user(admin, user_id)
    try:
        updated_user = update_user(
            user_id,
            {
                "locked_until": locked_until.isoformat(),
                "failed_login_attempts": failed_login_attempts,
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update user lock.",
        ) from e
    if updated_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return {"user": updated_user}
