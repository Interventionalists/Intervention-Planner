import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import calendar
from database import supabase_client


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(calendar.router)
    app.dependency_overrides[calendar.get_current_user] = lambda: {
        "id": 1,
        "public_id": "user-123",
        "role": "interventionist",
    }

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_list_calendar_events_scopes_by_school_and_returns_participants(
    client, monkeypatch
):
    requested = {}
    events = [
        {
            "id": 9,
            "public_id": "event-123",
            "title": "Reading group",
            "starts_at": "2026-11-04T09:00:00-06:00",
            "ends_at": "2026-11-04T09:30:00-06:00",
            "participants": [{"name": "Student Example", "attendance": "invited"}],
        }
    ]

    monkeypatch.setattr(
        calendar,
        "fetch_user_school_by_public_id",
        lambda public_id: 7 if public_id == "user-123" else None,
    )

    def fake_fetch_calendar_events(
        school_id, range_start, range_end, user_public_id
    ):
        requested.update(
            school_id=school_id,
            range_start=range_start,
            range_end=range_end,
            user_public_id=user_public_id,
        )
        return events

    monkeypatch.setattr(calendar, "fetch_calendar_events", fake_fetch_calendar_events)

    response = client.get(
        "/calendar-events",
        params={
            "starts_at": "2026-11-02T00:00:00-06:00",
            "ends_at": "2026-11-09T00:00:00-06:00",
        },
    )

    assert response.status_code == 200
    assert requested == {
        "school_id": 7,
        "range_start": "2026-11-02T00:00:00-06:00",
        "range_end": "2026-11-09T00:00:00-06:00",
        "user_public_id": "user-123",
    }
    assert response.json()["events"] == events


def test_list_calendar_events_rejects_reversed_range(client, monkeypatch):
    monkeypatch.setattr(
        calendar,
        "fetch_user_school_by_public_id",
        lambda _public_id: pytest.fail("Invalid range reached school lookup"),
    )

    response = client.get(
        "/calendar-events",
        params={
            "starts_at": "2026-11-09T00:00:00-06:00",
            "ends_at": "2026-11-02T00:00:00-06:00",
        },
    )

    assert response.status_code == 422


def test_list_calendar_invitees_uses_signed_in_school(client, monkeypatch):
    invitees = {
        "users": [{"public_id": "staff-123", "first_name": "Staff"}],
        "students": [{"id": 42, "first_name": "Student"}],
    }
    requested = {}

    monkeypatch.setattr(calendar, "fetch_user_school_by_public_id", lambda _id: 7)

    def fake_fetch_invitees(school_id):
        requested["school_id"] = school_id
        return invitees

    monkeypatch.setattr(
        calendar,
        "fetch_calendar_invitees",
        fake_fetch_invitees,
    )

    response = client.get("/calendar-invitees")

    assert response.status_code == 200
    assert response.json() == invitees
    assert requested["school_id"] == 7


