from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from auth.security import get_current_user, require_student_access
from database.supabase_client import (
    create_assignment,
    delete_assignment,
    fetch_assignment,
    fetch_assignments_for_student,
    fetch_assignments_for_student_in_range,
    fetch_assignments_for_student_subject,
    update_assignment,
)

router = APIRouter()


class AssignmentCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    student_id: int = Field(ge=1)
    subject: str = Field(min_length=1, max_length=100)
    assignment: str = Field(min_length=1, max_length=200)
    grade: float | None = Field(default=None, ge=0)


class AssignmentUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    subject: str | None = Field(default=None, min_length=1, max_length=100)
    assignment: str | None = Field(default=None, min_length=1, max_length=200)
    grade: float | None = Field(default=None, ge=0)


#grades are owned by the student's teacher/interventionist; admins are read-only.
def _require_grade_writer(user: dict) -> None:
    if user["role"] == "admin":
        raise HTTPException(status_code=403, detail="Admins cannot change grades")


#looks up an assignment and checks the caller can access its student.
def _get_accessible_assignment(user: dict, assignment_id: int) -> dict:
    assignment = fetch_assignment(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    require_student_access(user, assignment["student_id"])
    return assignment

################################ FETCH ENDPOINTS ######################################

@router.get("/assignments-fetchForStudent/{student_id}")
def get_assignments_for_student(
    student_id: int,
    subject: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    user: dict = Depends(get_current_user),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")
    try:
        require_student_access(user, student_id)
        if start_date or end_date:
            #end_date is a whole day, so compare against the start of the next day
            assignments = fetch_assignments_for_student_in_range(
                student_id,
                start_date.isoformat() if start_date else None,
                (end_date + timedelta(days=1)).isoformat() if end_date else None,
                subject,
            )
        elif subject:
            assignments = fetch_assignments_for_student_subject(student_id, subject)
        else:
            assignments = fetch_assignments_for_student(student_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"assignments": assignments}


@router.get("/assignments-fetch/{assignment_id}")
def get_assignment(assignment_id: int, user: dict = Depends(get_current_user)):
    try:
        assignment = _get_accessible_assignment(user, assignment_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"assignment": assignment}

################################ WRITE ENDPOINTS ######################################

@router.post("/assignments-create")
def add_assignment(payload: AssignmentCreate, user: dict = Depends(get_current_user)):
    _require_grade_writer(user)
    try:
        require_student_access(user, payload.student_id)
        assignment = create_assignment(payload.model_dump())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not assignment:
        raise HTTPException(status_code=500, detail="Assignment creation failed")
    return {"assignment": assignment}


@router.put("/assignments-update/{assignment_id}")
def edit_assignment(assignment_id: int, payload: AssignmentUpdate, user: dict = Depends(get_current_user)):
    _require_grade_writer(user)
    #only send fields the caller actually set, so omitted fields aren't nulled out
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        _get_accessible_assignment(user, assignment_id)
        assignment = update_assignment(assignment_id, updates)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"assignment": assignment}


@router.delete("/assignments-delete/{assignment_id}")
def remove_assignment(assignment_id: int, user: dict = Depends(get_current_user)):
    _require_grade_writer(user)
    try:
        _get_accessible_assignment(user, assignment_id)
        deleted = delete_assignment(assignment_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"deleted": True}
