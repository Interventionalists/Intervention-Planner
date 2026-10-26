from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from auth.security import get_current_user, require_admin
from database.supabase_client import (
    fetch_school_logo_api,
    fetch_school_name,
    fetch_school_theme,
    fetch_schools,
    fetch_user_school,
    save_school_theme,
    update_user_school,
)

router = APIRouter()

DEFAULT_THEME = ["#172c50", "#079bd8", "#48b7f2"]


class ThemeUpdate(BaseModel):
    color_primary: str = Field(pattern=r"^[0-9a-fA-F]{6}$")
    color_secondary: str = Field(pattern=r"^[0-9a-fA-F]{6}$")
    color_tertiary: str = Field(pattern=r"^[0-9a-fA-F]{6}$")


def format_theme_color(color: str) -> str:
    return f"#{color.removeprefix('#')}"


#these routes take the integer users.id rather than public_id
def require_self_id_or_admin(user: dict, user_id: str) -> None:
    if user["role"] != "admin" and str(user["id"]) != str(user_id):
        raise HTTPException(status_code=403, detail="Not allowed")

#fetch all schools from the database
@router.get("/schools-fetch")
def get_schools():
    try:
        schools = fetch_schools()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"schools": schools}

#update user if the school has been changed through account
@router.get("/schools-update")
@router.put("/schools-update")
def update_school(user_id: str, new_school_id: str, user: dict = Depends(get_current_user)):
    require_self_id_or_admin(user, user_id)
    try:
        updated_user = update_user_school(user_id, new_school_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "School updated successfully", "user": updated_user[0]}

#get a user's school ID based off their user ID.
@router.get("/schools-user-school")
def get_user_school(user_id: str, user: dict = Depends(get_current_user)):
    require_self_id_or_admin(user, user_id)
    try:
        school_id = fetch_user_school(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not school_id:
        raise HTTPException(status_code=404, detail="User or school not found.")
    return {"school_id": school_id}


@router.get("/schools-name")
def get_school_name(school_id: str):
    try:
        school_name = fetch_school_name(school_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not school_name:
        raise HTTPException(status_code=404, detail="School not found.")
    return {"school_name": school_name}


@router.get("/schools-logo")
def get_school_logo(user: dict = Depends(get_current_user)):
    try:
        school_id = fetch_user_school(user["id"])
        if school_id is None:
            raise HTTPException(status_code=400, detail="Your user account is not assigned to a school.")
        logo_api = fetch_school_logo_api(school_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {"school_logo_api": logo_api}


@router.get("/schools-theme")
def get_school_theme(user: dict = Depends(get_current_user)):
    try:
        school_id = fetch_user_school(user["id"])
        if school_id is None:
            raise HTTPException(status_code=400, detail="Your user account is not assigned to a school.")
        theme = fetch_school_theme(school_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {
        "has_theme": theme is not None,
        "colors": (
            [
                format_theme_color(theme["color_primary"]),
                format_theme_color(theme["color_secondary"]),
                format_theme_color(theme["color_tertiary"]),
            ]
            if theme
            else DEFAULT_THEME
        )
    }


@router.put("/schools-theme")
def update_school_theme(
    payload: ThemeUpdate,
    user: dict = Depends(require_admin),
):
    try:
        school_id = fetch_user_school(user["id"])
        if school_id is None:
            raise HTTPException(status_code=400, detail="Your user account is not assigned to a school.")
        theme = save_school_theme(
            school_id,
            [
                payload.color_primary,
                payload.color_secondary,
                payload.color_tertiary,
            ],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {
        "has_theme": True,
        "colors": [
            format_theme_color(theme["color_primary"]),
            format_theme_color(theme["color_secondary"]),
            format_theme_color(theme["color_tertiary"]),
        ]
    }