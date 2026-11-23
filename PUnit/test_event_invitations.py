"""Meeting invitation notifications and accept/decline responses.

Drives the real app against the in-memory Supabase (fake_supabase.py) so the
event_participants.attendance updates and school scoping are exercised.
"""
import bcrypt
import pytest
from fastapi.testclient import TestClient

import database.supabase_client as sc
import main
from auth import security

from .fake_supabase import FakeSupabase

PW_HASH = bcrypt.hashpw(b"CorrectHorse1", bcrypt.gensalt(rounds=4)).decode()

ORGANIZER = "00000000-0000-4000-8000-000000000001"
INVITEE = "00000000-0000-4000-8000-000000000002"
OUTSIDER = "00000000-0000-4000-8000-000000000003"   # same school, not invited
OTHER_SCHOOL = "00000000-0000-4000-8000-000000000004"
READ_ONLY = "00000000-0000-4000-8000-000000000005"

FUTURE = "00000000-0000-4000-9000-000000000001"
PAST = "00000000-0000-4000-9000-000000000002"
ANSWERED = "00000000-0000-4000-9000-000000000003"
SERIES = "00000000-0000-4000-9000-000000000004"
FOREIGN = "00000000-0000-4000-9000-000000000005"


def account(id_, pid, school, ro=False, first="F"):
    return {"id": id_, "public_id": pid, "role": "teacher", "school": school,
            "email": f"{id_}@test", "first_name": first, "last_name": "L",
            "password_hash": PW_HASH, "read_only": ro,
            "failed_login_attempts": 0, "locked_until": None}


def event(id_, pid, school, starts, ends, title, recurrence_id=None):
    return {"id": id_, "public_id": pid, "school": school, "organizer": ORGANIZER,
            "title": title, "event_type": "meeting", "starts_at": starts,
            "ends_at": ends, "recurrence_id": recurrence_id, "location": "Room 4"}


def invite(event_id, user_id, attendance="invited"):
    return {"event_id": event_id, "user_id": user_id, "student_id": None,
            "attendance": attendance}


SEED = {
    "users": [account(1, ORGANIZER, 1, first="Olive"), account(2, INVITEE, 1),
              account(3, OUTSIDER, 1), account(4, OTHER_SCHOOL, 2),
              account(5, READ_ONLY, 1, ro=True)],
    "calendar_events": [
        event(1, FUTURE, 1, "2999-01-05T10:00:00+00:00", "2999-01-05T11:00:00+00:00", "Future"),
        event(2, PAST, 1, "2000-01-05T10:00:00+00:00", "2000-01-05T11:00:00+00:00", "Past"),
        event(3, ANSWERED, 1, "2999-01-06T10:00:00+00:00", "2999-01-06T11:00:00+00:00", "Answered"),
        # a series that started in the past but still has future occurrences
        event(4, SERIES, 1, "2000-01-03T09:00:00+00:00", "2000-01-03T09:30:00+00:00",
              "Weekly", recurrence_id=70),
        event(5, FOREIGN, 2, "2999-01-05T10:00:00+00:00", "2999-01-05T11:00:00+00:00", "Elsewhere"),
    ],
    "event_recurrence": [{"id": 70, "weekdays": [0], "every_n_weeks": 1, "ends_on": "2999-12-31"}],
    "event_participants": [
        invite(1, INVITEE), invite(2, INVITEE), invite(3, INVITEE, "accepted"),
        invite(4, INVITEE), invite(5, INVITEE), invite(1, READ_ONLY),
        {"event_id": 1, "user_id": None, "student_id": 42, "attendance": "invited"},
    ],
}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(SEED)
    monkeypatch.setattr(sc, "supabase", fake)
    return fake


@pytest.fixture
def client(db):
    return TestClient(main.app, raise_server_exceptions=False)


def auth(db, public_id):
    user = next(u for u in db.tables["users"] if u["public_id"] == public_id)
    return {"Authorization": "Bearer " + security.create_access_token(user)}


