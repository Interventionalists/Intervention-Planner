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
