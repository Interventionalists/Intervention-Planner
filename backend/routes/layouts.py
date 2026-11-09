import json

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel

from auth.security import get_current_user
from database.supabase_client import (
    delete_user_layout,
    fetch_user_layout,
    upsert_user_layout,
)

router = APIRouter()

#page keys look like "dashboard" or "student-42": short, url-safe, no spaces.
PAGE_KEY_PATTERN = r"^[A-Za-z0-9_-]{1,100}$"
#a tile layout is a few ids and sizes; anything bigger is not a real layout.
MAX_LAYOUT_BYTES = 20_000

PageKey = Path(pattern=PAGE_KEY_PATTERN)


class LayoutSave(BaseModel):
    layout: dict


#layouts are always read and written for the signed-in user only; the user id
#comes from the token, never from the request, so nobody can touch another's.
@router.get("/layouts/{page_key}")
def get_layout(page_key: str = PageKey, user: dict = Depends(get_current_user)):
    try:
        row = fetch_user_layout(user["public_id"], page_key)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if row is None:
        return {"layout": None, "updated_at": None}
    return {"layout": row["layout"], "updated_at": row["updated_at"]}


@router.put("/layouts/{page_key}")
def save_layout(
    payload: LayoutSave,
    page_key: str = PageKey,
    user: dict = Depends(get_current_user),
):
    if len(json.dumps(payload.layout)) > MAX_LAYOUT_BYTES:
        raise HTTPException(status_code=413, detail="Layout is too large to save.")
    try:
        row = upsert_user_layout(user["public_id"], page_key, payload.layout)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if row is None:
        raise HTTPException(status_code=500, detail="Layout could not be saved.")
    return {"layout": row["layout"], "updated_at": row["updated_at"]}


@router.delete("/layouts/{page_key}")
def reset_layout(page_key: str = PageKey, user: dict = Depends(get_current_user)):
    try:
        deleted = delete_user_layout(user["public_id"], page_key)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"deleted": deleted}
