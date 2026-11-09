from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth.security import get_current_user, require_student_access
from database.supabase_client import (
    fetch_calendar_event,
    fetch_calendar_events_by_ids,
    fetch_session_details,
    fetch_session_details_created_by,
    fetch_session_details_for_student,
    fetch_session_group,
    fetch_session_group_members,
    fetch_session_groups,
    fetch_user_role_and_school,
    fetch_user_school_by_public_id,
    update_session_details,
    update_session_group,
)
from routes.calendar import (
    _get_writable_event,
    _validate_regarding_student,
    _validate_timezone,
)

router = APIRouter()


################################ SESSION DETAILS ###############################

class SessionDetailsUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    plan_type: str | None = None
    focus: str | None = None
    student_id: int | None = Field(default=None, ge=1)
    duration: int | None = Field(default=None, ge=1)
    scheduled_time: datetime | None = None
    status: str | None = None

    @field_validator("scheduled_time")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            return _validate_timezone(value)
        return value


def _event_summary(event: dict | None) -> dict | None:
    if event is None:
        return None
    return {
        "public_id": event.get("public_id"),
        "school": event.get("school"),
        "organizer": event.get("organizer"),
        "title": event.get("title"),
        "event_type": event.get("event_type"),
        "starts_at": event.get("starts_at"),
        "ends_at": event.get("ends_at"),
    }


def _with_events(sessions: list[dict]) -> list[dict]:
    event_ids = list({row["event_id"] for row in sessions})
    events = {e["id"]: e for e in fetch_calendar_events_by_ids(event_ids)}
    return [
        {**row, "event": _event_summary(events.get(row["event_id"]))}
        for row in sessions
    ]


#admins see every session. Otherwise the caller must be the event's organizer
#at the same school, or have access to the session's student. Anything else is
#a 404 so event ids can't be probed.
def _get_readable_event(event_id: UUID, user: dict) -> dict:
    try:
        return _get_writable_event(event_id, user)
    except HTTPException as e:
        if e.status_code != 404:
            raise
    event = fetch_calendar_event(str(event_id))
    session = fetch_session_details(event["id"]) if event else None
    student_id = session.get("student_id") if session else None
    if student_id is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    try:
        require_student_access(user, student_id)
    except HTTPException as e:
        raise HTTPException(status_code=404, detail="Session not found.") from e
    return event


#lists sessions for one student (needs access to that student), or, with no
#student_id, the sessions the caller created.
@router.get("/sessions")
def list_sessions(
    student_id: int | None = Query(default=None, ge=1),
    user: dict = Depends(get_current_user),
):
    try:
        if student_id is not None:
            require_student_access(user, student_id)
            sessions = fetch_session_details_for_student(student_id)
        else:
            sessions = fetch_session_details_created_by(user["public_id"])
        return {"sessions": _with_events(sessions)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


#event_id is the calendar event's public_id.
@router.get("/sessions/{event_id}")
def get_session(
    event_id: UUID,
    user: dict = Depends(get_current_user),
):
    try:
        event = _get_readable_event(event_id, user)
        session = fetch_session_details(event["id"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"session": {**session, "event": _event_summary(event)}}


#same write rules as calendar events: admins, or the organizer at their school.
@router.put("/sessions/{event_id}")
def edit_session(
    event_id: UUID,
    payload: SessionDetailsUpdate,
    user: dict = Depends(get_current_user),
):
    updates = payload.model_dump(mode="json", exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    try:
        event = _get_writable_event(event_id, user)
        if "student_id" in updates:
            _validate_regarding_student(updates["student_id"], event["school"], user)
        updated = update_session_details(event["id"], updates)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"session": {**updated, "event": _event_summary(event)}}


################################ SESSION GROUPS ################################

class SessionGroupUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1)
    purpose: str | None = None
    interventionist: UUID | None = None

    @field_validator("name", "purpose", mode="before")
    @classmethod
    def reject_null_required_updates(cls, value):
        if value is None:
            raise ValueError("This field cannot be null.")
        return value


def _caller_school(user: dict) -> int:
    school_id = fetch_user_school_by_public_id(user["public_id"])
    if school_id is None:
        raise HTTPException(
            status_code=403,
            detail="The signed-in user does not have a school assigned.",
        )
    return school_id


#admins see every group; everyone else only groups at their own school.
def _get_readable_group(group_id: UUID, user: dict) -> dict:
    group = fetch_session_group(str(group_id))
    if group is None:
        raise HTTPException(status_code=404, detail="Session group not found.")
    if user["role"] == "admin":
        return group
    school_id = fetch_user_school_by_public_id(user["public_id"])
    if school_id is None or str(group["school"]) != str(school_id):
        raise HTTPException(status_code=404, detail="Session group not found.")
    return group


#admins, or the group's interventionist at the same school.
def _get_writable_group(group_id: UUID, user: dict) -> dict:
    group = _get_readable_group(group_id, user)
    if user["role"] == "admin":
        return group
    if str(group.get("interventionist")) != str(user["public_id"]):
        raise HTTPException(status_code=404, detail="Session group not found.")
    return group


def _validate_group_interventionist(interventionist_id: str | None, school_id: int) -> None:
    if interventionist_id is None:
        return
    target = fetch_user_role_and_school(interventionist_id)
    if (
        target is None
        or target.get("role") != "interventionist"
        or str(target.get("school")) != str(school_id)
    ):
        raise HTTPException(
            status_code=422,
            detail="Interventionist must be an interventionist at the group's school.",
        )


#admins may filter by school (or get all); everyone else gets their own school.
@router.get("/session-groups")
def list_session_groups(
    school: int | None = Query(default=None, ge=1),
    user: dict = Depends(get_current_user),
):
    try:
        school_id = school if user["role"] == "admin" else _caller_school(user)
        return {"groups": fetch_session_groups(school_id)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/session-groups/{group_id}")
def get_session_group(
    group_id: UUID,
    user: dict = Depends(get_current_user),
):
    try:
        group = _get_readable_group(group_id, user)
        members = fetch_session_group_members(group["id"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"group": {**group, "members": members}}


#only admins may reassign a group's interventionist.
@router.put("/session-groups/{group_id}")
def edit_session_group(
    group_id: UUID,
    payload: SessionGroupUpdate,
    user: dict = Depends(get_current_user),
):
    updates = payload.model_dump(mode="json", exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    try:
        group = _get_writable_group(group_id, user)
        if "interventionist" in updates:
            if user["role"] != "admin":
                raise HTTPException(
                    status_code=403,
                    detail="Only admins can reassign a session group.",
                )
            _validate_group_interventionist(updates["interventionist"], group["school"])
        interventionist_id = None if user["role"] == "admin" else user["public_id"]
        updated = update_session_group(
            str(group_id),
            group["school"],
            updates,
            interventionist_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if updated is None:
        raise HTTPException(status_code=404, detail="Session group not found.")
    return {"group": updated}
