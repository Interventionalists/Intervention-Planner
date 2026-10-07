from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database.supabase_client import fetch_user_by_email, verify_password

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


#verifies email/password against the users table and returns the user
#(minus password_hash) on success. Plaintext password arrives over HTTPS
#and is only ever compared server-side, never hashed or stored client-side.
@router.post("/login")
def login(payload: LoginRequest):
    try:
        user = fetch_user_by_email(payload.email)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return {key: value for key, value in user.items() if key != "password_hash"}