def test_calendar_availability_returns_busy_times_for_all_school_invitees(
    client, monkeypatch
):
    invitee_id = "123e4567-e89b-12d3-a456-426614174000"
    second_invitee_id = "223e4567-e89b-12d3-a456-426614174000"
    requested = {}
    monkeypatch.setattr(calendar, "fetch_user_school_by_public_id", lambda _id: 7)
    monkeypatch.setattr(
        calendar,
        "fetch_calendar_invitees",
        lambda _school_id: {
            "users": [
                {"public_id": invitee_id},
                {"public_id": second_invitee_id},
            ],
            "students": [{"id": 42}],
        },
    )

    def fake_fetch_events(
        school_id,
        range_start,
        range_end,
        user_public_id,
        attendee_user_id=None,
        attendee_student_id=None,
        attendee_user_ids=None,
        attendee_student_ids=None,
    ):
        requested.update(
            school_id=school_id,
            range_start=range_start,
            range_end=range_end,
            user_public_id=user_public_id,
            attendee_user_id=attendee_user_id,
            attendee_student_id=attendee_student_id,
            attendee_user_ids=attendee_user_ids,
            attendee_student_ids=attendee_student_ids,
        )
        return [
            {
                "title": "Private event",
                "organizer": invitee_id,
                "starts_at": "2026-11-09T09:00:00-06:00",
                "ends_at": "2026-11-09T09:30:00-06:00",
                "participants": [
                    {"user_id": second_invitee_id, "student_id": None},
                    {"user_id": None, "student_id": 42},
                ],
            }
        ]

    monkeypatch.setattr(calendar, "fetch_calendar_events", fake_fetch_events)

    response = client.get(
        "/calendar-availability",
        params={
            "user_ids": [invitee_id, second_invitee_id],
            "student_ids": [42],
            "starts_at": "2026-11-09T00:00:00-06:00",
            "ends_at": "2026-11-16T00:00:00-06:00",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "busy": [
            {
                "user_id": invitee_id,
                "student_id": None,
                "starts_at": "2026-11-09T09:00:00-06:00",
                "ends_at": "2026-11-09T09:30:00-06:00",
            },
            {
                "user_id": second_invitee_id,
                "student_id": None,
                "starts_at": "2026-11-09T09:00:00-06:00",
                "ends_at": "2026-11-09T09:30:00-06:00",
            },
            {
                "user_id": None,
                "student_id": 42,
                "starts_at": "2026-11-09T09:00:00-06:00",
                "ends_at": "2026-11-09T09:30:00-06:00",
            }
        ]
    }
    assert requested["school_id"] == 7
    assert requested["attendee_user_ids"] == {invitee_id, second_invitee_id}
    assert requested["attendee_student_ids"] == {42}


def test_calendar_availability_rejects_non_school_invitee(client, monkeypatch):
    monkeypatch.setattr(calendar, "fetch_user_school_by_public_id", lambda _id: 7)
    monkeypatch.setattr(
        calendar,
        "fetch_calendar_invitees",
        lambda _school_id: {"users": [], "students": []},
    )
    monkeypatch.setattr(
        calendar,
        "fetch_calendar_events",
        lambda *_args, **_kwargs: pytest.fail("Unknown invitee reached event lookup"),
    )

    response = client.get(
        "/calendar-availability",
        params={
            "user_id": "123e4567-e89b-12d3-a456-426614174000",
            "starts_at": "2026-11-09T00:00:00-06:00",
            "ends_at": "2026-11-16T00:00:00-06:00",
        },
    )

    assert response.status_code == 404


def test_create_calendar_meeting_saves_invitees_and_recurrence(client, monkeypatch):
    event_id = "123e4567-e89b-12d3-a456-426614174000"
    invitee_id = "123e4567-e89b-12d3-a456-426614174001"
    saved = {}

    monkeypatch.setattr(calendar, "fetch_user_school_by_public_id", lambda _id: 7)
    monkeypatch.setattr(
        calendar,
        "fetch_calendar_invitees",
        lambda _school_id: {
            "users": [{"public_id": invitee_id}],
            "students": [{"id": 42}],
        },
    )

    def fake_create_recurrence(values):
        saved["recurrence"] = values
        return {"id": 13, **values}

    def fake_create_event(values):
        saved["event"] = values
        return {"id": 9, "public_id": event_id, **values}

    def fake_create_participants(values):
        saved["participants"] = values
        return values

    monkeypatch.setattr(
        calendar,
        "create_calendar_recurrence",
        fake_create_recurrence,
    )
    monkeypatch.setattr(calendar, "create_calendar_event", fake_create_event)
    monkeypatch.setattr(calendar, "create_calendar_event_participants", fake_create_participants)

    response = client.post(
        "/calendar-events",
        json={
            "school": 7,
            "event_type": "meeting",
            "title": "Weekly reading group",
            "starts_at": "2026-11-04T09:00:00-06:00",
            "ends_at": "2026-11-04T09:30:00-06:00",
            "location": "Room 12",
            "color": "#aabbcc",
            "participants": [
                {"user_id": invitee_id},
                {"student_id": 42},
            ],
            "recurrence": {
                "weekdays": [2, 3],
                "every_n_weeks": 1,
                "ends_on": "2026-12-31",
            },
        },
    )

    assert response.status_code == 200
    assert saved["recurrence"] == {
        "weekdays": [2, 3],
        "every_n_weeks": 1,
        "ends_on": "2026-12-31",
    }
    assert saved["event"]["color"] == "#aabbcc"
    assert saved["event"]["recurrence_id"] == 13
    assert saved["event"]["series_id"]
    assert saved["participants"] == [
        {
            "event_id": 9,
            "user_id": invitee_id,
            "student_id": None,
            "attendance": "invited",
        },
        {
            "event_id": 9,
            "user_id": None,
            "student_id": 42,
            "attendance": "invited",
        },
    ]


def test_create_calendar_event_for_group(client, monkeypatch):
    saved = {}
    monkeypatch.setattr(
        calendar,
        "fetch_user_school_by_public_id",
        lambda _public_id: 7,
    )
    monkeypatch.setattr(
        calendar,
        "fetch_groups",
        lambda school_id: [{"id": 3, "school": school_id}],
    )

    def fake_create_calendar_event(event_data):
        saved.update(event_data)
        return {"public_id": "event-123", **event_data}

    monkeypatch.setattr(calendar, "create_calendar_event", fake_create_calendar_event)

    response = client.post(
        "/calendar-events",
        json={
            "school": 7,
            "event_type": "Group session",
            "title": "Reading group",
            "starts_at": "2026-11-10T09:00:00-06:00",
            "ends_at": "2026-11-10T09:30:00-06:00",
            "location": "Room 12",
            "session_group_id": 3,
        },
    )

    assert response.status_code == 200
    assert saved["school"] == 7
    assert saved["session_group_id"] == 3
    assert saved["organizer"] == "user-123"
    assert response.json()["event"]["public_id"] == "event-123"


def test_create_calendar_event_rejects_group_from_another_school(
    client, monkeypatch
):
    monkeypatch.setattr(
        calendar,
        "fetch_user_school_by_public_id",
        lambda _public_id: 7,
    )
    monkeypatch.setattr(calendar, "fetch_groups", lambda _school_id: [])
    monkeypatch.setattr(
        calendar,
        "create_calendar_event",
        lambda *_args: pytest.fail("Unknown group reached event creation"),
    )

    response = client.post(
        "/calendar-events",
        json={
            "school": 7,
            "event_type": "Group session",
            "title": "Reading group",
            "starts_at": "2026-11-10T09:00:00-06:00",
            "ends_at": "2026-11-10T09:30:00-06:00",
            "session_group_id": 3,
        },
    )

    assert response.status_code == 404


def test_update_calendar_event_accepts_hex_color_for_organizer(client, monkeypatch):
    event_id = "123e4567-e89b-12d3-a456-426614174000"
    saved = {}
    existing_event = {
        "public_id": event_id,
        "school": 7,
        "organizer": "user-123",
        "starts_at": "2026-11-04T09:00:00-06:00",
        "ends_at": "2026-11-04T09:30:00-06:00",
        "regarding_student": None,
    }

    monkeypatch.setattr(calendar, "fetch_calendar_event", lambda _event_id: existing_event)
    monkeypatch.setattr(
        calendar,
        "fetch_user_school_by_public_id",
        lambda _public_id: 7,
    )

    def fake_update_calendar_event(public_id, school_id, updates, organizer_id):
        saved.update(
            public_id=public_id,
            school_id=school_id,
            updates=updates,
            organizer_id=organizer_id,
        )
        return {**existing_event, **updates}

    monkeypatch.setattr(calendar, "update_calendar_event", fake_update_calendar_event)

    response = client.put(
        f"/calendar-events/{event_id}",
        json={"color": "#aabbcc"},
    )

    assert response.status_code == 200
    assert response.json()["event"]["color"] == "#aabbcc"
    assert saved == {
        "public_id": event_id,
        "school_id": 7,
        "updates": {"color": "#aabbcc"},
        "organizer_id": "user-123",
    }


def test_update_calendar_event_rejects_invalid_color(client, monkeypatch):
    monkeypatch.setattr(
        calendar,
        "fetch_calendar_event",
        lambda _event_id: pytest.fail("Invalid color reached event lookup"),
    )

    response = client.put(
        "/calendar-events/123e4567-e89b-12d3-a456-426614174000",
        json={"color": "red; background: url(x)"},
    )

    assert response.status_code == 422


def test_delete_calendar_current_occurrence_preserves_rest_of_series(client, monkeypatch):
    event_id = "123e4567-e89b-12d3-a456-426614174000"
    event = {
        "id": 9,
        "public_id": event_id,
        "school": 7,
        "organizer": "user-123",
        "series_id": "series-123",
        "recurrence_id": 5,
        "event_type": "meeting",
        "title": "Weekly meeting",
        "starts_at": "2026-11-04T09:00:00-06:00",
        "ends_at": "2026-11-04T09:30:00-06:00",
    }
    recurrence = {
        "id": 5,
        "weekdays": [2],
        "every_n_weeks": 1,
        "ends_on": "2026-12-31",
    }
    participants = [
        {
            "event_id": 9,
            "user_id": "participant-123",
            "student_id": None,
            "attendance": "invited",
        }
    ]
    changed = {}
    created = {}

    monkeypatch.setattr(calendar, "fetch_calendar_event", lambda _id: event)
    monkeypatch.setattr(calendar, "fetch_user_school_by_public_id", lambda _id: 7)
    monkeypatch.setattr(calendar, "fetch_calendar_recurrence", lambda _id: recurrence)
    monkeypatch.setattr(
        calendar,
        "fetch_calendar_event_participants",
        lambda _event_id: participants,
    )

    def update_recurrence(recurrence_id, updates):
        changed["recurrence"] = (recurrence_id, updates)
        return {**recurrence, **updates}

    def create_recurrence(values):
        created["recurrence"] = values
        return {"id": 6, **values}

    def create_event(values):
        created["event"] = values
        return {"id": 10, "public_id": "continued-event", **values}

    def create_participants(values):
        created["participants"] = values
        return values

    monkeypatch.setattr(calendar, "update_calendar_recurrence", update_recurrence)
    monkeypatch.setattr(calendar, "create_calendar_recurrence", create_recurrence)
    monkeypatch.setattr(calendar, "create_calendar_event", create_event)
    monkeypatch.setattr(calendar, "create_calendar_event_participants", create_participants)
    monkeypatch.setattr(
        calendar,
        "delete_calendar_event",
        lambda *_args: pytest.fail("A current-occurrence delete removed the series."),
    )

    response = client.delete(
        f"/calendar-events/{event_id}",
        params={
            "scope": "occurrence",
            "occurrence_at": "2026-11-11T09:00:00-06:00",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"deleted": True, "scope": "occurrence"}
    assert changed["recurrence"] == (
        5,
        {"ends_on": "2026-11-10"},
    )
    assert created["recurrence"] == {
        "weekdays": [2],
        "every_n_weeks": 1,
        "ends_on": "2026-12-31",
    }
    assert created["event"]["starts_at"] == "2026-11-18T09:00:00-06:00"
    assert created["event"]["recurrence_id"] == 6
    assert created["participants"] == [
        {
            "event_id": 10,
            "user_id": "participant-123",
            "student_id": None,
            "attendance": "invited",
        }
    ]


def test_edit_recurring_meeting_future_occurrences_splits_series(client, monkeypatch):
    event_id = "123e4567-e89b-12d3-a456-426614174000"
    event = {
        "id": 9,
        "public_id": event_id,
        "school": 7,
        "organizer": "user-123",
        "series_id": "series-123",
        "recurrence_id": 5,
        "event_type": "meeting",
        "title": "Weekly meeting",
        "starts_at": "2026-11-04T09:00:00-06:00",
        "ends_at": "2026-11-04T09:30:00-06:00",
    }
    recurrence = {
        "id": 5,
        "weekdays": [2],
        "every_n_weeks": 1,
        "ends_on": "2026-12-31",
    }
    saved = {}

    monkeypatch.setattr(calendar, "fetch_calendar_event", lambda _id: event)
    monkeypatch.setattr(calendar, "fetch_user_school_by_public_id", lambda _id: 7)
    monkeypatch.setattr(calendar, "fetch_calendar_recurrence", lambda _id: recurrence)
    monkeypatch.setattr(calendar, "fetch_calendar_event_participants", lambda _id: [])

    def create_recurrence(values):
        saved["recurrence"] = values
        return {"id": 6, **values}

    def create_event(values):
        saved["event"] = values
        return {"id": 10, "public_id": "future-event", **values}

    def update_recurrence(recurrence_id, updates):
        saved["truncated"] = (recurrence_id, updates)
        return {**recurrence, **updates}

    monkeypatch.setattr(calendar, "create_calendar_recurrence", create_recurrence)
    monkeypatch.setattr(calendar, "create_calendar_event", create_event)
    monkeypatch.setattr(calendar, "update_calendar_recurrence", update_recurrence)

    response = client.put(
        f"/calendar-events/{event_id}",
        params={
            "scope": "future",
            "occurrence_at": "2026-11-11T09:00:00-06:00",
        },
        json={
            "title": "Updated weekly meeting",
            "starts_at": "2026-11-11T10:00:00-06:00",
            "ends_at": "2026-11-11T10:45:00-06:00",
            "participants": [],
            "recurrence": {
                "weekdays": [2],
                "every_n_weeks": 1,
                "ends_on": "2026-12-31",
            },
        },
    )

    assert response.status_code == 200
    assert saved["recurrence"]["weekdays"] == [2]
    assert saved["event"]["starts_at"] == "2026-11-11T10:00:00-06:00"
    assert saved["event"]["ends_at"] == "2026-11-11T10:45:00-06:00"
    assert saved["event"]["title"] == "Updated weekly meeting"
    assert saved["event"]["recurrence_id"] == 6
    assert saved["truncated"] == (5, {"ends_on": "2026-11-10"})


def test_fetch_calendar_events_resolves_school_participants(monkeypatch):
    tables = {
        "calendar_events": [
            {
                "id": 9,
                "public_id": "event-123",
                "school": 7,
                "organizer": "user-456",
                "regarding_student": 42,
                "session_group_id": 3,
                "recurrence_id": 4,
                "starts_at": "2026-11-04T09:00:00-06:00",
                "ends_at": "2026-11-04T09:30:00-06:00",
            },
            {
                "id": 10,
                "public_id": "other-school-event",
                "school": 8,
                "starts_at": "2026-11-04T10:00:00-06:00",
                "ends_at": "2026-11-04T10:30:00-06:00",
            },
            {
                "id": 11,
                "public_id": "not-attending-event",
                "school": 7,
                "organizer": "user-789",
                "starts_at": "2026-11-04T11:00:00-06:00",
                "ends_at": "2026-11-04T11:30:00-06:00",
            },
            {
                "id": 12,
                "public_id": "organized-event",
                "school": 7,
                "organizer": "user-123",
                "starts_at": "2026-11-04T12:00:00-06:00",
                "ends_at": "2026-11-04T12:30:00-06:00",
            },
        ],
        "event_participants": [
            {"event_id": 9, "user_id": "user-456", "student_id": None, "attendance": "yes"},
            {"event_id": 9, "user_id": "user-123", "student_id": None, "attendance": "invited"},
            {"event_id": 9, "user_id": None, "student_id": 42, "attendance": "invited"},
            {"event_id": 11, "user_id": "user-789", "student_id": None, "attendance": "yes"},
        ],
        "event_recurrence": [
            {"id": 4, "weekdays": [2], "every_n_weeks": 1, "ends_on": "2026-12-31"}
        ],
        "users": [
            {"public_id": "user-456", "first_name": "Taylor", "last_name": "Teacher", "school": 7},
            {"public_id": "user-123", "first_name": "Signed", "last_name": "In", "school": 7},
            {"public_id": "user-other", "first_name": "Other", "last_name": "School", "school": 8},
        ],
        "students": [
            {"id": 42, "first_name": "Sam", "last_name": "Student", "school": 7},
            {"id": 43, "first_name": "Other", "last_name": "Student", "school": 8},
        ],
    }

    class Query:
        def __init__(self, table):
            self.table = table
            self.filters = []
            self.columns = "*"
            self.negate_next_filter = False

        @property
        def not_(self):
            self.negate_next_filter = True
            return self

        def select(self, columns="*", **_kwargs):
            self.columns = columns
            return self

        def eq(self, field, value):
            self.filters.append(("eq", field, value))
            return self

        def lt(self, field, value):
            self.filters.append(("lt", field, value))
            return self

        def gt(self, field, value):
            self.filters.append(("gt", field, value))
            return self

        def is_(self, field, value):
            operation = "not_is" if self.negate_next_filter else "is"
            self.filters.append((operation, field, value))
            self.negate_next_filter = False
            return self

        def in_(self, field, values):
            self.filters.append(("in", field, values))
            return self

        def order(self, *_args, **_kwargs):
            return self

        def execute(self):
            rows = tables[self.table]
            for operation, field, value in self.filters:
                if operation == "eq":
                    rows = [row for row in rows if row.get(field) == value]
                elif operation == "lt":
                    rows = [row for row in rows if row.get(field) < value]
                elif operation == "gt":
                    rows = [row for row in rows if row.get(field) > value]
                elif operation == "is":
                    rows = [row for row in rows if row.get(field) is None]
                elif operation == "not_is":
                    rows = [row for row in rows if row.get(field) is not None]
                else:
                    rows = [row for row in rows if row.get(field) in value]
            if self.columns != "*":
                fields = self.columns.replace(" ", "").split(",")
                rows = [
                    {field: row.get(field) for field in fields}
                    for row in rows
                ]
            return type("Response", (), {"data": rows})()

    class FakeSupabase:
        def table(self, table_name):
            return Query(table_name)

    monkeypatch.setattr(supabase_client, "supabase", FakeSupabase())

    result = supabase_client.fetch_calendar_events(
        7,
        "2026-11-02T00:00:00-06:00",
        "2026-11-09T00:00:00-06:00",
        "user-123",
    )

    assert [event["id"] for event in result] == [9, 12]
    assert result[0]["participants"] == [
        {
            "user_id": "user-456",
            "student_id": None,
            "name": "Taylor Teacher",
            "attendance": "yes",
        },
        {
            "user_id": "user-123",
            "student_id": None,
            "name": "Signed In",
            "attendance": "invited",
        },
        {
            "user_id": None,
            "student_id": 42,
            "name": "Sam Student",
            "attendance": "invited",
        },
    ]
    assert result[0]["organizer_name"] == "Taylor Teacher"
    assert result[0]["regarding_student_name"] == "Sam Student"
    assert "session_details" not in result[0]
    assert "session_group" not in result[0]
    assert result[0]["recurrence"] == {
        "id": 4,
        "weekdays": [2],
        "every_n_weeks": 1,
        "ends_on": "2026-12-31",
    }
    assert result[0]["series_starts_at"] == "2026-11-04T09:00:00-06:00"
    assert result[0]["series_ends_at"] == "2026-11-04T09:30:00-06:00"
    next_occurrences = supabase_client.fetch_calendar_events(
        7,
        "2026-11-09T00:00:00-06:00",
        "2026-11-16T00:00:00-06:00",
        "user-123",
    )
    assert [(event["id"], event["starts_at"]) for event in next_occurrences] == [
        (9, "2026-11-11T09:00:00-06:00")
    ]
    assert next_occurrences[0]["series_starts_at"] == "2026-11-04T09:00:00-06:00"
