from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.security import get_current_user
from database.supabase_client import (
    create_todo,
    delete_todo,
    fetch_todos_for_user,
    update_todo,
)

router = APIRouter()

#mirrors the public.status_types enum in the database
TodoStatus = Literal["incomplete", "done", "late"]

MAX_DESCRIPTION_LENGTH = 2000


class TodoCreate(BaseModel):
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)
    due_date: datetime | None = None
    status: TodoStatus = "incomplete"


#every field is optional; only the ones actually sent are written, so
#{"due_date": null} clears the due date while omitting it leaves it alone.
class TodoUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=MAX_DESCRIPTION_LENGTH)
    due_date: datetime | None = None
    status: TodoStatus | None = None


#todos are always read and written for the signed-in user only; the user id
#comes from the token, never from the request, so nobody can touch another's.
@router.get("/todos")
def list_todos(status: TodoStatus | None = None, user: dict = Depends(get_current_user)):
    try:
        todos = fetch_todos_for_user(user["id"], status)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    return {"todos": todos}


@router.post("/todos", status_code=201)
def add_todo(payload: TodoCreate, user: dict = Depends(get_current_user)):
    try:
        todo = create_todo(
            user["id"],
            payload.description,
            payload.due_date.isoformat() if payload.due_date else None,
            payload.status,
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if not todo:
        raise HTTPException(status_code=500, detail="Todo creation failed")
    return {"todo": todo}


@router.patch("/todos/{todo_id}")
def edit_todo(todo_id: int, payload: TodoUpdate, user: dict = Depends(get_current_user)):
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "status" in fields and fields["status"] is None:
        raise HTTPException(status_code=400, detail="Status cannot be null")
    if fields.get("due_date") is not None:
        fields["due_date"] = fields["due_date"].isoformat()

    try:
        todo = update_todo(todo_id, user["id"], fields)
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"todo": todo}


@router.delete("/todos/{todo_id}")
def remove_todo(todo_id: int, user: dict = Depends(get_current_user)):
    try:
        deleted = delete_todo(todo_id, user["id"])
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"deleted": True}
