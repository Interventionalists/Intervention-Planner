from http.client import HTTPException
from fastapi import APIRouter
from database.supabase_client import fetch_students

router = APIRouter()

#fetch all students from the database
@router.get("/students-fetch")
def get_students():
    try:
        students = fetch_students()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"students": students}

#insert a new student into the database
@router.post("/students-insert")
def insert_student():
    # TODO: Add logic to add student
    return {0}