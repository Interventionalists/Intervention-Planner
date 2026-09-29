import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.students import router as students_router
from routes.teachers import router as teachers_router
from routes.interventionists import router as interventionists_router
from routes.admins import router as admins_router
from routes.auth import router as auth_router

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

app.include_router(students_router)
app.include_router(teachers_router)
app.include_router(interventionists_router)
app.include_router(admins_router)
app.include_router(auth_router)