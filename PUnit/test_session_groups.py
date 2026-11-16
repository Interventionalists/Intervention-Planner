from database import supabase_client


def test_add_student_group_names_returns_all_school_groups(monkeypatch):
    class Query:
        def __init__(self, table_name):
            self.table_name = table_name
            self.filters = []

        def select(self, _columns):
            return self

        def in_(self, column, values):
            self.filters.append((column, values))
            return self

        def execute(self):
            if self.table_name == "session_groups":
                assert ("school", [7]) in self.filters
                data = [
                    {"id": 3, "name": "Reading group"},
                    {"id": 4, "name": "Math group"},
                ]
            else:
                assert ("student_id", [11, 12]) in self.filters
                assert ("group_id", [3, 4]) in self.filters
                data = [
                    {"student_id": 11, "group_id": 3},
                    {"student_id": 11, "group_id": 4},
                    {"student_id": 12, "group_id": 4},
                ]
            return type("Response", (), {"data": data})()

    class FakeSupabase:
        def table(self, table_name):
            return Query(table_name)

    monkeypatch.setattr(supabase_client, "supabase", FakeSupabase())

    students = supabase_client._add_student_group_names(
        [
            {"id": 11, "school": 7, "group_number": 2},
            {"id": 12, "school": 7, "group_number": 3},
        ],
        school_id=7,
    )

    assert [student["group_names"] for student in students] == [
        ["Math group", "Reading group"],
        ["Math group"],
    ]


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


def test_delete_group_removes_linked_calendar_sessions_and_memberships(monkeypatch):
    queries = []
    events = [
        {"id": 10, "public_id": "event-10", "recurrence_id": 5, "school": 7},
        {"id": 11, "public_id": "event-11", "recurrence_id": None, "school": 7},
    ]

    class Query:
        def __init__(self, table_name):
            self.table_name = table_name
            self.operation = None
            self.filters = []
            self.selected = None
            queries.append(self)

        def select(self, columns):
            self.selected = columns
            return self

        def limit(self, count):
            self.limit_count = count
            return self

        def eq(self, column, value):
            self.filters.append((column, value))
            return self

        def delete(self):
            self.operation = ("delete",)
            return self

        def execute(self):
            if self.table_name == "session_groups":
                return type("Response", (), {"data": [{"id": 3}]})()
            if self.table_name == "calendar_events":
                if self.operation == ("delete",):
                    public_id = next(
                        value for column, value in self.filters if column == "public_id"
                    )
                    return type("Response", (), {"data": [{"public_id": public_id}]})()
                if ("session_group_id", 3) in self.filters:
                    return type("Response", (), {"data": events})()
                return type("Response", (), {"data": []})()
            if self.table_name == "event_recurrence" and self.operation == ("delete",):
                return type("Response", (), {"data": [{"id": 5}]})()
            return type("Response", (), {"data": []})()

    class FakeSupabase:
        def table(self, table_name):
            return Query(table_name)

    monkeypatch.setattr(supabase_client, "supabase", FakeSupabase())

    assert supabase_client.delete_group(group_id=3, school_id=7) is True
    assert [
        (query.table_name, query.operation, query.filters)
        for query in queries
    ] == [
        ("session_groups", None, [("id", 3), ("school", 7)]),
        ("calendar_events", None, [("session_group_id", 3)]),
        ("event_participants", ("delete",), [("event_id", 10)]),
        ("calendar_events", ("delete",), [("public_id", "event-10"), ("school", 7)]),
        ("event_participants", ("delete",), [("event_id", 11)]),
        ("calendar_events", ("delete",), [("public_id", "event-11"), ("school", 7)]),
        ("calendar_events", None, [("recurrence_id", 5)]),
        ("event_recurrence", ("delete",), [("id", 5)]),
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
