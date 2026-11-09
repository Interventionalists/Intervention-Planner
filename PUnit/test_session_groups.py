from database import supabase_client


def test_create_groups_inserts_session_group_columns(monkeypatch):
    class Query:
        def __init__(self):
            self.inserted = None

        def insert(self, values):
            self.inserted = values
            return self

        def select(self, _columns):
            return self

        def execute(self):
            return type("Response", (), {"data": [self.inserted]})()

    class FakeSupabase:
        def __init__(self):
            self.query = Query()

        def table(self, table_name):
            assert table_name == "session_groups"
            return self.query

    fake_supabase = FakeSupabase()
    monkeypatch.setattr(supabase_client, "supabase", fake_supabase)

    result = supabase_client.create_groups(
        school_id=7,
        name="Reading group",
        purpose="Fluency practice",
        interventionist_id="user-123",
    )

    assert fake_supabase.query.inserted == {
        "school": 7,
        "name": "Reading group",
        "purpose": "Fluency practice",
        "interventionist": "user-123",
    }
    assert result == fake_supabase.query.inserted


def test_delete_group_clears_memberships_and_calendar_group_links(monkeypatch):
    queries = []

    class Query:
        def __init__(self, table_name):
            self.table_name = table_name
            self.operation = None
            self.filters = []
            queries.append(self)

        def select(self, columns):
            self.selected = columns
            return self

        def limit(self, _count):
            return self

        def eq(self, column, value):
            self.filters.append((column, value))
            return self

        def update(self, values):
            self.operation = ("update", values)
            return self

        def delete(self):
            self.operation = ("delete",)
            return self

        def execute(self):
            if self.table_name == "session_groups" and self.operation == ("delete",):
                return type("Response", (), {"data": [{"id": 3}]})()
            if self.table_name == "session_groups":
                return type("Response", (), {"data": [{"id": 3}]})()
            return type("Response", (), {"data": []})()

    class FakeSupabase:
        def table(self, table_name):
            return Query(table_name)

    monkeypatch.setattr(supabase_client, "supabase", FakeSupabase())

    assert supabase_client.delete_group(group_id=3, school_id=7) is True
    assert [(query.table_name, query.operation, query.filters) for query in queries] == [
        ("session_groups", None, [("id", 3), ("school", 7)]),
        (
            "calendar_events",
            ("update", {"session_group_id": None}),
            [("session_group_id", 3), ("school", 7)],
        ),
        ("session_group_members", ("delete",), [("group_id", 3)]),
        ("session_groups", ("delete",), [("id", 3), ("school", 7)]),
    ]


def test_delete_group_does_not_change_related_rows_for_other_school(monkeypatch):
    class Query:
        def __init__(self):
            self.table_name = None

        def select(self, _columns):
            return self

        def eq(self, _column, _value):
            return self

        def limit(self, _count):
            return self

        def execute(self):
            return type("Response", (), {"data": []})()

    class FakeSupabase:
        def table(self, table_name):
            assert table_name == "session_groups"
            return Query()

    monkeypatch.setattr(supabase_client, "supabase", FakeSupabase())

    assert supabase_client.delete_group(group_id=3, school_id=7) is False
