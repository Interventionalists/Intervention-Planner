from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database.supabase_client import (
    create_note,
    edit_text,
    fetch_notes_for_student,
    fetch_notes_from_date,
    fetch_notes_from_user,
)

router = APIRouter()


class NoteCreate(BaseModel):
    student_id: int
    created_by: str
    text: str

################################ FETCH ENDPOINTS ######################################

@router.get("/notes-userFetch")
def get_notes_from_user(user_id: str):
    try:
        notes = fetch_notes_from_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": notes}

@router.get("/notes-fetchFromDate")
def get_notes_from_date(timestamp: str):
    try:
        notes = fetch_notes_from_date(timestamp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": notes}

@router.get("/notes-fetchForStudent")
def get_notes_for_student(user_id: str, student_id: str):
    try:
        notes = fetch_notes_for_student(user_id, student_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": notes}

@router.put("/notes-editText")
def update_note_text(note_id: str, new_text: str):
    try:
        updated_note = edit_text(note_id, new_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"note": updated_note}


@router.post("/notes-create")
def add_note(payload: NoteCreate):
    try:
        note = create_note(payload.student_id, payload.created_by, payload.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not note:
        raise HTTPException(status_code=500, detail="Note creation failed")
    return {"note": note}
