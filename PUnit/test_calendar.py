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

    def fake_fetch_calendar_events(school_id, range_start, range_end):
        requested.update(
            school_id=school_id,
            range_start=range_start,
            range_end=range_end,
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
        ],
        "event_participants": [
            {"event_id": 9, "user_id": "user-456", "student_id": None, "attendance": "yes"},
            {"event_id": 9, "user_id": None, "student_id": 42, "attendance": "invited"},
        ],
        "session_details": [
            {
                "event_id": 9,
                "plan_type": "Reading",
                "session_details": "Fluency",
                "student_id": 42,
                "created_by": "user-456",
                "duration": 30,
                "scheduled_time": "2026-11-04T09:00:00-06:00",
                "status": "scheduled",
            }
        ],
        "session_groups": [
            {"id": 3, "name": "Reading group", "purpose": "Fluency practice", "school": 7}
        ],
        "event_recurrence": [
            {"id": 4, "weekdays": [2], "every_n_weeks": 1, "ends_on": "2026-12-31"}
        ],
        "users": [
            {"public_id": "user-456", "first_name": "Taylor", "last_name": "Teacher", "school": 7},
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
    )

    assert len(result) == 1
    assert result[0]["participants"] == [
        {
            "user_id": "user-456",
            "student_id": None,
            "name": "Taylor Teacher",
            "attendance": "yes",
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
    assert result[0]["session_details"] == [
        {
            "event_id": 9,
            "plan_type": "Reading",
            "focus": "Fluency",
            "student_id": 42,
            "created_by": "user-456",
            "duration": 30,
            "scheduled_time": "2026-11-04T09:00:00-06:00",
            "status": "scheduled",
            "student_name": "Sam Student",
            "created_by_name": "Taylor Teacher",
        }
    ]
    assert result[0]["session_group"] == {
        "id": 3,
        "name": "Reading group",
        "purpose": "Fluency practice",
    }
    assert result[0]["recurrence"] == {
        "id": 4,
        "weekdays": [2],
        "every_n_weeks": 1,
        "ends_on": "2026-12-31",
    }
