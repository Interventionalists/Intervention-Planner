from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from auth.security import get_current_user, require_student_access
from database.supabase_client import (
    create_session,
    fetch_session,
    fetch_sessions_for_student,
    update_session_status,
)

router = APIRouter()


class SessionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    student_id: int = Field(ge=1)
    plan_type: str = Field(min_length=1, max_length=100)
    focus: str = Field(min_length=1, max_length=300)
    duration_minutes: int = Field(ge=1, le=240)
    scheduled_at: datetime | None = None


class SessionStatusUpdate(BaseModel):
    status: Literal["completed", "cancelled"]


@router.get("/sessions-fetchForStudent/{student_id}")
def get_sessions_for_student(
    student_id: int,
    user: dict = Depends(get_current_user),
):
    try:
        require_student_access(user, student_id)
        sessions = fetch_sessions_for_student(student_id)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"sessions": sessions}


@router.post("/sessions-create")
def add_session(
    payload: SessionCreate,
    user: dict = Depends(get_current_user),
):
    try:
        require_student_access(user, payload.student_id)
        session_data = payload.model_dump()
        if session_data["scheduled_at"] is not None:
            session_data["scheduled_at"] = session_data["scheduled_at"].isoformat()
        session_data["status"] = "planned"
        session_data["created_by"] = user["public_id"]
        session = create_session(session_data)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if not session:
        raise HTTPException(status_code=500, detail="Session creation failed")
    return {"session": session}


@router.patch("/sessions-updateStatus/{session_id}")
def edit_session_status(
    session_id: str,
    payload: SessionStatusUpdate,
    user: dict = Depends(get_current_user),
):
    try:
        session = fetch_session(str(session_id))
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        require_student_access(user, session["student_id"])
        updated_session = update_session_status(str(session_id), payload.status)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if not updated_session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session": updated_session}