import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth.security import create_access_token, get_current_user
from database.supabase_client import (
    fetch_user_by_email,
    hash_password,
    record_login_attempt,
    update_user,
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


class AccountProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: str | None = Field(default=None, min_length=3, max_length=254)
    school: int | None = Field(default=None, ge=1)

    @field_validator("email")
    @classmethod
    def validate_email(cls, email: str | None) -> str | None:
        if email is None:
            return email
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            raise ValueError("Enter a valid email address.")
        return email


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


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


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


#verifies email/password against the users table and returns a session token
#plus the allowlisted user fields on success. Plaintext password arrives over
#HTTPS and is only ever compared server-side, never hashed or stored client-side.
@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    user = authenticate(payload.email, payload.password)
    token = create_access_token(user)
    #response_model filters user down to UserOut, so password_hash never leaves
    return {"access_token": token, "token_type": "bearer", "user": user}


#changes a user's password. Public so it works from the login screen, so the
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


@router.patch("/account/profile")
def update_account_profile(
    payload: AccountProfileUpdateRequest,
    user: dict = Depends(get_current_user),
):
    updates = payload.model_dump(exclude_unset=True)
    profile_fields = {"first_name", "last_name", "email"}
    if user["role"] == "teacher":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Teachers cannot update account details.",
        )
    if user["role"] == "interventionist":
        if set(updates) != {"school"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Interventionists may only update their school.",
            )
    elif user["role"] == "admin":
        if not profile_fields.issubset(updates) or any(
            not updates[field] for field in profile_fields
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Valid name and email values are required to update the profile.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account cannot update account details.",
        )

    try:
        updated_user = update_user(user["id"], updates)
    except Exception as error:
        if getattr(error, "code", None) == "23505":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email address is already in use.",
            ) from error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update your account.",
        ) from error

    if updated_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found.",
        )
    return {"user": updated_user}