def attendance(db, event_id, user_id):
    return next(
        r["attendance"] for r in db.tables["event_participants"]
        if r["event_id"] == event_id and r.get("user_id") == user_id
    )


def test_notifications_list_only_unanswered_upcoming_invites_in_own_school(client, db):
    response = client.get("/calendar-notifications", headers=auth(db, INVITEE))

    assert response.status_code == 200
    body = response.json()
    assert [n["event_id"] for n in body["notifications"]] == [SERIES, FUTURE]
    assert body["count"] == 2
    future = body["notifications"][1]
    assert future["title"] == "Future"
    assert future["organizer_name"] == "Olive L"
    assert future["attendance"] == "invited"


def test_organizer_and_uninvited_users_get_no_notifications(client, db):
    for user in (ORGANIZER, OUTSIDER):
        response = client.get("/calendar-notifications", headers=auth(db, user))
        assert response.status_code == 200
        assert response.json() == {"notifications": [], "count": 0}


@pytest.mark.parametrize("answer", ["accepted", "declined"])
def test_invitee_can_accept_or_decline(client, db, answer):
    response = client.post(
        f"/calendar-events/{FUTURE}/response",
        json={"response": answer}, headers=auth(db, INVITEE),
    )

    assert response.status_code == 200
    assert response.json() == {"event_id": FUTURE, "attendance": answer}
    assert attendance(db, 1, INVITEE) == answer
    # nobody else's row on the event changed
    assert attendance(db, 1, READ_ONLY) == "invited"
    remaining = client.get("/calendar-notifications", headers=auth(db, INVITEE)).json()
    assert FUTURE not in [n["event_id"] for n in remaining["notifications"]]


def test_invitee_can_change_their_answer(client, db):
    response = client.post(
        f"/calendar-events/{ANSWERED}/response",
        json={"response": "declined"}, headers=auth(db, INVITEE),
    )
    assert response.status_code == 200
    assert attendance(db, 3, INVITEE) == "declined"


@pytest.mark.parametrize("answer", ["maybe", "invited", "attended", ""])
def test_only_accept_or_decline_are_valid_answers(client, db, answer):
    response = client.post(
        f"/calendar-events/{FUTURE}/response",
        json={"response": answer}, headers=auth(db, INVITEE),
    )
    assert response.status_code == 422
    assert attendance(db, 1, INVITEE) == "invited"


@pytest.mark.parametrize("user, event_pid", [
    (OUTSIDER, FUTURE),          # same school, not invited
    (OTHER_SCHOOL, FUTURE),      # other school
    (INVITEE, FOREIGN),          # invited, but event belongs to another school
    (INVITEE, "00000000-0000-4000-9000-00000000ffff"),  # no such event
])
def test_cannot_respond_to_events_you_are_not_invited_to(client, db, user, event_pid):
    before = [dict(r) for r in db.tables["event_participants"]]
    response = client.post(
        f"/calendar-events/{event_pid}/response",
        json={"response": "accepted"}, headers=auth(db, user),
    )
    assert response.status_code == 404
    assert db.tables["event_participants"] == before


def test_read_only_user_cannot_respond(client, db):
    response = client.post(
        f"/calendar-events/{FUTURE}/response",
        json={"response": "accepted"}, headers=auth(db, READ_ONLY),
    )
    assert response.status_code == 403
    assert attendance(db, 1, READ_ONLY) == "invited"


def test_responding_requires_sign_in(client):
    response = client.post(f"/calendar-events/{FUTURE}/response", json={"response": "accepted"})
    assert response.status_code == 401


def test_editing_invite_list_keeps_existing_answers(client, db):
    client.post(f"/calendar-events/{FUTURE}/response",
                json={"response": "accepted"}, headers=auth(db, INVITEE))

    response = client.put(
        f"/calendar-events/{FUTURE}",
        json={"participants": [{"user_id": INVITEE}, {"user_id": OUTSIDER}]},
        headers=auth(db, ORGANIZER),
    )

    assert response.status_code == 200, response.text
    assert attendance(db, 1, INVITEE) == "accepted"
    assert attendance(db, 1, OUTSIDER) == "invited"
