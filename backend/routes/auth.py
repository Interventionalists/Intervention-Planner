from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database.supabase_client import (
    fetch_user_by_email,
    hash_password,
    update_user_password,
    verify_password,
)

router = APIRouter()

MIN_PASSWORD_LENGTH = 8


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    email: str
    current_password: str
    new_password: str


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


#changes a user's password. Since there are no session tokens yet, the
#current password is re-verified before the new hash is written.
@router.post("/change-password")
def change_password(payload: ChangePasswordRequest):
    if len(payload.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"New password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")

    try:
        user = fetch_user_by_email(payload.email)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not user or not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    try:
        updated = update_user_password(payload.email, hash_password(payload.new_password))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not updated:
        raise HTTPException(status_code=500, detail="Password update failed")

    return {"message": "Password updated successfully"}
