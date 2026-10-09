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

#fetches all student data from the database.


################################## STUDENT FUNCTIONS ########################################
def fetch_students():
    response = supabase.table("students").select(
        "*, teacher_user:users!students_teacher_fkey(first_name,last_name), "
        "interventionist_user:users!students_interventionist_fkey(first_name,last_name)"
    ).execute()
    grade_response = supabase.table("student_grades").select(
        "id,math,english,social_studies,science,art,p_e"
    ).execute()
    grade_columns = {
        "Math": "math",
        "English": "english",
        "Social Studies": "social_studies",
        "Science": "science",
        "Art": "art",
        "P.E.": "p_e",
    }
    grades_by_student = {
        str(grade["id"]): {
            subject: grade[column]
            for subject, column in grade_columns.items()
            if grade.get(column) is not None
        }
        for grade in grade_response.data
    }

    for student in response.data:
        student["scores"] = grades_by_student.get(str(student["id"]), {})

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

################################# TEACHER FUNCTIONS ########################################
def fetch_teachers():
    response = supabase.table("users").select("*").eq("role", "teacher").execute()
    return response.data



################################ INTERVENTIONIST FUNCTIONS ########################################
def fetch_interventionists():
    response = supabase.table("users").select("*").eq("role", "interventionist").execute()
    return response.data

def fetch_interventionist_students(interventionist_id: str):
    response = supabase.table("students").select("*").eq("interventionist", interventionist_id).execute()
    return response.data


################################ ADMIN FUNCTIONS ########################################
def fetch_admins():
    response = supabase.table("users").select("*").eq("role", "admin").execute()
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


########################### NOTES FUNCTIONS #######################################

def fetch_notes_from_user(public_id):
    response = supabase.table("notes").select("*").eq("created_by", public_id).execute()
    return response.data

def fetch_notes_from_date(timestamp):
    response = supabase.table("notes").select("*").eq("date", timestamp).execute()
    return response.data

def fetch_notes_for_student(user_id, student_id):
    response = (supabase.table("notes").select("*").eq("created_by", user_id).eq("student_id", student_id).order("date", desc=True).execute())
    return response.data

def create_note(student_id, created_by, text):
    response = supabase.table("notes").insert({
        "student_id": student_id,
        "created_by": created_by,
        "text": text,
    }).execute()
    return response.data[0] if response.data else None

def edit_text(note_id, new_text):
    response = supabase.table("notes").update({"text": new_text}).eq("id", note_id).execute()
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
