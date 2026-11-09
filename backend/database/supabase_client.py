from datetime import date, datetime, timedelta
import math
import os

import bcrypt
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)


################################## USER FUNCTIONS ########################################

PUBLIC_USER_COLUMNS = "id, public_id, first_name, last_name, email, role, school"

#looks up a single user by email for login verification.
def fetch_user_by_email(email):
    response = supabase.table("users").select("*").eq("email", email).limit(1).execute()
    return response.data[0] if response.data else None

#hashes a plaintext password for storage in password_hash. bcrypt generates
#and embeds a random salt per call, so no separate salt column is needed.
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

#checks a plaintext password against a stored bcrypt hash.
def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))

#replaces the stored password_hash for the user with the given email.
#expects an already-hashed value; callers should use hash_password first.
def update_user_password(email: str, password_hash: str):
    response = supabase.table("users").update({"password_hash": password_hash}).eq("email", email).execute()
    return response.data[0] if response.data else None

#records a login attempt via the record_login_attempt Postgres function, which
#increments/resets the counter and sets locked_until in one atomic update.
#returns {"failed_login_attempts": int, "locked_until": str | None}.
def record_login_attempt(user_id: int, success: bool, max_attempts: int, lock_minutes: int):
    response = supabase.rpc("record_login_attempt", {
        "p_user_id": user_id,
        "p_success": success,
        "p_max_attempts": max_attempts,
        "p_lock_minutes": lock_minutes,
    }).execute()
    return response.data[0] if response.data else None


def _escape_filter_value(value: str) -> str:
    # Supabase's .or_ filters use a string expression, so escape its delimiters.
    return value.replace("\\", "\\\\").replace('"', '\\"')


def fetch_users_page(page: int, search: str = "", role: str | None = None):
    page_size = 25
    query = (
        supabase.table("users")
        .select(PUBLIC_USER_COLUMNS, count="exact")
        .order("id")
    )
    if role:
        query = query.eq("role", role)
    if search:
        search_filters = [
            f'{field}.ilike."%{_escape_filter_value(search)}%"'
            for field in ("first_name", "last_name", "email", "role")
        ]
        search_terms = search.split()
        if len(search_terms) > 1:
            # Match both "First Last" and "Last First" name orderings.
            name_matches = (
                (search_terms[0], " ".join(search_terms[1:])),
                (" ".join(search_terms[:-1]), search_terms[-1]),
            )
            search_filters.extend(
                "and("
                f'first_name.ilike."%{_escape_filter_value(first)}%",'
                f'last_name.ilike."%{_escape_filter_value(last)}%"'
                ")"
                for first, last in name_matches
            )
        if search.isdigit():
            search_filters.append(f"school.eq.{int(search)}")
        query = query.or_(",".join(search_filters))

    offset = (page - 1) * page_size
    response = query.range(offset, offset + page_size - 1).execute()
    return {
        "users": response.data,
        "total": response.count or 0,
        "page_size": page_size,
    }

def update_user(user_id, updates: dict):
    response = (
        supabase.table("users")
        .update(updates)
        .eq("id", user_id)
        .select(PUBLIC_USER_COLUMNS)
        .execute()
    )
    return response.data[0] if response.data else None

################################## STUDENT FUNCTIONS ########################################
def _add_student_user_names(students):
    user_ids = {
        str(student[field])
        for student in students
        for field in ("teacher", "interventionist")
        if student.get(field)
    }
    if not user_ids:
        return students

    users_response = (
        supabase.table("users")
        .select("public_id, first_name, last_name")
        .in_("public_id", list(user_ids))
        .execute()
    )
    user_names = {
        str(user["public_id"]): " ".join(
            part for part in (user.get("first_name"), user.get("last_name")) if part
        )
        for user in users_response.data
    }

    return [
        {
            **student,
            "teacher_name": user_names.get(str(student.get("teacher"))),
            "interventionist_name": user_names.get(
                str(student.get("interventionist"))
            ),
        }
        for student in students
    ]


#student_subject_averages column -> subject name shown in the UI
SUBJECT_NAMES = {
    "math": "Math",
    "english": "English",
    "social_studies": "Social Studies",
    "science": "Science",
    "art": "Art",
    "p_e": "P.E.",
}

