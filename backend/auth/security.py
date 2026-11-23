import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database.supabase_client import (
    fetch_student_ownership,
    fetch_user_auth,
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
#role, read_only and school are read from the database on every request rather
#than trusted from the token, so a demotion or a switch to read-only takes
#effect immediately instead of when the token expires. FastAPI caches this per
#request, so it is one lookup no matter how many dependencies use it.
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
    try:
        account = fetch_user_auth(payload["uid"])
    except Exception as error:
        raise HTTPException(status_code=503, detail="Unable to verify session") from error
    #a deleted account, or a token whose uid and public_id no longer match
    if account is None or str(account.get("public_id")) != str(payload["sub"]):
        raise UNAUTHORIZED
    return {
        "id": account["id"],
        "public_id": str(account["public_id"]),
        "role": account.get("role"),
        "read_only": bool(account.get("read_only")),
        "school": account.get("school"),
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


#the caller's school. get_current_user already loads it; the fallback covers
#callers that build the user dict themselves.
def user_school(user: dict):
    if "school" in user:
        return user["school"]
    return fetch_user_school_by_public_id(user["public_id"])


def same_school(user: dict, school) -> bool:
    caller_school = user_school(user)
    return caller_school is not None and school is not None and str(caller_school) == str(school)


#blocks callers from acting on another user's id (IDOR). Admins may act on
#anyone in their own school, never on users in another school.
def require_self_or_admin(user: dict, public_id) -> None:
    if user["public_id"] == str(public_id):
        return
    if user["role"] == "admin" and same_school(
        user, fetch_user_school_by_public_id(str(public_id))
    ):
        return
    raise HTTPException(status_code=403, detail="Not allowed")


#which students column marks each role as responsible for a student
OWNER_COLUMN_BY_ROLE = {"teacher": "teacher", "interventionist": "interventionist"}


#Admins can view any student in their own school. Interventionists can reach
#only students marked as needing interventions in their school. Teachers can
#reach only students assigned to them. Raises 404 rather than 403 when a
#student is not accessible so student IDs cannot be probed.
def require_student_access(user: dict, student_id) -> None:
    ownership = fetch_student_ownership(student_id)
    if ownership is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if user["role"] == "admin":
        if same_school(user, ownership.get("school")):
            return
        raise HTTPException(status_code=404, detail="Student not found")
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
    if user["role"] == "interventionist" and same_school(user, ownership.get("school")):
        return
    raise HTTPException(status_code=404, detail="Student not found")
