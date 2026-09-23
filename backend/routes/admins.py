from http.client import HTTPException
from fastapi import APIRouter
from database.supabase_client import fetch_admins

router = APIRouter()

#fetch all admins from the database
@router.get("/admins-fetch")
def get_admins():
    try:
        admins = fetch_admins()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"admins": admins}

#insert a new admin into the database
@router.post("/admins-insert")
def insert_admin():
    # TODO: Add logic to add admin
    return {0}