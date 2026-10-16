from fastapi import APIRouter, Depends, HTTPException
from auth.security import get_current_user, require_self_or_admin
from database.supabase_client import (
    fetch_interventionists,
    fetch_interventionist_students,
    fetch_user_school_by_public_id,
)

router = APIRouter()

################################## FETCH ENDPOINTS ######################################

#fetch all interventionists from the database
@router.get("/interventionists-fetch")
def get_interventionists():
    try:
        interventionists = fetch_interventionists()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"interventionists": interventionists}

@router.get("/interventionists-fetch/{requester_id}")
def get_school_interventionists(requester_id: str, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, requester_id)
    try:
        school_id = fetch_user_school_by_public_id(requester_id)
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        interventionists = fetch_interventionists(school_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"interventionists": interventionists}

@router.get("/interventionists-fetchStudents/{interventionist_id}")
def get_interventionist_students(interventionist_id: str, user: dict = Depends(get_current_user)):
    require_self_or_admin(user, interventionist_id)
    try:
        school_id = fetch_user_school_by_public_id(interventionist_id)
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The interventionist does not have a school assigned.",
            )
        students = fetch_interventionist_students(interventionist_id, school_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"students": students}

################################## OTHER ENDPOINTS ######################################
#insert a new interventionist into the database
@router.post("/interventionists-insert")
def insert_interventionist():
    # TODO: Add logic to add interventionist
    return {0}