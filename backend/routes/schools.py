from fastapi import APIRouter, HTTPException
from database.supabase_client import fetch_school_name, fetch_schools, fetch_user_school, update_user_school

router = APIRouter()

#fetch all schools from the database
@router.get("/schools-fetch")
def get_schools():
    try:
        schools = fetch_schools()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"schools": schools}

#update user if the school has been changed through account
@router.get("/schools-update")
@router.put("/schools-update")
def update_school(user_id: str, new_school_id: str):
    try:
        updated_user = update_user_school(user_id, new_school_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not updated_user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"message": "School updated successfully", "user": updated_user[0]}

#get a user's school ID based off their user ID.
@router.get("/schools-user-school")
def get_user_school(user_id: str):
    try:
        school_id = fetch_user_school(user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not school_id:
        raise HTTPException(status_code=404, detail="User or school not found.")
    return {"school_id": school_id}


@router.get("/schools-name")
def get_school_name(school_id: str):
    try:
        school_name = fetch_school_name(school_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not school_name:
        raise HTTPException(status_code=404, detail="School not found.")
    return {"school_name": school_name}