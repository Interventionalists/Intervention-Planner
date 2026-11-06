from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from auth.security import (
    get_current_user,
    require_student_access,
)
from database.supabase_client import (
    create_calendar_event,
    delete_calendar_event,
    fetch_calendar_event,
    fetch_calendar_events,
    fetch_student_ownership,
    fetch_user_school_by_public_id,
    update_calendar_event,
)

router = APIRouter()


def _validate_timezone(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Event timestamps must include a timezone.")
    return value


@router.get("/calendar-events")
def get_calendar_events(
    starts_at: datetime = Query(),
    ends_at: datetime = Query(),
    user: dict = Depends(get_current_user),
):
    try:
        if (
            starts_at.tzinfo is None
            or starts_at.utcoffset() is None
            or ends_at.tzinfo is None
            or ends_at.utcoffset() is None
        ):
            raise HTTPException(
                status_code=422,
                detail="Calendar range timestamps must include a timezone.",
            )
        if ends_at <= starts_at:
            raise HTTPException(
                status_code=422,
                detail="Calendar range end must be after its start.",
            )
        school_id = fetch_user_school_by_public_id(user["public_id"])
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        events = fetch_calendar_events(
            school_id,
            starts_at.isoformat(),
            ends_at.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"events": events}


class CalendarEventCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    school: int = Field(ge=1)
    event_type: str = Field(min_length=1)
    title: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    starts_at: datetime
    ends_at: datetime
    location: str | None = None
    series_id: UUID | None = None
    recurrence_rule: str | None = None
    regarding_student: int | None = Field(default=None, ge=1)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        return _validate_timezone(value)

    @model_validator(mode="after")
    def validate_event_range(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Event end must be after its start.")
        return self


class CalendarEventUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    event_type: str | None = Field(default=None, min_length=1)
    title: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    location: str | None = None
    series_id: UUID | None = None
    recurrence_rule: str | None = None
    regarding_student: int | None = Field(default=None, ge=1)

    @field_validator("event_type", "starts_at", "ends_at", mode="before")
    @classmethod
    def reject_null_required_updates(cls, value):
        if value is None:
            raise ValueError("This field cannot be null.")
        return value

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None:
            return _validate_timezone(value)
        return value


def _get_writable_event(event_id: UUID, user: dict) -> dict:
    event = fetch_calendar_event(str(event_id))
    if event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found.")
    if user["role"] == "admin":
        return event
    if str(event["organizer"]) != str(user["public_id"]):
        raise HTTPException(status_code=404, detail="Calendar event not found.")
    school_id = fetch_user_school_by_public_id(user["public_id"])
    if school_id is None or str(event["school"]) != str(school_id):
        raise HTTPException(status_code=404, detail="Calendar event not found.")
    return event


def _validate_regarding_student(
    student_id: int | None,
    school_id: int,
    user: dict,
) -> None:
    if student_id is None:
        return
    require_student_access(user, student_id)
    ownership = fetch_student_ownership(student_id)
    if ownership is None or str(ownership.get("school")) != str(school_id):
        raise HTTPException(status_code=404, detail="Student not found.")


@router.post("/calendar-events")
def add_calendar_event(
    payload: CalendarEventCreate,
    user: dict = Depends(get_current_user),
):
    try:
        if user["role"] == "admin":
            school_id = payload.school
        else:
            school_id = fetch_user_school_by_public_id(user["public_id"])
            if school_id is None:
                raise HTTPException(
                    status_code=403,
                    detail="The signed-in user does not have a school assigned.",
                )
            if payload.school != school_id:
                raise HTTPException(
                    status_code=403,
                    detail="Calendar events can only be created for your school.",
                )
        _validate_regarding_student(payload.regarding_student, school_id, user)
        event_data = payload.model_dump(mode="json", exclude={"school"})
        event_data.update(
            school=school_id,
            organizer=user["public_id"],
        )
        event = create_calendar_event(event_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if event is None:
        raise HTTPException(status_code=500, detail="Calendar event creation failed.")
    return {"event": event}


@router.put("/calendar-events/{event_id}")
def edit_calendar_event(
    event_id: UUID,
    payload: CalendarEventUpdate,
    user: dict = Depends(get_current_user),
):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    try:
        event = _get_writable_event(event_id, user)
        starts_at = updates.get(
            "starts_at", datetime.fromisoformat(event["starts_at"])
        )
        ends_at = updates.get(
            "ends_at", datetime.fromisoformat(event["ends_at"])
        )
        if ends_at <= starts_at:
            raise HTTPException(
                status_code=422,
                detail="Event end must be after its start.",
            )
        _validate_regarding_student(
            updates.get("regarding_student", event.get("regarding_student")),
            event["school"],
            user,
        )
        for field in ("starts_at", "ends_at"):
            if field in updates:
                updates[field] = updates[field].isoformat()
        organizer_id = None if user["role"] == "admin" else user["public_id"]
        updated_event = update_calendar_event(
            str(event_id),
            event["school"],
            updates,
            organizer_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if updated_event is None:
        raise HTTPException(status_code=404, detail="Calendar event not found.")
    return {"event": updated_event}


@router.delete("/calendar-events/{event_id}")
def remove_calendar_event(
    event_id: UUID,
    user: dict = Depends(get_current_user),
):
    try:
        event = _get_writable_event(event_id, user)
        organizer_id = None if user["role"] == "admin" else user["public_id"]
        deleted = delete_calendar_event(
            str(event_id),
            event["school"],
            organizer_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Calendar event not found.")
    return {"deleted": True}