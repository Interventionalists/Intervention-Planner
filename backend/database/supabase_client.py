import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)

#fetches all student data from the database.
def fetch_student():
    response = supabase.table("students").select("*").execute()
    return response.data

