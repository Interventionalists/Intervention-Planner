from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth.security import get_current_user, require_student_access
from database.supabase_client import (
    create_calendar_event,
    create_session,
    delete_calendar_event,
    fetch_calendar_event_by_id,
    fetch_session,
    fetch_sessions_for_student,
    fetch_student_ownership,
    update_calendar_event,
    update_session_details,
    update_session_status,
)

router = APIRouter()


class SessionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    student_id: int = Field(ge=1)
    plan_type: str = Field(min_length=1, max_length=100)
    focus: str = Field(default="", max_length=300)
    duration_minutes: int = Field(ge=1, le=240)
    scheduled_at: datetime

    @field_validator("scheduled_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Session start time must include a timezone.")
        return value


class SessionStatusUpdate(BaseModel):
    status: Literal["completed", "cancelled"]


class SessionUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    plan_type: str = Field(min_length=1, max_length=100)
    focus: str = Field(default="", max_length=300)
    duration_minutes: int = Field(ge=1, le=240)
    scheduled_at: datetime

    @field_validator("scheduled_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Session start time must include a timezone.")
        return value


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
        ownership = fetch_student_ownership(payload.student_id)
        if ownership is None or ownership.get("school") is None:
            raise HTTPException(status_code=404, detail="Student school not found")

        starts_at = payload.scheduled_at
        ends_at = starts_at + timedelta(minutes=payload.duration_minutes)
        calendar_event = create_calendar_event({
            "school": ownership["school"],
            "event_type": "intervention_session",
            "title": payload.plan_type,
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "regarding_student": payload.student_id,
            "organizer": user["public_id"],
        })
        if not calendar_event:
            raise HTTPException(status_code=500, detail="Calendar event creation failed")

        session_data = payload.model_dump()
        session_data["scheduled_at"] = starts_at.isoformat()
        session_data["status"] = "planned"
        session_data["created_by"] = user["public_id"]
        session_data["event_id"] = calendar_event["id"]
        try:
            session = create_session(session_data)
            if not session:
                raise RuntimeError("Session creation failed")
        except Exception:
            try:
                delete_calendar_event(
                    calendar_event["public_id"],
                    ownership["school"],
                    user["public_id"],
                )
            except Exception:
                pass
            raise
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"session": session}


@router.patch("/sessions-updateStatus/{session_id}")
def edit_session_status(
    session_id: int,
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


@router.put("/sessions-update/{session_id}")
def edit_planned_session(
    session_id: int,
    payload: SessionUpdate,
    user: dict = Depends(get_current_user),
):
    try:
        session = fetch_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session["status"] != "planned":
            raise HTTPException(status_code=409, detail="Only planned sessions can be edited")
        require_student_access(user, session["student_id"])

        calendar_event = fetch_calendar_event_by_id(session_id)
        if not calendar_event:
            raise HTTPException(status_code=404, detail="Calendar event not found")
        if (
            user["role"] != "admin"
            and str(calendar_event.get("organizer")) != str(user["public_id"])
        ):
            raise HTTPException(status_code=404, detail="Session not found")

        starts_at = payload.scheduled_at
        ends_at = starts_at + timedelta(minutes=payload.duration_minutes)
        event_updates = {
            "title": payload.plan_type,
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
        }
        organizer_id = None if user["role"] == "admin" else user["public_id"]
        updated_event = update_calendar_event(
            calendar_event["public_id"],
            calendar_event["school"],
            event_updates,
            organizer_id,
        )
        if not updated_event:
            raise HTTPException(status_code=404, detail="Calendar event not found")

        session_updates = {
            "plan_type": payload.plan_type,
            "focus": payload.focus,
            "duration_minutes": payload.duration_minutes,
            "scheduled_at": starts_at.isoformat(),
        }
        try:
            updated_session = update_session_details(session_id, session_updates)
            if not updated_session:
                raise RuntimeError("Session update failed")
        except Exception:
            try:
                update_calendar_event(
                    calendar_event["public_id"],
                    calendar_event["school"],
                    {
                        "title": calendar_event.get("title"),
                        "starts_at": calendar_event["starts_at"],
                        "ends_at": calendar_event["ends_at"],
                    },
                    organizer_id,
                )
            except Exception:
                pass
            raise
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"session": updated_session}