import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import todos


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(todos.router)
    app.dependency_overrides[todos.get_current_user] = lambda: {
        "id": 7,
        "public_id": "user-123",
        "role": "interventionist",
    }

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


def test_list_todos_uses_token_user_id(client, monkeypatch):
    calls = []

    def fake_fetch(user_id, status):
        calls.append((user_id, status))
        return [{"id": 1, "user_id": 7, "status": "incomplete"}]

    monkeypatch.setattr(todos, "fetch_todos_for_user", fake_fetch)

    response = client.get("/todos")

    assert response.status_code == 200
    assert response.json() == {"todos": [{"id": 1, "user_id": 7, "status": "incomplete"}]}
    assert calls == [(7, None)]


def test_list_todos_filters_by_status(client, monkeypatch):
    calls = []
    monkeypatch.setattr(
        todos, "fetch_todos_for_user", lambda user_id, status: calls.append(status) or []
    )

    response = client.get("/todos?status=late")

    assert response.status_code == 200
    assert calls == ["late"]


def test_list_todos_rejects_unknown_status(client):
    response = client.get("/todos?status=archived")

    assert response.status_code == 422


def test_create_todo_defaults_to_incomplete_and_ignores_body_user_id(client, monkeypatch):
    created = []

    def fake_create(user_id, description, due_date, status):
        created.append((user_id, description, due_date, status))
        return {"id": 5, "user_id": user_id, "description": description,
                "due_date": due_date, "status": status}

    monkeypatch.setattr(todos, "create_todo", fake_create)

    response = client.post(
        "/todos",
        json={"description": "Grade quizzes", "due_date": "2026-11-20T15:00:00+00:00",
              "user_id": 999},
    )

    assert response.status_code == 201
    assert created == [(7, "Grade quizzes", "2026-11-20T15:00:00+00:00", "incomplete")]


def test_create_todo_rejects_invalid_status(client, monkeypatch):
    monkeypatch.setattr(
        todos, "create_todo", lambda *_args: pytest.fail("should not insert")
    )

    response = client.post("/todos", json={"description": "x", "status": "pending"})

    assert response.status_code == 422


def test_update_todo_sends_only_provided_fields(client, monkeypatch):
    updates = []

    def fake_update(todo_id, user_id, fields):
        updates.append((todo_id, user_id, fields))
        return {"id": todo_id, **fields}

    monkeypatch.setattr(todos, "update_todo", fake_update)

    response = client.patch("/todos/5", json={"status": "done"})

    assert response.status_code == 200
    assert updates == [(5, 7, {"status": "done"})]


def test_update_todo_can_clear_due_date(client, monkeypatch):
    updates = []
    monkeypatch.setattr(
        todos, "update_todo",
        lambda todo_id, user_id, fields: updates.append(fields) or {"id": todo_id},
    )

    response = client.patch("/todos/5", json={"due_date": None})

    assert response.status_code == 200
    assert updates == [{"due_date": None}]


def test_update_todo_rejects_empty_body_and_null_status(client):
    assert client.patch("/todos/5", json={}).status_code == 400
    assert client.patch("/todos/5", json={"status": None}).status_code == 400


def test_update_todo_returns_404_when_not_owned(client, monkeypatch):
    monkeypatch.setattr(todos, "update_todo", lambda *_args: None)

    response = client.patch("/todos/5", json={"status": "done"})

    assert response.status_code == 404


def test_delete_todo_scoped_to_token_user(client, monkeypatch):
    deleted = []
    monkeypatch.setattr(
        todos, "delete_todo",
        lambda todo_id, user_id: deleted.append((todo_id, user_id)) or True,
    )

    response = client.delete("/todos/5")

    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert deleted == [(5, 7)]


def test_delete_todo_returns_404_when_missing(client, monkeypatch):
    monkeypatch.setattr(todos, "delete_todo", lambda *_args: False)

    response = client.delete("/todos/5")

    assert response.status_code == 404


class _RecordingQuery:
    """Fake supabase query that records each chained call in order."""

    def __init__(self, log, table_name):
        self.log = log
        self.calls = [("table", table_name)]
        log.append(self.calls)

    def __getattr__(self, name):
        def record(*args, **kwargs):
            self.calls.append((name, args))
            return self
        return record

    def execute(self):
        return type("Response", (), {"data": []})()


def _fake_supabase(monkeypatch):
    from database import supabase_client

    log = []
    fake = type("FakeSupabase", (), {"table": lambda _self, name: _RecordingQuery(log, name)})()
    monkeypatch.setattr(supabase_client, "supabase", fake)
    return supabase_client, log


def test_mark_overdue_only_touches_users_incomplete_past_due(monkeypatch):
    supabase_client, log = _fake_supabase(monkeypatch)

    supabase_client.mark_overdue_todos_late(7)

    calls = log[0]
    assert calls[0] == ("table", "todo_list")
    assert ("update", ({"status": "late"},)) in calls
    assert ("eq", ("user_id", 7)) in calls
    assert ("eq", ("status", "incomplete")) in calls
    lt_calls = [args for name, args in calls if name == "lt"]
    assert len(lt_calls) == 1 and lt_calls[0][0] == "due_date"


def test_fetch_todos_marks_overdue_before_selecting(monkeypatch):
    supabase_client, log = _fake_supabase(monkeypatch)

    supabase_client.fetch_todos_for_user(7)

    assert [calls[1][0] for calls in log] == ["update", "select"]
