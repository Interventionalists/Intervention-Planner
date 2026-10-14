from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database.supabase_client import (
    fetch_user_by_email,
    hash_password,
    record_login_attempt,
    update_user_password,
    verify_password,
)

router = APIRouter()

MIN_PASSWORD_LENGTH = 8
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

LOCKED_DETAIL = f"Account locked due to too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes."


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    email: str
    current_password: str
    new_password: str


#allowlist of user fields returned to the client. FastAPI drops anything not
#declared here (password_hash, lockout columns, ...).
class UserOut(BaseModel):
    id: int
    public_id: str | None = None
    email: str
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    school: int | None = None  # school_id from the schools table


def is_locked(locked_until) -> bool:
    if not locked_until:
        return False
    return datetime.fromisoformat(locked_until) > datetime.now(timezone.utc)


#verifies email/password with lockout enforcement and returns the full user
#row on success. Raises 401 for bad credentials and 423 while locked. A locked
#account is rejected even with the correct password, and attempts made while
#locked are not counted, so the lock isn't extended by repeated tries.
def authenticate(email: str, password: str):
    try:
        user = fetch_user_by_email(email)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if is_locked(user.get("locked_until")):
        raise HTTPException(status_code=423, detail=LOCKED_DETAIL)

    password_ok = bool(user.get("password_hash")) and verify_password(password, user["password_hash"])

    try:
        if not password_ok:
            result = record_login_attempt(user["id"], False, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES)
            if result and is_locked(result.get("locked_until")):
                raise HTTPException(status_code=423, detail=LOCKED_DETAIL)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        #only touch the row on success if there's something to reset
        if user.get("failed_login_attempts") or user.get("locked_until"):
            record_login_attempt(user["id"], True, MAX_LOGIN_ATTEMPTS, LOCKOUT_MINUTES)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return user


#verifies email/password against the users table and returns the allowlisted
#user fields on success. Plaintext password arrives over HTTPS and is only
#ever compared server-side, never hashed or stored client-side.
@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest):
    return authenticate(payload.email, payload.password)


#changes a user's password. Since there are no session tokens yet, the
#current password is re-verified (with lockout) before the new hash is written.
@router.post("/change-password")
def change_password(payload: ChangePasswordRequest):
    if len(payload.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"New password must be at least {MIN_PASSWORD_LENGTH} characters",
        )
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="New password must differ from current password")

    authenticate(payload.email, payload.current_password)

    try:
        updated = update_user_password(payload.email, hash_password(payload.new_password))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not updated:
        raise HTTPException(status_code=500, detail="Password update failed")

    return {"message": "Password updated successfully"}
