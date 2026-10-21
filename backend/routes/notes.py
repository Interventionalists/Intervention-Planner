from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth.security import get_current_user, require_self_or_admin
from database.supabase_client import (
    create_note,
    delete_note,
    edit_text,
    fetch_notes_for_student,
    fetch_notes_from_date,
    fetch_notes_from_user,
)

router = APIRouter()


def _visible_notes(notes: list[dict], user: dict) -> list[dict]:
    visible_notes = []
    for note in notes:
        is_private = note.get("privateNote", note.get("is_private", False))
        if isinstance(is_private, str):
            is_private = is_private.lower() == "true"
        note = {**note, "is_private": is_private}
        if not is_private or str(note.get("created_by")) == str(user["public_id"]):
            visible_notes.append(note)
    return visible_notes


class NoteCreate(BaseModel):
    student_id: int | None
    created_by: str
    text: str
    is_private: bool = False

################################ FETCH ENDPOINTS ######################################

@router.get("/notes-userFetch/{public_id}")
def get_notes_from_user(public_id: str, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, public_id)
    try:
        notes = fetch_notes_from_user(public_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": _visible_notes(notes, user)}

@router.get("/notes-fetchFromDate/{timestamp}")
def get_notes_from_date(timestamp: str, user: dict = Depends(get_current_user)):
    try:
        notes = fetch_notes_from_date(timestamp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": _visible_notes(notes, user)}

@router.get("/notes-fetchForStudent")
def get_notes_for_student(user_id: str, student_id: str, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, user_id)
    try:
        notes = fetch_notes_for_student(student_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": _visible_notes(notes, user)}

@router.put("/notes-editText")
def update_note_text(note_id: str, new_text: str, user: dict = Depends(get_current_user)):
    try:
        #scoped to the caller, so a note can only be edited by its author
        updated_note = edit_text(note_id, new_text, user["public_id"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not updated_note:
        raise HTTPException(status_code=404, detail="Note not found or not owned by user")
    return {"note": updated_note}


@router.post("/notes-create")
def add_note(payload: NoteCreate, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, payload.created_by)
    try:
        note = create_note(
            payload.student_id,
            payload.created_by,
            payload.text,
            payload.is_private,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not note:
        raise HTTPException(status_code=500, detail="Note creation failed")
    return {"note": note}


@router.delete("/notes-delete")
def remove_note(note_id: str, user_id: str, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, user_id)
    try:
        deleted = delete_note(note_id, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found or not owned by user")
    return {"deleted": True}
