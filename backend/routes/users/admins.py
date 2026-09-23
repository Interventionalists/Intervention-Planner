from fastapi import APIRouter, HTTPException
from database.supabase_client import fetch_admins, create_user

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
@router.post("/admin-create")
def create_admin(email: str, password: str, first_name: str, last_name: str):
    create_user(email, password, first_name, last_name, "admin")
    return {"status": 0}