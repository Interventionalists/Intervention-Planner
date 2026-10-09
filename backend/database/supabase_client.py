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

#fetches all student data from the database.


################################## STUDENT FUNCTIONS ########################################
def fetch_students():
    response = supabase.table("students").select("*").execute()
    return response.data


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

def fetch_notes_from_user(user_id):
    response = supabase.table("notes").select("*").eq("created_by", user_id).execute()
    return response.data

def fetch_notes_from_date(timestamp):
    response = supabase.table("notes").select("*").eq("date", timestamp).execute()
    return response.data

def fetch_notes_for_student(user_id, student_id):
    response = supabase.table("notes").select("*").eq("created_by", user_id).eq("student_id", student_id).execute()
    return response.data

def edit_text(note_id, new_text):
    response = supabase.table("notes").update({"text": new_text}).eq("id", note_id).execute()
    return response.data
