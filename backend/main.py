import os
from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.students import router as students_router
from routes.teachers import router as teachers_router
from routes.interventionists import router as interventionists_router
from routes.admins import router as admins_router
from routes.auth import router as auth_router
from routes.notes import router as notes_router
from routes.schools import router as schools_router
from routes.health import router as health_router
from routes.system_health import router as system_health_router
from auth.security import get_current_user, require_admin

load_dotenv()

app = FastAPI()

#comma-separated list of allowed frontend origins, e.g.
#"http://localhost:5173,https://lucasbranch.pages.dev"
cors_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#auth is applied here, per router, so a new endpoint can't forget it.
#/login, /change-password and /health stay public; admin routes need the admin role.
protected = [Depends(get_current_user)]

app.include_router(auth_router)
app.include_router(health_router)
app.include_router(students_router, dependencies=protected)
app.include_router(teachers_router, dependencies=protected)
app.include_router(interventionists_router, dependencies=protected)
app.include_router(notes_router, dependencies=protected)
app.include_router(schools_router, dependencies=protected)
app.include_router(admins_router, dependencies=[Depends(require_admin)])
app.include_router(system_health_router, dependencies=[Depends(require_admin)])
