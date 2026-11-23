import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database.supabase_client import (
    fetch_student_ownership,
    fetch_user_school_by_public_id,
)

load_dotenv()

#signing key for session tokens. Required: the app refuses to start without it
#so tokens can never be signed with a missing or default secret.
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 8

bearer_scheme = HTTPBearer(auto_error=False)

UNAUTHORIZED = HTTPException(
    status_code=401,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


#signs a short-lived token for a user row that has already passed authenticate().
#school is deliberately left out since it can change mid-session; routes look
#it up from the database instead.
def create_access_token(user: dict) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["public_id"]),
        "uid": user["id"],
        "role": user.get("role"),
        "ro": bool(user.get("read_only")),
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


#dependency for protected routes: validates the Bearer token and returns the
#caller's identity. Raises 401 for a missing, expired, or tampered token.
def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise UNAUTHORIZED
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub", "uid"]},
        )
    except jwt.PyJWTError:
        raise UNAUTHORIZED
    return {
        "id": payload["uid"],
        "public_id": payload["sub"],
        "role": payload.get("role"),
        "read_only": bool(payload.get("ro")),
    }


READ_ONLY_DETAIL = "This account is read-only"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


#router-level guard for demo accounts (users.read_only = true): they can view
#everything their role allows but every write request is rejected.
def block_writes_if_read_only(
    request: Request, user: dict = Depends(get_current_user)
) -> None:
    if user["read_only"] and request.method not in SAFE_METHODS:
        raise HTTPException(status_code=403, detail=READ_ONLY_DETAIL)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


#blocks callers from acting on another user's id (IDOR). Admins may act on anyone.
def require_self_or_admin(user: dict, public_id) -> None:
    if user["role"] != "admin" and user["public_id"] != str(public_id):
        raise HTTPException(status_code=403, detail="Not allowed")


#which students column marks each role as responsible for a student
OWNER_COLUMN_BY_ROLE = {"teacher": "teacher", "interventionist": "interventionist"}


#Admins can view any student. Interventionists can reach only
#students marked as needing interventions in their school. Teachers can reach
#only students assigned to them. Raises 404 rather than 403 when a student is
#not accessible so student IDs cannot be probed.
def require_student_access(user: dict, student_id) -> None:
    ownership = fetch_student_ownership(student_id)
    if ownership is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if user["role"] == "admin":
        return
    if (
        user["role"] == "interventionist"
        and ownership.get("needs_interventions") is not True
    ):
        raise HTTPException(status_code=404, detail="Student not found")
    owner_column = OWNER_COLUMN_BY_ROLE.get(user["role"])
    if owner_column is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if str(ownership.get(owner_column)) == str(user["public_id"]):
        return
    if user["role"] == "interventionist":
        user_school = fetch_user_school_by_public_id(user["public_id"])
        student_school = ownership.get("school")
        if user_school is not None and str(user_school) == str(student_school):
            return
    raise HTTPException(status_code=404, detail="Student not found")
