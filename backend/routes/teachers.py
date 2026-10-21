from fastapi import APIRouter, HTTPException
from database.supabase_client import fetch_teachers

router = APIRouter()

#fetch all teachers from the database
@router.get("/teachers-fetch")
def get_teachers():
    try:
        teachers = fetch_teachers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"teachers": teachers}