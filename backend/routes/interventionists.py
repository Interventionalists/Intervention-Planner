from http.client import HTTPException
from fastapi import APIRouter
from database.supabase_client import fetch_interventionists, fetch_interventionist_students

router = APIRouter()

################################## FETCH ENDPOINTS ######################################

#fetch all interventionists from the database
@router.get("/interventionists-fetch")
def get_interventionists():
    try:
        interventionists = fetch_interventionists()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"interventionists": interventionists}

@router.get("/interventionists-fetchStudents/{interventionist_id}")
def get_interventionist_students(interventionist_id: str):
    try:
        students = fetch_interventionist_students(interventionist_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"students": students}

################################## OTHER ENDPOINTS ######################################
#insert a new interventionist into the database
@router.post("/interventionists-insert")
def insert_interventionist():
    # TODO: Add logic to add interventionist
    return {0}