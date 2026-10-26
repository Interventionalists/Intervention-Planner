import os
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database.supabase_client import fetch_student_ownership

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
    return {"id": payload["uid"], "public_id": payload["sub"], "role": payload.get("role")}


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


#admins can view any student. Teachers and interventionists can only reach
#students assigned to them. Raises 404 rather than 403 for someone else's
#student so student ids can't be probed.
def require_student_access(user: dict, student_id) -> None:
    ownership = fetch_student_ownership(student_id)
    if ownership is None:
        raise HTTPException(status_code=404, detail="Student not found")
    if user["role"] == "admin":
        return
    owner_column = OWNER_COLUMN_BY_ROLE.get(user["role"])
    if owner_column is None or str(ownership.get(owner_column)) != str(user["public_id"]):
        raise HTTPException(status_code=404, detail="Student not found")
