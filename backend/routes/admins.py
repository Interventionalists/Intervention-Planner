import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from database.supabase_client import fetch_admins, fetch_users_page, update_user

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


#fetch all admins from the database
@router.get("/admins-fetch")
def get_admins():
    try:
        admins = fetch_admins()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"admins": admins}

@router.get("/admins-fetch-all-users")
def get_all_users(
    page: int = Query(default=1, ge=1),
    search: str = Query(default="", max_length=100),
    role: Literal["teacher", "interventionist", "admin"] | None = None,
):
    try:
        result = fetch_users_page(page, search.strip(), role)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    total_pages = (result["total"] + result["page_size"] - 1) // result["page_size"]
    return {**result, "page": page, "total_pages": total_pages}


@router.patch("/admins-users/{user_id}")
def update_user_info(user_id: int, payload: UserUpdateRequest):
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