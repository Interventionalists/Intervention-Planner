from fastapi import APIRouter, HTTPException
from database.supabase_client import fetch_admins, fetch_allUsers

router = APIRouter()

#fetch all admins from the database
@router.get("/admins-fetch")
def get_admins():
    try:
        admins = fetch_admins()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"admins": admins}

@router.get("/admins-fetch-all-users")
def get_all_users():
    try:
        users = fetch_allUsers()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"users": users}