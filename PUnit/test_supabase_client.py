# ------------------------------------------------------------------------------
#
# Name:        test_supabase_client.py
# Purpose:     check the database helpers that contain real logic (password
#              hashing, search filters, column mapping, grade averages) using
#              a fake Supabase client, so no real database is touched.
#
# ------------------------------------------------------------------------------

import pytest

from database import supabase_client as db


class FakeQuery:
    """Records every chained call and returns canned rows from execute()."""

    def __init__(self, table, responses, log):
        self.table = table
        self.responses = responses
        self.log = log
        self.calls = []

    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self
        return method

    def execute(self):
        self.log.append((self.table, self.calls))
        data, count = self.responses[self.table].pop(0)
        return type("Response", (), {"data": data, "count": count})()


class FakeSupabase:
    def __init__(self, **responses):
        # each table maps to a list of (data, count) results, one per execute()
        self.responses = {
            table: [r if isinstance(r, tuple) else (r, None) for r in results]
            for table, results in responses.items()
        }
        self.log = []

    def table(self, name):
        return FakeQuery(name, self.responses, self.log)

    def calls_for(self, table, index=0):
        return [calls for name, calls in self.log if name == table][index]


def call_names(calls):
    return [name for name, _, _ in calls]


################################ passwords ###################################

def test_hash_password_round_trips():
    password_hash = db.hash_password("correct horse battery staple")

    assert password_hash != "correct horse battery staple"
    assert db.verify_password("correct horse battery staple", password_hash)
    assert not db.verify_password("wrong", password_hash)


def test_hash_password_is_salted():
    assert db.hash_password("same") != db.hash_password("same")


################################ user search #################################

@pytest.mark.parametrize(
    "raw, escaped",
    [("plain", "plain"), ('a"b', 'a\\"b'), ("a\\b", "a\\\\b"), ('\\"', '\\\\\\"')],
)
def test_escape_filter_value(raw, escaped):
    assert db._escape_filter_value(raw) == escaped


def test_users_page_without_search(monkeypatch):
    fake = FakeSupabase(users=[([{"id": 1}], 1)])
    monkeypatch.setattr(db, "supabase", fake)

    result = db.fetch_users_page(1)

    assert result == {"users": [{"id": 1}], "total": 1, "page_size": 25}
    calls = fake.calls_for("users")
    assert "or_" not in call_names(calls)
    assert ("range", (0, 24), {}) in calls


def test_users_page_offsets_by_page(monkeypatch):
    fake = FakeSupabase(users=[([], None)])
    monkeypatch.setattr(db, "supabase", fake)

    result = db.fetch_users_page(3)

    assert ("range", (50, 74), {}) in fake.calls_for("users")
    assert result["total"] == 0


def test_users_page_role_filter(monkeypatch):
    fake = FakeSupabase(users=[([], 0)])
    monkeypatch.setattr(db, "supabase", fake)

    db.fetch_users_page(1, role="admin")

    assert ("eq", ("role", "admin"), {}) in fake.calls_for("users")


def or_filter(fake):
    [(_, (expression,), _)] = [c for c in fake.calls_for("users") if c[0] == "or_"]
    return expression


def test_users_search_matches_both_name_orders(monkeypatch):
    fake = FakeSupabase(users=[([], 0)])
    monkeypatch.setattr(db, "supabase", fake)

    db.fetch_users_page(1, search="Ada Lovelace")

    expression = or_filter(fake)
    assert 'email.ilike."%Ada Lovelace%"' in expression
    assert 'and(first_name.ilike."%Ada%",last_name.ilike."%Lovelace%")' in expression
    assert "school.eq" not in expression


def test_users_search_by_number_also_matches_school(monkeypatch):
    fake = FakeSupabase(users=[([], 0)])
    monkeypatch.setattr(db, "supabase", fake)

    db.fetch_users_page(1, search="12")

    assert "school.eq.12" in or_filter(fake)


def test_users_search_escapes_quotes(monkeypatch):
    fake = FakeSupabase(users=[([], 0)])
    monkeypatch.setattr(db, "supabase", fake)

    db.fetch_users_page(1, search='x"),role.eq.admin')

    # the quote can't close the filter value early
    assert 'first_name.ilike."%x\\"),role.eq.admin%"' in or_filter(fake)


################################ assignments mapping #########################

def test_assignment_rows_map_between_api_and_database_names():
    api = {"id": "a", "subject": "math", "assignment": "Quiz", "grade": 90}
    row = {"id": "a", "class": "math", "Assignment": "Quiz", "grade": 90}

    assert db._to_assignment_row(api) == row
    assert db._from_assignment_row(row) == api


def test_assignment_mapping_leaves_already_mapped_keys_alone():
    row = {"class": "math", "Assignment": "Quiz"}
    assert db._to_assignment_row(row) == row


def test_delete_assignment_reports_whether_a_row_was_removed(monkeypatch):
    monkeypatch.setattr(db, "supabase", FakeSupabase(student_assignments=[[{"id": "a"}], []]))

    assert db.delete_assignment("a") is True
    assert db.delete_assignment("a") is False


################################ student enrichment ##########################

def test_add_assignment_grades_skips_empty_list(monkeypatch):
    monkeypatch.setattr(db, "supabase", FakeSupabase())
    assert db._add_assignment_grades([]) == []


def test_add_assignment_grades_maps_columns_and_drops_nulls(monkeypatch):
    fake = FakeSupabase(
        student_subject_averages=[[
            {"student_id": 1, "math": 55.0, "english": None, "social_studies": 80, "p_e": 99,
             "science": None, "art": None},
        ]]
    )
    monkeypatch.setattr(db, "supabase", fake)

    result = db._add_assignment_grades([{"id": 1}, {"id": 2}])

    assert result == [
        {"id": 1, "scores": {"Math": 55.0, "Social Studies": 80, "P.E.": 99}},
        {"id": 2, "scores": {}},
    ]


def test_add_student_user_names(monkeypatch):
    fake = FakeSupabase(users=[[
        {"public_id": "t1", "first_name": "Tess", "last_name": "Teacher"},
        {"public_id": "i1", "first_name": "Ivy", "last_name": None},
    ]])
    monkeypatch.setattr(db, "supabase", fake)

    result = db._add_student_user_names([
        {"id": 1, "teacher": "t1", "interventionist": "i1"},
        {"id": 2, "teacher": None, "interventionist": None},
    ])

    assert result[0]["teacher_name"] == "Tess Teacher"
    assert result[0]["interventionist_name"] == "Ivy"
    assert result[1]["teacher_name"] is None


def test_add_student_user_names_skips_lookup_when_no_staff(monkeypatch):
    monkeypatch.setattr(db, "supabase", FakeSupabase())
    students = [{"id": 1, "teacher": None, "interventionist": None}]

    assert db._add_student_user_names(students) is students


def test_assign_student_rejects_interventionist_outside_school(monkeypatch):
    monkeypatch.setattr(db, "supabase", FakeSupabase(users=[[]]))

    with pytest.raises(ValueError):
        db.assign_student_to_interventionist(8, "int-1", 4)


def test_assign_student_only_updates_unassigned_students_in_school(monkeypatch):
    fake = FakeSupabase(users=[[{"public_id": "int-1"}]], students=[[]])
    monkeypatch.setattr(db, "supabase", fake)

    assert db.assign_student_to_interventionist(8, "int-1", 4) is None

    update = fake.calls_for("students")
    assert ("eq", ("school", 4), {}) in update
    assert ("is_", ("interventionist", "null"), {}) in update
