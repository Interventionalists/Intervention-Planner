from uuid import UUID
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from database.supabase_client import create_student, fetch_student_name, fetch_students
from fastapi import APIRouter, HTTPException
from database.supabase_client import fetch_students

router = APIRouter()


class StudentCreateRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    grade_level: int | None = Field(default=None, ge=-32768, le=32767)
    teacher: UUID | None = None
    interventionist: UUID | None = None
    school: int | None = Field(default=None, ge=1, le=9223372036854775807)
    profile_api_link: str | None = None


#fetch all students from the database
@router.get("/students-fetch")
def get_students():
    try:
        students = fetch_students()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"students": students}

@router.get("/students-fetchName/{student_id}")
def get_student_name(student_id: str):
    try:
        student_name = fetch_student_name(student_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"student_name": student_name}

#insert a new student into the database
@router.post("/students-insert", status_code=status.HTTP_201_CREATED)
def insert_student(payload: StudentCreateRequest):
    try:
        student = create_student(**payload.model_dump(mode="json", exclude_none=True))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to create student: {e}",
        ) from e
    return {"student": student}