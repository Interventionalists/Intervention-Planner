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


def _add_assignment_grades(students):
    if not students:
        return students

    student_ids = [student["id"] for student in students]
    assignment_response = (
        supabase.table("student_assignments")
        .select("*")
        .in_("student_id", student_ids)
        .execute()
    )
    grade_totals = {}
    for assignment in assignment_response.data:
        class_name = assignment.get("class") or assignment.get("subject")
        grade_value = assignment.get("grade")
        if not isinstance(class_name, str) or grade_value is None:
            continue

        class_name = class_name.strip()
        if not class_name:
            continue
        try:
            grade = float(grade_value)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(grade):
            continue

        student_grades = grade_totals.setdefault(
            str(assignment["student_id"]), {}
        )
        totals = student_grades.setdefault(class_name, {"total": 0.0, "count": 0})
        totals["total"] += grade
        totals["count"] += 1

    grades_by_student = {
        student_id: {
            class_name: totals["total"] / totals["count"]
            for class_name, totals in classes.items()
        }
        for student_id, classes in grade_totals.items()
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

################################# TEACHER FUNCTIONS ########################################
#columns safe to return for other users; never includes password_hash or
#lockout state.
def fetch_teachers():
    response = supabase.table("users").select(PUBLIC_USER_COLUMNS).eq("role", "teacher").execute()
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

#fetches all assignments for a given student, ordered by created_at descending.
def fetch_assignments_for_student(student_id: int):
    response = (
        supabase.table("student_assignments")
        .select("*")
        .eq("student_id", student_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data

#fetches all assignments for a given student, in a given subject, ordered by created_at descending.
def fetch_assignments_for_student_subject(student_id: int, subject: str):
    response = (
        supabase.table("student_assignments")
        .select("*")
        .eq("student_id", student_id)
        .eq("subject", subject)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data

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
        query = query.eq("subject", subject)
    response = query.order("created_at", desc=True).execute()
    return response.data

#Inserts a new assignment for a student. Expects a dictionary with keys: 
#student_id, class, assignment (name), and grade. Returns the inserted row.
def create_assignment(assignment_data: dict):
    response = supabase.table("student_assignments").insert(assignment_data).select("*").execute()
    return response.data[0] if response.data else None

#Updates an existing assignment. Expects the assignment ID and a dictionary of fields to update. Returns the updated row.
def update_assignment(assignment_id: str, updates: dict):
    response = (
        supabase.table("student_assignments")
        .update(updates)
        .eq("id", assignment_id)
        .select("*")
        .execute()
    )
    return response.data[0] if response.data else None

#fetches a single assignment by ID, or None if it doesn't exist.
def fetch_assignment(assignment_id: str):
    response = supabase.table("student_assignments").select("*").eq("id", assignment_id).limit(1).execute()
    return response.data[0] if response.data else None

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