#builds each student's "scores" ({subject: average grade}) from the
#student_subject_averages view. subjects with no average (null) are left out.
def _add_assignment_grades(students):
    if not students:
        return students

    average_response = (
        supabase.table("student_subject_averages")
        .select("student_id, " + ", ".join(SUBJECT_NAMES))
        .in_("student_id", [student["id"] for student in students])
        .execute()
    )
    grades_by_student = {
        str(average["student_id"]): {
            subject: average[column]
            for column, subject in SUBJECT_NAMES.items()
            if average.get(column) is not None
        }
        for average in average_response.data
    }

    return [
        {
            **student,
            "scores": grades_by_student.get(str(student["id"]), {}),
        }
        for student in students
    ]


def fetch_students(school_id: int | None = None):
    query = supabase.table("students").select("*")
    if school_id is not None:
        query = query.eq("school", school_id)
    response = query.execute()
    return _add_assignment_grades(_add_student_user_names(response.data))

def fetch_student_name(student_id):
    response = supabase.table("students").select("first_name", "last_name").eq("id", student_id).execute()
    return _add_student_user_names(response.data)

def fetch_user_school_by_public_id(public_id: str):
    response = (
        supabase.table("users")
        .select("school")
        .eq("public_id", public_id)
        .limit(1)
        .execute()
    )
    return response.data[0]["school"] if response.data else None

def fetch_unassigned_students(school_id: int):
    response = (
        supabase.table("students")
        .select("*")
        .eq("school", school_id)
        .is_("interventionist", "null")
        .execute()
    )
    return _add_assignment_grades(_add_student_user_names(response.data))

def assign_student_to_interventionist(
    student_id: int,
    interventionist_id: str,
    school_id: int,
):
    interventionist = (
        supabase.table("users")
        .select("public_id")
        .eq("public_id", interventionist_id)
        .eq("role", "interventionist")
        .eq("school", school_id)
        .limit(1)
        .execute()
    )
    if not interventionist.data:
        raise ValueError("Interventionist not found.")

    response = (
        supabase.table("students")
        .update({"interventionist": interventionist_id})
        .eq("id", student_id)
        .eq("school", school_id)
        .is_("interventionist", "null")
        .select("*")
        .execute()
    )
    if not response.data:
        return None
    return _add_assignment_grades(_add_student_user_names(response.data))[0]


def update_student_profile(student_id: int, school_id: int, updates: dict):
    response = (
        supabase.table("students")
        .update(updates)
        .eq("id", student_id)
        .eq("school", school_id)
        .select("*")
        .execute()
    )
    if not response.data:
        return None
    return _add_assignment_grades(_add_student_user_names(response.data))[0]


