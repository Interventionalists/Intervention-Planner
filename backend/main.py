from fastapi import FastAPI
from routes.students import router as students_router
from routes.teachers import router as teachers_router
from routes.interventionists import router as interventionists_router
from routes.admins import router as admins_router

app = FastAPI()
app.include_router(students_router)
app.include_router(teachers_router)
app.include_router(interventionists_router)
app.include_router(admins_router)