from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import sessions


def test_create_session_links_calendar_event(monkeypatch):
    app = FastAPI()
    app.include_router(sessions.router)
    user = {
        "id": 1,
        "public_id": "user-123",
        "role": "interventionist",
    }
    app.dependency_overrides[sessions.get_current_user] = lambda: user
    client = TestClient(app)
    created = {}

    monkeypatch.setattr(sessions, "require_student_access", lambda *_args: None)
    monkeypatch.setattr(
        sessions,
        "fetch_student_ownership",
        lambda _student_id: {"school": 7},
    )

    def fake_create_calendar_event(event_data):
        created["event"] = event_data
        return {"id": 981, "public_id": "event-public-id"}

    def fake_create_session(session_data):
        created["session"] = session_data
        return {"id": 981, **session_data}

    monkeypatch.setattr(sessions, "create_calendar_event", fake_create_calendar_event)
    monkeypatch.setattr(sessions, "create_session", fake_create_session)

    response = client.post(
        "/sessions-create",
        json={
            "student_id": 42,
            "plan_type": "Reading fluency",
            "focus": "Accuracy and expression",
            "duration_minutes": 25,
            "scheduled_at": "2026-11-09T15:15:00Z",
        },
    )

    assert response.status_code == 200
    assert created["event"] == {
        "school": 7,
        "event_type": "intervention_session",
        "title": "Reading fluency",
        "starts_at": "2026-11-09T15:15:00+00:00",
        "ends_at": "2026-11-09T15:40:00+00:00",
        "regarding_student": 42,
        "organizer": "user-123",
    }
    assert created["session"]["event_id"] == 981
    assert created["session"]["created_by"] == "user-123"
    assert response.json()["session"]["id"] == 981