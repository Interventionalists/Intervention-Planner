from http.client import HTTPException
from fastapi import APIRouter
from database.supabase_client import fetch_notes_from_user, fetch_notes_from_date, fetch_notes_for_student, edit_text

router = APIRouter()

################################ FETCH ENDPOINTS ######################################

@router.get("/notes-userFetch/{user_id}")
def get_notes_from_user(user_id: str):
    try:
        notes = fetch_notes_from_user(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": notes}

@router.get("/notes-fetchFromDate/{timestamp}")
def get_notes_from_date(timestamp: str):
    try:
        notes = fetch_notes_from_date(timestamp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": notes}

@router.get("/notes-fetchForStudent/{student_id}")
def get_notes_for_student(student_id: str):
    try:
        notes = fetch_notes_for_student(student_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"notes": notes}

@router.put("/notes-editText/{note_id}")
def update_note_text(note_id: str, new_text: str):
    try:
        updated_note = edit_text(note_id, new_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"note": updated_note}
