from http.client import HTTPException
from fastapi import APIRouter
from database.supabase_client import fetch_schools

router = APIRouter()

#fetch all schools from the database
@router.get("/schools-fetch")
def get_schools():
    try:
        schools = fetch_schools()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"schools": schools}