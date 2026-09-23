import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)

#fetches all student data from the database.
def fetch_students():
    response = supabase.table("students").select("*").execute()
    return response.data

def fetch_teachers():
    response = supabase.table("users").select("*").eq("role", "teacher").execute()
    return response.data

def fetch_interventionists():
    response = supabase.table("users").select("*").eq("role", "interventionist").execute()
    return response.data

def fetch_admins():
    response = supabase.table("users").select("*").eq("role", "admin").execute()
    return response.data

def create_user(email :str, password:str, first_name: str, last_name: str, role:str):
    response = supabase.table("users").insert({"email": email, "password": password, "first_name": first_name, "last_name": last_name, "role": role}).execute()
    return response.data