from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from auth.security import (
    get_current_user,
    require_student_access,
)
from database.supabase_client import (
    create_calendar_event,
    create_calendar_event_participants,
    create_calendar_recurrence,
    delete_calendar_recurrence,
    delete_calendar_event,
    delete_calendar_event_participants,
    fetch_calendar_event,
    fetch_calendar_event_participants,
    fetch_calendar_events,
    fetch_groups,
    fetch_calendar_invitees,
    fetch_calendar_recurrence,
    fetch_student_ownership,
    fetch_user_school_by_public_id,
    update_calendar_event,
    update_calendar_recurrence,
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
            user["public_id"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {"events": events}


@router.get("/calendar-invitees")
def get_calendar_invitees(user: dict = Depends(get_current_user)):
    try:
        school_id = fetch_user_school_by_public_id(user["public_id"])
        if school_id is None:
            raise HTTPException(
                status_code=403,
                detail="The signed-in user does not have a school assigned.",
            )
        return fetch_calendar_invitees(school_id)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


class CalendarParticipantCreate(BaseModel):
    user_id: UUID | None = None
    student_id: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def require_single_participant(self):
        if (self.user_id is None) == (self.student_id is None):
            raise ValueError("Provide either a user or student participant.")
        return self


class CalendarRecurrenceCreate(BaseModel):
    weekdays: list[int] = Field(min_length=1, max_length=7)
    every_n_weeks: int = Field(default=1, ge=1, le=52)
    ends_on: date

    @field_validator("weekdays")
    @classmethod
    def validate_weekdays(cls, weekdays):
        if any(day < 0 or day > 6 for day in weekdays):
            raise ValueError("Weekdays must use values from 0 (Monday) to 6 (Sunday).")
        if len(set(weekdays)) != len(weekdays):
            raise ValueError("Weekdays cannot contain duplicates.")
        return weekdays


class CalendarEventCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    school: int = Field(ge=1)
    event_type: str = Field(min_length=1)
    title: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    starts_at: datetime
    ends_at: datetime
    location: str | None = None
    participants: list[CalendarParticipantCreate] = Field(default_factory=list)
    recurrence: CalendarRecurrenceCreate | None = None
    series_id: UUID | None = None
    recurrence_rule: str | None = None
    regarding_student: int | None = Field(default=None, ge=1)
    session_group_id: int | None = Field(default=None, ge=1)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        return _validate_timezone(value)

    @model_validator(mode="after")
    def validate_event_range(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Event end must be after its start.")
        if self.recurrence and self.recurrence.ends_on < self.starts_at.date():
            raise ValueError("Recurrence end date cannot be before the event start date.")
        if self.recurrence and self.starts_at.weekday() not in self.recurrence.weekdays:
            raise ValueError("The recurrence weekdays must include the event start day.")
        if self.recurrence and self.series_id is not None:
            raise ValueError("A recurring meeting creates its own series ID.")
        return self

    @field_validator("participants")
    @classmethod
    def reject_duplicate_participants(cls, participants):
        participant_keys = [
            ("user", str(participant.user_id))
            if participant.user_id
            else ("student", participant.student_id)
            for participant in participants
        ]
        if len(set(participant_keys)) != len(participant_keys):
            raise ValueError("A participant can only be invited once.")
        return participants


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
    participants: list[CalendarParticipantCreate] | None = None
    recurrence: CalendarRecurrenceCreate | None = None

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


def _event_update_values(payload: CalendarEventUpdate) -> dict:
    return payload.model_dump(
        exclude_unset=True,
        exclude={"participants", "recurrence"},
    )


def _participant_rows(participants, event_id: int) -> list[dict]:
    return [
        {
            "event_id": event_id,
            "user_id": str(participant.user_id) if participant.user_id else None,
            "student_id": participant.student_id,
            "attendance": "invited",
        }
        for participant in participants
    ]


def _replace_event_participants(event_id: int, participants) -> None:
    delete_calendar_event_participants(event_id)
    if participants:
        saved = create_calendar_event_participants(
            _participant_rows(participants, event_id)
        )
        if len(saved) != len(participants):
            raise RuntimeError("Not all invited participants were saved.")


def _copy_participant_rows(event_id: int, participant_rows: list[dict]) -> None:
    if not participant_rows:
        return
    saved = create_calendar_event_participants([
        {
            "event_id": event_id,
            "user_id": row.get("user_id"),
            "student_id": row.get("student_id"),
            "attendance": row.get("attendance") or "invited",
        }
        for row in participant_rows
    ])
    if len(saved) != len(participant_rows):
        raise RuntimeError("Not all invited participants were saved.")


def _event_copy_data(
    event: dict,
    updates: dict,
    starts_at: datetime,
    ends_at: datetime,
    recurrence_id: int | None,
    series_id: str | None,
) -> dict:
    excluded = {
        "id", "public_id", "starts_at", "ends_at", "recurrence_id", "series_id",
    }
    data = {key: value for key, value in event.items() if key not in excluded}
    data.update(updates)
    data.update(
        starts_at=starts_at.isoformat(),
        ends_at=ends_at.isoformat(),
        recurrence_id=recurrence_id,
        series_id=series_id,
    )
    return data


def _event_duration(event: dict) -> tuple[datetime, datetime, datetime]:
    starts_at = datetime.fromisoformat(event["starts_at"])
    ends_at = datetime.fromisoformat(event["ends_at"])
    return starts_at, ends_at, ends_at - starts_at


def _occurrence_date(event: dict, recurrence: dict, occurrence_at: datetime) -> date:
    starts_at = datetime.fromisoformat(event["starts_at"])
    occurrence_local = occurrence_at.astimezone(starts_at.tzinfo)
    occurrence_date = occurrence_local.date()
    first_week = starts_at.date() - timedelta(days=starts_at.weekday())
    week_number = (occurrence_date - first_week).days // 7
    every_n_weeks = max(1, recurrence.get("every_n_weeks") or 1)
    ends_on = date.fromisoformat(recurrence["ends_on"]) if recurrence.get("ends_on") else None
    if (
        occurrence_date < starts_at.date()
        or (ends_on is not None and occurrence_date > ends_on)
        or occurrence_date.weekday() not in set(recurrence.get("weekdays") or [])
        or week_number < 0
        or week_number % every_n_weeks != 0
        or occurrence_local.timetz().replace(tzinfo=None)
        != starts_at.timetz().replace(tzinfo=None)
    ):
        raise HTTPException(
            status_code=422,
            detail="The selected date is not an occurrence in this meeting series.",
        )
    return occurrence_date


def _next_series_occurrence(
    starts_at: datetime,
    recurrence: dict,
    after_date: date,
) -> datetime | None:
    last_date = (
        date.fromisoformat(recurrence["ends_on"])
        if recurrence.get("ends_on")
        else after_date + timedelta(days=366 * 10)
    )
    every_n_weeks = max(1, recurrence.get("every_n_weeks") or 1)
    weekdays = set(recurrence.get("weekdays") or [])
    first_week = starts_at.date() - timedelta(days=starts_at.weekday())
    candidate = after_date + timedelta(days=1)
    while candidate <= last_date:
        week_number = (candidate - first_week).days // 7
        if (
            candidate.weekday() in weekdays
            and week_number >= 0
            and week_number % every_n_weeks == 0
        ):
            return datetime.combine(
                candidate,
                starts_at.timetz().replace(tzinfo=None),
                tzinfo=starts_at.tzinfo,
            )
        candidate += timedelta(days=1)
    return None


def _has_series_occurrence_before(
    starts_at: datetime,
    recurrence: dict,
    before_date: date,
) -> bool:
    first_date = starts_at.date()
    if first_date >= before_date:
        return False
    every_n_weeks = max(1, recurrence.get("every_n_weeks") or 1)
    weekdays = set(recurrence.get("weekdays") or [])
    first_week = first_date - timedelta(days=starts_at.weekday())
    candidate = first_date
    while candidate < before_date:
        week_number = (candidate - first_week).days // 7
        if (
            candidate.weekday() in weekdays
            and week_number >= 0
            and week_number % every_n_weeks == 0
        ):
            return True
        candidate += timedelta(days=1)
    return False


def _delete_event_and_recurrence(event: dict) -> None:
    delete_calendar_event_participants(event["id"])
    deleted = delete_calendar_event(
        event["public_id"],
        event["school"],
        event["organizer"],
    )
    if not deleted:
        raise RuntimeError("Calendar event deletion failed.")
    if event.get("recurrence_id") is not None:
        delete_calendar_recurrence(event["recurrence_id"])


def _validate_invitees(participants, school_id: int) -> None:
    if not participants:
        return
    invitees = fetch_calendar_invitees(school_id)
    allowed_users = {str(row["public_id"]) for row in invitees["users"]}
    allowed_students = {row["id"] for row in invitees["students"]}
    for participant in participants:
        if participant.user_id and str(participant.user_id) not in allowed_users:
            raise HTTPException(
                status_code=404,
                detail="One or more invited users were not found in your school.",
            )
        if participant.student_id and participant.student_id not in allowed_students:
            raise HTTPException(
                status_code=404,
                detail="One or more invited students were not found in your school.",
            )


def _split_series_before(
    event: dict,
    recurrence: dict,
    occurrence_date: date,
    participant_rows: list[dict],
    keep_future: bool,
) -> None:
    starts_at, ends_at, duration = _event_duration(event)
    has_before = _has_series_occurrence_before(starts_at, recurrence, occurrence_date)
    next_occurrence = (
        _next_series_occurrence(starts_at, recurrence, occurrence_date)
        if keep_future
        else None
    )

    if has_before:
        truncated = update_calendar_recurrence(
            event["recurrence_id"],
            {"ends_on": (occurrence_date - timedelta(days=1)).isoformat()},
        )
        if truncated is None:
            raise RuntimeError("Unable to keep the earlier occurrences in the series.")
        if next_occurrence is not None:
            continuation_recurrence = create_calendar_recurrence({
                "weekdays": recurrence["weekdays"],
                "every_n_weeks": recurrence.get("every_n_weeks") or 1,
                "ends_on": recurrence.get("ends_on"),
            })
            if continuation_recurrence is None:
                raise RuntimeError("Unable to create the remaining meeting series.")
            continuation_event = create_calendar_event(_event_copy_data(
                event,
                {},
                next_occurrence,
                next_occurrence + duration,
                continuation_recurrence["id"],
                event.get("series_id"),
            ))
            if continuation_event is None:
                delete_calendar_recurrence(continuation_recurrence["id"])
                raise RuntimeError("Unable to create the remaining meeting series.")
            _copy_participant_rows(continuation_event["id"], participant_rows)
        return

    if next_occurrence is not None:
        continued = update_calendar_event(
            event["public_id"],
            event["school"],
            {
                "starts_at": next_occurrence.isoformat(),
                "ends_at": (next_occurrence + duration).isoformat(),
            },
            event["organizer"],
        )
        if continued is None:
            raise RuntimeError("Unable to keep the remaining occurrences in the series.")
        return

    _delete_event_and_recurrence(event)


@router.post("/calendar-events")
def add_calendar_event(
    payload: CalendarEventCreate,
    user: dict = Depends(get_current_user),
):
    recurrence = None
    event = None
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
        if payload.participants:
            invitees = fetch_calendar_invitees(school_id)
            allowed_users = {str(row["public_id"]) for row in invitees["users"]}
            allowed_students = {row["id"] for row in invitees["students"]}
            for participant in payload.participants:
                if participant.user_id and str(participant.user_id) not in allowed_users:
                    raise HTTPException(
                        status_code=404,
                        detail="One or more invited users were not found in your school.",
                    )
                if participant.student_id and participant.student_id not in allowed_students:
                    raise HTTPException(
                        status_code=404,
                        detail="One or more invited students were not found in your school.",
                    )

        event_data = payload.model_dump(
            mode="json",
            exclude={"school", "participants", "recurrence"},
            exclude_none=True,
        )
        if payload.recurrence:
            recurrence = create_calendar_recurrence({
                **payload.recurrence.model_dump(mode="json"),
                "ends_on": payload.recurrence.ends_on.isoformat(),
            })
            if recurrence is None:
                raise HTTPException(
                    status_code=500,
                    detail="Calendar recurrence creation failed.",
                )
            event_data["recurrence_id"] = recurrence["id"]
            event_data["series_id"] = str(payload.series_id or uuid4())
        if payload.session_group_id is not None:
            groups = fetch_groups(school_id)
            if not any(group["id"] == payload.session_group_id for group in groups):
                raise HTTPException(
                    status_code=404,
                    detail="Intervention group not found.",
                )
        event_data.update(
            school=school_id,
            organizer=user["public_id"],
        )
        event = create_calendar_event(event_data)
        if event is None:
            raise RuntimeError("Calendar event creation failed.")
        if payload.participants:
            saved_participants = create_calendar_event_participants([
                {
                    "event_id": event["id"],
                    "user_id": (
                        str(participant.user_id) if participant.user_id else None
                    ),
                    "student_id": participant.student_id,
                    "attendance": "invited",
                }
                for participant in payload.participants
            ])
            if len(saved_participants) != len(payload.participants):
                raise RuntimeError("Not all invited participants were saved.")
    except HTTPException:
        if recurrence is not None:
            delete_calendar_recurrence(recurrence["id"])
        raise
    except Exception as error:
        if event is not None:
            delete_calendar_event(
                event["public_id"],
                event["school"],
                user["public_id"],
            )
        if recurrence is not None:
            delete_calendar_recurrence(recurrence["id"])
        raise HTTPException(status_code=500, detail=str(error)) from error
    if event is None:
        raise HTTPException(status_code=500, detail="Calendar event creation failed.")
    return {"event": event}


@router.put("/calendar-events/{event_id}")
def edit_calendar_event(
    event_id: UUID,
    payload: CalendarEventUpdate,
    scope: Literal["series", "future", "occurrence"] = Query("series"),
    occurrence_at: datetime | None = Query(None),
    user: dict = Depends(get_current_user),
):
    updates = _event_update_values(payload)
    recurrence_requested = "recurrence" in payload.model_fields_set
    participants_requested = "participants" in payload.model_fields_set
    if "recurrence" in payload.model_fields_set:
        recurrence_value = payload.recurrence
    else:
        recurrence_value = None
    if "participants" in payload.model_fields_set:
        participants_value = payload.participants
    else:
        participants_value = None
    has_update = bool(updates or recurrence_requested or participants_requested)
    if not has_update:
        raise HTTPException(status_code=400, detail="No fields to update.")
    try:
        event = _get_writable_event(event_id, user)
        if occurrence_at is not None:
            _validate_timezone(occurrence_at)
        recurrence = (
            fetch_calendar_recurrence(event["recurrence_id"])
            if event.get("recurrence_id") is not None
            else None
        )
        if event.get("recurrence_id") is not None and recurrence is None:
            raise HTTPException(status_code=500, detail="Meeting recurrence was not found.")

        if recurrence is not None and scope != "series":
            if occurrence_at is None:
                raise HTTPException(
                    status_code=422,
                    detail="Choose the occurrence to edit.",
                )
            target_date = _occurrence_date(event, recurrence, occurrence_at)
            source_participants = fetch_calendar_event_participants(event["id"])
            _validate_regarding_student(
                updates.get("regarding_student", event.get("regarding_student")),
                event["school"],
                user,
            )
            _validate_invitees(participants_value, event["school"])
            starts_at = updates.pop(
                "starts_at",
                occurrence_at.astimezone(
                    datetime.fromisoformat(event["starts_at"]).tzinfo
                ),
            )
            ends_at = updates.pop(
                "ends_at",
                starts_at + _event_duration(event)[2],
            )
            if ends_at <= starts_at:
                raise HTTPException(
                    status_code=422,
                    detail="Event end must be after its start.",
                )
            attendee_data = (
                [
                    {
                        "user_id": (
                            str(participant.user_id)
                            if participant.user_id
                            else None
                        ),
                        "student_id": participant.student_id,
                        "attendance": "invited",
                    }
                    for participant in participants_value
                ]
                if participants_requested and participants_value is not None
                else [
                    {
                        "user_id": row.get("user_id"),
                        "student_id": row.get("student_id"),
                        "attendance": row.get("attendance") or "invited",
                    }
                    for row in source_participants
                ]
            )

            if scope == "occurrence":
                occurrence_event = create_calendar_event(_event_copy_data(
                    event,
                    {**updates, "recurrence_rule": None},
                    starts_at,
                    ends_at,
                    None,
                    None,
                ))
                if occurrence_event is None:
                    raise RuntimeError("Unable to save the edited meeting occurrence.")
                _copy_participant_rows(occurrence_event["id"], attendee_data)
                _split_series_before(
                    event, recurrence, target_date, source_participants, True
                )
                return {"event": occurrence_event}

            next_recurrence = recurrence_value
            next_recurrence_id = None
            next_series_id = (
                event.get("series_id") or str(uuid4())
                if next_recurrence is not None
                else None
            )
            if next_recurrence is not None:
                recurrence_data = next_recurrence.model_dump(mode="json")
                if starts_at.weekday() not in recurrence_data["weekdays"]:
                    raise HTTPException(
                        status_code=422,
                        detail="Include the meeting's start day in the repeat weekdays.",
                    )
                saved_recurrence = create_calendar_recurrence(recurrence_data)
                if saved_recurrence is None:
                    raise RuntimeError("Unable to save the updated meeting recurrence.")
                next_recurrence_id = saved_recurrence["id"]
            future_event = create_calendar_event(_event_copy_data(
                event,
                {**updates, "recurrence_rule": None},
                starts_at,
                ends_at,
                next_recurrence_id,
                next_series_id,
            ))
            if future_event is None:
                if next_recurrence_id is not None:
                    delete_calendar_recurrence(next_recurrence_id)
                raise RuntimeError("Unable to save the future meeting occurrences.")
            _copy_participant_rows(future_event["id"], attendee_data)
            _split_series_before(
                event, recurrence, target_date, source_participants, False
            )
            return {"event": future_event}

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
        if participants_requested and participants_value is not None:
            _validate_invitees(participants_value, event["school"])
        if recurrence_requested:
            if recurrence_value is None:
                updates.update(recurrence_id=None, series_id=None)
            else:
                recurrence_data = recurrence_value.model_dump(mode="json")
                if starts_at.weekday() not in recurrence_data["weekdays"]:
                    raise HTTPException(
                        status_code=422,
                        detail="Include the meeting's start day in the repeat weekdays.",
                    )
                if event.get("recurrence_id") is not None:
                    saved_recurrence = update_calendar_recurrence(
                        event["recurrence_id"], recurrence_data
                    )
                else:
                    saved_recurrence = create_calendar_recurrence(recurrence_data)
                if saved_recurrence is None:
                    raise RuntimeError("Unable to save the meeting recurrence.")
                updates.update(
                    recurrence_id=saved_recurrence["id"],
                    series_id=event.get("series_id") or str(uuid4()),
                )
        for field in ("starts_at", "ends_at"):
            if field in updates and updates[field] is not None:
                updates[field] = updates[field].isoformat()
        organizer_id = None if user["role"] == "admin" else user["public_id"]
        updated_event = update_calendar_event(
            str(event_id),
            event["school"],
            updates,
            organizer_id,
        )
        if updated_event is None:
            raise HTTPException(status_code=404, detail="Calendar event not found.")
        if participants_requested and participants_value is not None:
            _replace_event_participants(updated_event["id"], participants_value)
        if recurrence_requested and recurrence_value is None and event.get("recurrence_id"):
            delete_calendar_recurrence(event["recurrence_id"])
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
    scope: Literal["series", "future", "occurrence"] = Query("series"),
    occurrence_at: datetime | None = Query(None),
    user: dict = Depends(get_current_user),
):
    try:
        event = _get_writable_event(event_id, user)
        recurrence = (
            fetch_calendar_recurrence(event["recurrence_id"])
            if event.get("recurrence_id") is not None
            else None
        )
        if event.get("recurrence_id") is not None and recurrence is None:
            raise HTTPException(status_code=500, detail="Meeting recurrence was not found.")
        if recurrence is None or scope == "series":
            _delete_event_and_recurrence(event)
        else:
            if occurrence_at is None:
                raise HTTPException(
                    status_code=422,
                    detail="Choose the occurrence to delete.",
                )
            _validate_timezone(occurrence_at)
            target_date = _occurrence_date(event, recurrence, occurrence_at)
            participants = fetch_calendar_event_participants(event["id"])
            _split_series_before(
                event,
                recurrence,
                target_date,
                participants,
                keep_future=scope == "occurrence",
            )
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"deleted": True, "scope": scope}