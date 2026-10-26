from fastapi import APIRouter, Depends, HTTPException
from auth.security import get_current_user
from database.supabase_client import fetch_teachers, fetch_user_school_by_public_id

router = APIRouter()

#fetch the teachers in the caller's school (admins included)
@router.get("/teachers-fetch")
def get_teachers(user: dict = Depends(get_current_user)):
    try:
        school_id = fetch_user_school_by_public_id(user["public_id"])
        teachers = [] if school_id is None else fetch_teachers(school_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"teachers": teachers}