def create_state_test_score(
    student: int,
    test_name: str,
    grade: int,
    year_taken: int,
    school_id: int | None = None,
):
    student_query = (
        supabase.table("students")
        .select("id")
        .eq("id", student)
    )
    if school_id is not None:
        student_query = student_query.eq("school", school_id)
    if not student_query.limit(1).execute().data:
        return None

    response = (
        supabase.table("state_test_scoring")
        .insert({
            "student": student,
            "test_name": test_name,
            "grade": grade,
            "year_taken": year_taken,
        })
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None


def update_state_test_score(
    score_id: int,
    test_name: str,
    grade: int,
    year_taken: int,
    school_id: int | None = None,
):
    score_response = (
        supabase.table("state_test_scoring")
        .select("student")
        .eq("id", score_id)
        .limit(1)
        .execute()
    )
    if not score_response.data:
        return None

    student_id = score_response.data[0]["student"]
    student_query = (
        supabase.table("students")
        .select("id")
        .eq("id", student_id)
    )
    if school_id is not None:
        student_query = student_query.eq("school", school_id)
    if not student_query.limit(1).execute().data:
        return None

    response = (
        supabase.table("state_test_scoring")
        .update({
            "test_name": test_name,
            "grade": grade,
            "year_taken": year_taken,
        })
        .eq("id", score_id)
        .eq("student", student_id)
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None


def delete_state_test_score(score_id: int, school_id: int | None = None):
    score_response = (
        supabase.table("state_test_scoring")
        .select("student")
        .eq("id", score_id)
        .limit(1)
        .execute()
    )
    if not score_response.data:
        return None

    student_id = score_response.data[0]["student"]
    student_query = (
        supabase.table("students")
        .select("id")
        .eq("id", student_id)
    )
    if school_id is not None:
        student_query = student_query.eq("school", school_id)
    if not student_query.limit(1).execute().data:
        return None

    response = (
        supabase.table("state_test_scoring")
        .delete()
        .eq("id", score_id)
        .eq("student", student_id)
        .select("id")
        .execute()
    )
    return response.data[0] if response.data else None


def fetch_state_test_scores(student: int, school_id: int | None = None):
    student_query = (
        supabase.table("students")
        .select("id")
        .eq("id", student)
    )
    if school_id is not None:
        student_query = student_query.eq("school", school_id)
    if not student_query.limit(1).execute().data:
        return None

    response = (
        supabase.table("state_test_scoring")
        .select("*")
        .eq("student", student)
        .order("year_taken", desc=True)
        .order("test_name")
        .execute()
    )
    return response.data


def create_student(
    first_name: str,
    last_name: str,
    grade_level: int | None = None,
    teacher: str | None = None,
    interventionist: str | None = None,
    school: int | None = None,
    profile_api_link: str | None = None,
):
    student = {
        "first_name": first_name,
        "last_name": last_name,
        "grade_level": grade_level,
        "teacher": teacher,
        "interventionist": interventionist,
        "school": school,
        "profile_api_link": profile_api_link,
    }
    response = (
        supabase.table("students")
        .insert(student)
        .select("*")
        .execute()
    )
    if not response.data:
        raise RuntimeError("Student insert returned no row.")
    return response.data[0]

STUDENT_GOAL_SUBJECTS = (
    "math",
    "english",
    "social_studies",
    "science",
    "art",
    "p_e",
)


def _fetch_student_public_id(student_id: int):
    response = (
        supabase.table("students")
        .select("public_id")
        .eq("id", student_id)
        .limit(1)
        .execute()
    )
    return response.data[0]["public_id"] if response.data else None


def create_student_goals(student_id: int, goals: dict):
    student_public_id = _fetch_student_public_id(student_id)
    if student_public_id is None:
        raise ValueError("Student not found.")

    subject_goals = {
        subject: goals.get(subject)
        for subject in STUDENT_GOAL_SUBJECTS
    }
    response = (
        supabase.table("student-subject-goals")
        .insert({"student_id": student_public_id, **subject_goals})
        .select("*")
        .execute()
    )
    if not response.data:
        raise RuntimeError("Student goals insert returned no row.")
    return {
        "goals": {
            subject: response.data[0].get(subject)
            for subject in STUDENT_GOAL_SUBJECTS
        }
    }


def update_student_goals(student_id: int, goals: dict):
    student_public_id = _fetch_student_public_id(student_id)
    if student_public_id is None:
        return None

    subject_goals = {
        subject: goals.get(subject)
        for subject in STUDENT_GOAL_SUBJECTS
    }
    response = (
        supabase.table("student-subject-goals")
        .update(subject_goals)
        .eq("student_id", student_public_id)
        .select("*")
        .execute()
    )
    if not response.data:
        return None
    return {
        "goals": {
            subject: response.data[0].get(subject)
            for subject in STUDENT_GOAL_SUBJECTS
        }
    }


def fetch_student_goals(student_id: int):
    student_public_id = _fetch_student_public_id(student_id)
    if student_public_id is None:
        return None

    response = (
        supabase.table("student-subject-goals")
        .select("*")
        .eq("student_id", student_public_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return {
        "goals": {
            subject: response.data[0].get(subject)
            for subject in STUDENT_GOAL_SUBJECTS
        }
    }

################################# TEACHER FUNCTIONS ########################################
#columns safe to return for other users; never includes password_hash or
#lockout state.
def fetch_teachers(school_id: int | None = None):
    query = supabase.table("users").select(PUBLIC_USER_COLUMNS).eq("role", "teacher")
    if school_id is not None:
        query = query.eq("school", school_id)
    response = query.execute()
    return response.data



################################ INTERVENTIONIST FUNCTIONS ########################################
def fetch_interventionists(school_id: int | None = None):
    query = (
        supabase.table("users")
        .select("id, public_id, first_name, last_name, email")
        .eq("role", "interventionist")
    )
    if school_id is not None:
        query = query.eq("school", school_id)
    response = query.execute()
    return response.data

def fetch_interventionist_students(interventionist_id: str, school_id: int | None = None):
    query = (
        supabase.table("students")
        .select("*")
        .eq("interventionist", interventionist_id)
    )
    if school_id is not None:
        query = query.eq("school", school_id)
    response = query.execute()
    return _add_assignment_grades(_add_student_user_names(response.data))


################################ ADMIN FUNCTIONS ########################################
def fetch_admins():
    response = supabase.table("users").select(PUBLIC_USER_COLUMNS).eq("role", "admin").execute()
    return response.data



########################### SCHOOL FUNCTIONS #######################################33
def fetch_schools():
    response = supabase.table("schools").select("*").execute()
    return response.data

def update_user_school(user_id, new_school_id):
    response = supabase.table("users").update({"school": new_school_id}).eq("id", user_id).execute()
    return response.data

def fetch_user_school(user_id):
    response = supabase.table("users").select("school").eq("id", user_id).execute()
    return response.data[0]["school"] if response.data else None

def fetch_school_name(school_id):
    response = supabase.table("schools").select("school_name").eq("school_id", school_id).execute()
    return response.data[0]["school_name"] if response.data else None


def fetch_school_logo_api(school_id):
    response = (
        supabase.table("schools")
        .select("school_logo_api")
        .eq("school_id", school_id)
        .limit(1)
        .execute()
    )
    return response.data[0]["school_logo_api"] if response.data else None


def save_school_logo_api(school_id, logo_api):
    response = (
        supabase.table("schools")
        .update({"school_logo_api": logo_api})
        .eq("school_id", school_id)
        .select("school_logo_api")
        .execute()
    )
    if not response.data:
        raise RuntimeError("The school logo could not be saved.")
    return response.data[0]["school_logo_api"]


def fetch_school_theme(school_id):
    response = (
        supabase.table("themes")
        .select("*")
        .eq("school_id", school_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def save_school_theme(school_id, colors):
    theme_values = {
        "color_primary": colors[0],
        "color_secondary": colors[1],
        "color_tertiary": colors[2],
    }
    existing_theme = fetch_school_theme(school_id)
    if existing_theme:
        response = (
            supabase.table("themes")
            .update(theme_values)
            .eq("id", existing_theme["id"])
            .select("*")
            .execute()
        )
    else:
        response = (
            supabase.table("themes")
            .insert({"school_id": school_id, **theme_values})
            .select("*")
            .execute()
        )
    if not response.data:
        raise RuntimeError("The school theme could not be saved.")
    return response.data[0]


########################### NOTES FUNCTIONS #######################################

def fetch_notes_from_user(public_id):
    response = supabase.table("notes").select("*").eq("created_by", public_id).execute()
    return response.data

def fetch_notes_from_date(timestamp):
    response = supabase.table("notes").select("*").eq("date", timestamp).execute()
    return response.data

def fetch_notes_for_student(student_id):
    response = (supabase.table("notes").select("*").eq("student_id", student_id).order("date", desc=True).execute())
    return response.data

def create_note(student_id, created_by, text, is_private=False):
    response = supabase.table("notes").insert({
        "student_id": student_id,
        "created_by": created_by,
        "text": text,
        "privateNote": is_private,
    }).execute()
    return response.data[0] if response.data else None

def edit_text(note_id, new_text, user_id):
    response = supabase.table("notes").update({"text": new_text}).eq("id", note_id).eq("created_by", user_id).execute()
    return response.data

def delete_note(note_id, user_id):
    response = (
        supabase.table("notes")
        .delete()
        .eq("id", note_id)
        .eq("created_by", user_id)
        .execute()
    )
    return bool(response.data)


########################### HEALTH CHECK FUNCTIONS #######################################
#these use the shared service_role client above. health_checks has RLS on with no
#policies, so service_role is the only key that can read or write it. They only
#ever touch health_checks, never student or user tables.

HEALTH_CHECK_COLUMNS = "service, check_type, status, latency_ms, details, checked_at"

#cheapest possible round trip, used by the public /health endpoint
def ping_database():
    supabase.table("health_checks").select("id").limit(1).execute()
    return True

def insert_health_checks(rows: list[dict]):
    if rows:
        supabase.table("health_checks").insert(rows).execute()

def delete_health_checks_before(cutoff_iso: str):
    supabase.table("health_checks").delete().lt("checked_at", cutoff_iso).execute()

def fetch_health_history(service: str, since_iso: str, limit: int = 500):
    response = (
        supabase.table("health_checks")
        .select(HEALTH_CHECK_COLUMNS)
        .eq("service", service)
        .gte("checked_at", since_iso)
        .order("checked_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data

def fetch_health_events(since_iso: str, limit: int = 20):
    response = (
        supabase.table("health_checks")
        .select(HEALTH_CHECK_COLUMNS)
        .neq("status", "ok")
        .gte("checked_at", since_iso)
        .order("checked_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data


############################# ASSIGNMENT FUNCTIONS #######################################

#student_assignments stores the subject in "class" and the name in "Assignment".
#the API uses subject/assignment, so these map between the two shapes.
#subject values are the class codes (math, english, social_studies, science, art, p_e).
ASSIGNMENT_COLUMNS = {"subject": "class", "assignment": "Assignment"}

def _to_assignment_row(data: dict):
    return {ASSIGNMENT_COLUMNS.get(key, key): value for key, value in data.items()}

def _from_assignment_row(row: dict):
    api_names = {column: key for key, column in ASSIGNMENT_COLUMNS.items()}
    return {api_names.get(key, key): value for key, value in row.items()}

#fetches all assignments for a given student, ordered by created_at descending.
def fetch_assignments_for_student(student_id: int):
    response = (
        supabase.table("student_assignments")
        .select("*")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [_from_assignment_row(row) for row in response.data]

#fetches all assignments for a given student, in a given subject, ordered by created_at descending.
def fetch_assignments_for_student_subject(student_id: int, subject: str):
    response = (
        supabase.table("student_assignments")
        .select("*")
        .eq("student_id", student_id)
        .eq("class", subject)
        .order("created_at", desc=True)
        .execute()
    )
    return [_from_assignment_row(row) for row in response.data]

#fetches a student's assignments created on/after start_iso and before end_iso,
#optionally limited to one subject, ordered by created_at descending.
#either bound may be None to leave that side of the range open.
def fetch_assignments_for_student_in_range(student_id: int, start_iso: str | None = None, end_iso: str | None = None, subject: str | None = None):
    query = supabase.table("student_assignments").select("*").eq("student_id", student_id)
    if start_iso:
        query = query.gte("created_at", start_iso)
    if end_iso:
        query = query.lt("created_at", end_iso)
    if subject:
        query = query.eq("class", subject)
    response = query.order("created_at", desc=True).execute()
    return [_from_assignment_row(row) for row in response.data]

#Inserts a new assignment for a student. Expects a dictionary with keys:
#student_id, subject, assignment (name), and grade. Returns the inserted row.
def create_assignment(assignment_data: dict):
    response = (
        supabase.table("student_assignments")
        .insert(_to_assignment_row(assignment_data))
        .select("*")
        .execute()
    )
    return _from_assignment_row(response.data[0]) if response.data else None

#Updates an existing assignment. Expects the assignment ID and a dictionary of fields to update. Returns the updated row.
def update_assignment(assignment_id: str, updates: dict):
    response = (
        supabase.table("student_assignments")
        .update(_to_assignment_row(updates))
        .eq("id", assignment_id)
        .select("*")
        .execute()
    )
    return _from_assignment_row(response.data[0]) if response.data else None

#fetches a single assignment by ID, or None if it doesn't exist.
def fetch_assignment(assignment_id: str):
    response = supabase.table("student_assignments").select("*").eq("id", assignment_id).limit(1).execute()
    return _from_assignment_row(response.data[0]) if response.data else None

#deletes an assignment by ID. Returns True if a row was removed.
def delete_assignment(assignment_id: str):
    response = (
        supabase.table("student_assignments")
        .delete()
        .eq("id", assignment_id)
        .select("id")
        .execute()
    )
    return bool(response.data)

#returns who a student is assigned to ({"school", "teacher", "interventionist"}),
#or None if the student doesn't exist. Used to scope access to a student's records.
def fetch_student_ownership(student_id: int):
    response = (
        supabase.table("students")
        .select("school, teacher, interventionist")
        .eq("id", student_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None

############################### SESSION FUNCTIONS ######################################

def _to_session_row(data: dict):
    row = dict(data)
    if "id" in row:
        row["event_id"] = row.pop("id")
    if "event_id" not in row:
        raise ValueError("A calendar event ID is required to create a session.")
    if "focus" in row:
        row["session_details"] = row.pop("focus")
    if "duration_minutes" in row:
        row["duration"] = row.pop("duration_minutes")
    if "scheduled_at" in row:
        row["scheduled_time"] = row.pop("scheduled_at")
    return row


def _from_session_row(row: dict):
    session = dict(row)
    if "event_id" in session:
        session["id"] = session.pop("event_id")
    if "session_details" in session:
        session["focus"] = session.pop("session_details")
    if "duration" in session:
        session["duration_minutes"] = session.pop("duration")
    if "scheduled_time" in session:
        session["scheduled_at"] = session.pop("scheduled_time")
    return session


def fetch_sessions_for_student(student_id: int):
    response = (
        supabase.table("session_details")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    return [_from_session_row(row) for row in (response.data or [])]


def create_session(session_data: dict):
    response = (
        supabase.table("session_details")
        .insert(_to_session_row(session_data))
        .select("*")
        .execute()
    )
    return _from_session_row(response.data[0]) if response.data else None


def fetch_session(session_id: int):
    response = (
        supabase.table("session_details")
        .select("*")
        .eq("event_id", session_id)
        .limit(1)
        .execute()
    )
    return _from_session_row(response.data[0]) if response.data else None


def update_session_details(session_id: int, updates: dict):
    row_updates = _to_session_row({"event_id": session_id, **updates})
    row_updates.pop("event_id")
    response = (
        supabase.table("session_details")
        .update(row_updates)
        .eq("event_id", session_id)
        .select("*")
        .execute()
    )
    return _from_session_row(response.data[0]) if response.data else None


def update_session_status(session_id: int, status: str):
    response = (
        supabase.table("session_details")
        .update({"status": status})
        .eq("event_id", session_id)
        .select("*")
        .execute()
    )
    return _from_session_row(response.data[0]) if response.data else None

######################################## CALENDAR ENDPOINTS ########################################

def fetch_calendar_invitees(school_id: int):
    users_response = (
        supabase.table("users")
        .select("public_id, first_name, last_name, role")
        .eq("school", school_id)
        .order("first_name")
        .execute()
    )
    students_response = (
        supabase.table("students")
        .select("id, first_name, last_name, grade_level")
        .eq("school", school_id)
        .order("first_name")
        .execute()
    )
    return {
        "users": users_response.data,
        "students": students_response.data,
    }


def fetch_calendar_events(
    school_id: int,
    range_start: str,
    range_end: str,
    user_public_id: str,
):
    single_events_response = (
        supabase.table("calendar_events")
        .select("*")
        .eq("school", school_id)
        .is_("recurrence_id", "null")
        .lt("starts_at", range_end)
        .gt("ends_at", range_start)
        .order("starts_at")
        .execute()
    )
    recurring_events_response = (
        supabase.table("calendar_events")
        .select("*")
        .eq("school", school_id)
        .not_.is_("recurrence_id", "null")
        .lt("starts_at", range_end)
        .order("starts_at")
        .execute()
    )
    requested_start = datetime.fromisoformat(range_start)
    requested_end = datetime.fromisoformat(range_end)
    events = [*single_events_response.data, *recurring_events_response.data]
    if not events:
        return []

    event_ids = [event["id"] for event in events]
    participants_response = (
        supabase.table("event_participants")
        .select("event_id, user_id, student_id, attendance")
        .in_("event_id", event_ids)
        .execute()
    )
    participant_rows = participants_response.data
    attending_event_ids = {
        row["event_id"]
        for row in participant_rows
        if str(row.get("user_id")) == str(user_public_id)
    }
    events = [
        event
        for event in events
        if str(event.get("organizer")) == str(user_public_id)
        or event["id"] in attending_event_ids
    ]
    if not events:
        return []

    event_ids = [event["id"] for event in events]
    relevant_event_ids = set(event_ids)
    participant_rows = [
        row for row in participant_rows if row["event_id"] in relevant_event_ids
    ]
    user_ids = list({
        str(row["user_id"])
        for row in participant_rows
        if row.get("user_id")
    } | {
        str(event["organizer"])
        for event in events
        if event.get("organizer")
    })
    student_ids = list({
        row["student_id"]
        for row in participant_rows
        if row.get("student_id") is not None
    } | {
        event["regarding_student"]
        for event in events
        if event.get("regarding_student") is not None
    })
    users_response = (
        supabase.table("users")
        .select("public_id, first_name, last_name")
        .eq("school", school_id)
        .in_("public_id", user_ids)
        .execute()
    ) if user_ids else None
    students_response = (
        supabase.table("students")
        .select("id, first_name, last_name")
        .eq("school", school_id)
        .in_("id", student_ids)
        .execute()
    ) if student_ids else None
    user_names = {
        str(user["public_id"]): " ".join(
            part for part in (user.get("first_name"), user.get("last_name")) if part
        )
        for user in (users_response.data if users_response else [])
    }
    student_names = {
        student["id"]: " ".join(
            part for part in (student.get("first_name"), student.get("last_name")) if part
        )
        for student in (students_response.data if students_response else [])
    }
    recurrence_ids = list({
        event["recurrence_id"]
        for event in events
        if event.get("recurrence_id") is not None
    })
    recurrences_response = (
        supabase.table("event_recurrence")
        .select("id, weekdays, every_n_weeks, ends_on")
        .in_("id", recurrence_ids)
        .execute()
    ) if recurrence_ids else None
    recurrences = {
        recurrence["id"]: recurrence
        for recurrence in (recurrences_response.data if recurrences_response else [])
    }

    participants_by_event = {}
    for participant in participant_rows:
        user_id = participant.get("user_id")
        student_id = participant.get("student_id")
        name = user_names.get(str(user_id)) if user_id else student_names.get(student_id)
        if not name:
            continue
        participants_by_event.setdefault(participant["event_id"], []).append({
            "user_id": user_id,
            "student_id": student_id,
            "name": name,
            "attendance": participant.get("attendance"),
        })

    result = []
    for event in events:
        event_record = {
            **event,
            "participants": participants_by_event.get(event["id"], []),
            "organizer_name": user_names.get(str(event.get("organizer"))),
            "regarding_student_name": student_names.get(event.get("regarding_student")),
            "recurrence": recurrences.get(event.get("recurrence_id")),
        }
        recurrence = event_record["recurrence"]
        if recurrence is None:
            result.append(event_record)
            continue

        starts_at = datetime.fromisoformat(event["starts_at"])
        ends_at = datetime.fromisoformat(event["ends_at"])
        duration = ends_at - starts_at
        local_range_start = requested_start.astimezone(starts_at.tzinfo).date()
        local_range_end = requested_end.astimezone(starts_at.tzinfo).date()
        first_date = max(starts_at.date(), local_range_start)
        last_date = min(
            local_range_end,
            date.fromisoformat(recurrence["ends_on"]) + timedelta(days=1)
            if recurrence.get("ends_on")
            else local_range_end,
        )
        weekdays = set(recurrence.get("weekdays") or [])
        every_n_weeks = max(1, recurrence.get("every_n_weeks") or 1)
        first_week = starts_at.date() - timedelta(days=starts_at.weekday())
        occurrence_date = first_date
        while occurrence_date < last_date:
            week_number = (occurrence_date - first_week).days // 7
            if (
                occurrence_date.weekday() in weekdays
                and week_number >= 0
                and week_number % every_n_weeks == 0
            ):
                occurrence_start = datetime.combine(
                    occurrence_date,
                    starts_at.timetz().replace(tzinfo=None),
                    tzinfo=starts_at.tzinfo,
                )
                occurrence_end = occurrence_start + duration
                if occurrence_end > requested_start:
                    result.append({
                        **event_record,
                        "starts_at": occurrence_start.isoformat(),
                        "ends_at": occurrence_end.isoformat(),
                    })
            occurrence_date += timedelta(days=1)

    return sorted(result, key=lambda event: event["starts_at"])


def create_calendar_event(event_data: dict):
    response = (
        supabase.table("calendar_events")
        .insert(event_data)
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None


def create_calendar_recurrence(recurrence_data: dict):
    response = (
        supabase.table("event_recurrence")
        .insert(recurrence_data)
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None


def delete_calendar_recurrence(recurrence_id: int):
    response = (
        supabase.table("event_recurrence")
        .delete()
        .eq("id", recurrence_id)
        .select("id")
        .execute()
    )
    return bool(response.data)


def fetch_calendar_recurrence(recurrence_id: int):
    response = (
        supabase.table("event_recurrence")
        .select("*")
        .eq("id", recurrence_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def update_calendar_recurrence(recurrence_id: int, updates: dict):
    response = (
        supabase.table("event_recurrence")
        .update(updates)
        .eq("id", recurrence_id)
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None


def create_calendar_event_participants(participants: list[dict]):
    if not participants:
        return []
    response = (
        supabase.table("event_participants")
        .insert(participants)
        .select("event_id, user_id, student_id, attendance")
        .execute()
    )
    return response.data


def fetch_calendar_event_participants(event_id: int):
    response = (
        supabase.table("event_participants")
        .select("event_id, user_id, student_id, attendance")
        .eq("event_id", event_id)
        .execute()
    )
    return response.data


def delete_calendar_event_participants(event_id: int):
    response = (
        supabase.table("event_participants")
        .delete()
        .eq("event_id", event_id)
        .select("event_id")
        .execute()
    )
    return len(response.data)


def fetch_calendar_event_by_id(event_id: int):
    response = (
        supabase.table("calendar_events")
        .select("*")
        .eq("id", event_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def fetch_calendar_event(public_id: str):
    response = (
        supabase.table("calendar_events")
        .select("*")
        .eq("public_id", public_id)
        .limit(1)
        .execute()
    )
    return response.data[0] if response.data else None


def update_calendar_event(
    public_id: str,
    school_id: int,
    updates: dict,
    organizer_id: str | None = None,
):
    query = (
        supabase.table("calendar_events")
        .update(updates)
        .eq("public_id", public_id)
        .eq("school", school_id)
    )
    if organizer_id is not None:
        query = query.eq("organizer", organizer_id)
    response = query.select("*").execute()
    return response.data[0] if response.data else None


def delete_calendar_event(
    public_id: str,
    school_id: int,
    organizer_id: str | None = None,
):
    query = (
        supabase.table("calendar_events")
        .delete()
        .eq("public_id", public_id)
        .eq("school", school_id)
    )
    if organizer_id is not None:
        query = query.eq("organizer", organizer_id)
    response = query.select("public_id").execute()
    return bool(response.data)



################################ GROUPS FUNCTIONS #####################################

def fetch_groups(school_id: int | None = None):
    query = supabase.table("session_groups").select("*")
    if school_id is not None:
        query = query.eq("school", school_id)
    response = query.execute()
    return response.data

def fetch_group_student_ids(group_ids: list[int]) -> dict[int, list[int]]:
    if not group_ids:
        return {}
    response = (
        supabase.table("session_group_members")
        .select("group_id, student_id")
        .in_("group_id", group_ids)
        .execute()
    )
    student_ids_by_group: dict[int, list[int]] = {
        group_id: [] for group_id in group_ids
    }
    for membership in response.data:
        student_ids_by_group.setdefault(membership["group_id"], []).append(
            membership["student_id"]
        )
    return student_ids_by_group

def create_groups(
    school_id: int,
    name: str,
    purpose: str,
    interventionist_id: str | None = None,
):
    group_data = {
        "school": school_id,
        "name": name,
        "purpose": purpose,
        "interventionist": interventionist_id,
    }
    response = (
        supabase.table("session_groups")
        .insert(group_data)
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None

def add_students_to_group( group_id: int, student_ids: list[int], added_by: str | None = None):
    if not student_ids:
        return []
    response = (
        supabase.table("session_group_members")
        .insert([{"group_id": group_id, "student_id": student_id, "added_by": added_by} for student_id in student_ids])
        .select("*")
        .execute()
    )
    return response.data if response.data else None

def replace_group_students(
    group_id: int,
    student_ids: list[int],
    added_by: str | None = None,
):
    existing_ids = fetch_group_student_ids([group_id]).get(group_id, [])
    existing_set = set(existing_ids)
    desired_set = set(student_ids)

    added_ids = desired_set - existing_set
    if added_ids:
        if not add_students_to_group(group_id, sorted(added_ids), added_by):
            raise RuntimeError("Unable to add students to the group.")

    removed_ids = existing_set - desired_set
    if removed_ids:
        (
            supabase.table("session_group_members")
            .delete()
            .eq("group_id", group_id)
            .in_("student_id", list(removed_ids))
            .execute()
        )

    return student_ids

def edit_group(group_id: int, school_id: int, updates: dict):
    response = (
        supabase.table("session_groups")
        .update(updates)
        .eq("id", group_id)
        .eq("school", school_id)
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None

def delete_group(group_id: int, school_id: int) -> bool:
    group = (
        supabase.table("session_groups")
        .select("id")
        .eq("id", group_id)
        .eq("school", school_id)
        .limit(1)
        .execute()
    )
    if not group.data:
        return False

    (
        supabase.table("calendar_events")
        .update({"session_group_id": None})
        .eq("session_group_id", group_id)
        .eq("school", school_id)
        .execute()
    )
    (
        supabase.table("session_group_members")
        .delete()
        .eq("group_id", group_id)
        .execute()
    )
    response = (
        supabase.table("session_groups")
        .delete()
        .eq("id", group_id)
        .eq("school", school_id)
        .select("id")
        .execute()
    )
    return bool(response.data)