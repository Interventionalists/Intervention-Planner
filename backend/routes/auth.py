import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth.security import READ_ONLY_DETAIL, create_access_token, get_current_user
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
    #no school field: extra="forbid" rejects it. A school is a tenant boundary
    #and only an admin of that school may assign it (PATCH /admins-users).

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


#a real bcrypt hash at the same cost as stored passwords, compared against for
#unknown emails so they take as long as known ones
DUMMY_PASSWORD_HASH = hash_password("timing-equalizer-not-a-real-password")


#bcrypt 5 raises ValueError for passwords over 72 bytes; treat that as a
#mismatch (401) rather than letting it surface as a 500
def _password_matches(password: str, password_hash: str) -> bool:
    try:
        return verify_password(password, password_hash)
    except ValueError:
        return False


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
        raise HTTPException(status_code=500, detail="Unable to sign in.") from e

    if not user:
        #spend the same bcrypt time as a real account so response timing
        #doesn't reveal which emails are registered
        _password_matches(password, DUMMY_PASSWORD_HASH)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if is_locked(user.get("locked_until")):
        raise HTTPException(status_code=423, detail=LOCKED_DETAIL)

    stored_hash = user.get("password_hash")
    #accounts without a password still pay the bcrypt cost, then always fail
    password_ok = _password_matches(password, stored_hash or DUMMY_PASSWORD_HASH) and bool(stored_hash)

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
        raise HTTPException(status_code=500, detail="Unable to sign in.") from e

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

    account = authenticate(payload.email, payload.current_password)
    if account.get("read_only"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=READ_ONLY_DETAIL)

    try:
        updated = update_user_password(payload.email, hash_password(payload.new_password))
    except ValueError as e:
        #bcrypt 5 rejects passwords over 72 bytes
        raise HTTPException(status_code=400, detail="New password is too long") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Password update failed") from e

    if not updated:
        raise HTTPException(status_code=500, detail="Password update failed")

    return {"message": "Password updated successfully"}


@router.patch("/account/profile")
def update_account_profile(
    payload: AccountProfileUpdateRequest,
    user: dict = Depends(get_current_user),
):
    if user.get("read_only"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=READ_ONLY_DETAIL)
    updates = payload.model_dump(exclude_unset=True)
    profile_fields = {"first_name", "last_name", "email"}
    if user["role"] in ("teacher", "interventionist"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Ask an administrator to update your account details.",
        )
    if user["role"] == "admin":
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
