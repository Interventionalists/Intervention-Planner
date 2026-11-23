import logging
import os
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from routes.students import router as students_router
from routes.teachers import router as teachers_router
from routes.interventionists import router as interventionists_router
from routes.admins import router as admins_router
from routes.auth import router as auth_router
from routes.calendar import router as calendar_router
from routes.notes import router as notes_router
from routes.assignments import router as assignments_router
from routes.groups import router as groups_router
from routes.sessions import router as sessions_router
from routes.schools import router as schools_router
from routes.layouts import router as layouts_router
from routes.todos import router as todos_router
from routes.health import router as health_router
from routes.system_health import router as system_health_router
from auth.security import block_writes_if_read_only, get_current_user, require_admin

load_dotenv()

#swagger/redoc/openapi.json are off unless ENABLE_API_DOCS=true (set it in your local .env).
#defaulting to off means a deployed environment never exposes the schema by accident.
docs_enabled = os.environ.get("ENABLE_API_DOCS", "false").strip().lower() in ("1", "true", "yes")

app = FastAPI(
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

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

#routes wrap failures as HTTPException(500) from the original error, which
#otherwise never reaches the server logs. Log the underlying traceback for any
#5xx, then fall back to FastAPI's normal response.
logger = logging.getLogger("intervention_planner")


GENERIC_SERVER_ERROR = "Something went wrong on our end. Please try again."


@app.exception_handler(StarletteHTTPException)
async def log_server_errors(request: Request, exc: StarletteHTTPException):
    if exc.status_code >= 500:
        underlying = exc.__cause__ or exc.__context__
        cause = underlying or exc
        logger.error(
            "%s %s -> %s",
            request.method,
            request.url.path,
            exc.status_code,
            exc_info=(type(cause), cause, cause.__traceback__),
        )
        #a 5xx raised while handling another exception usually carries that
        #exception's text (database/table/column names). It is logged above;
        #the client only gets a generic message. Deliberate 5xx messages raised
        #outside an except block are passed through unchanged.
        if underlying is not None and not isinstance(underlying, StarletteHTTPException):
            exc = StarletteHTTPException(
                status_code=exc.status_code,
                detail=GENERIC_SERVER_ERROR,
                headers=exc.headers,
            )
    return await http_exception_handler(request, exc)


#auth is applied here, per router, so a new endpoint can't forget it.
#/login, /change-password and /health stay public; admin routes need the admin role.
#read-only (demo) accounts are blocked from every non-GET request on these routers.
protected = [Depends(get_current_user), Depends(block_writes_if_read_only)]

app.include_router(auth_router)
app.include_router(health_router)
app.include_router(students_router, dependencies=protected)
app.include_router(teachers_router, dependencies=protected)
app.include_router(interventionists_router, dependencies=protected)
app.include_router(calendar_router, dependencies=protected)
app.include_router(notes_router, dependencies=protected)
app.include_router(assignments_router, dependencies=protected)
app.include_router(groups_router, dependencies=protected)
app.include_router(sessions_router, dependencies=protected)
app.include_router(schools_router, dependencies=protected)
app.include_router(layouts_router, dependencies=protected)
app.include_router(todos_router, dependencies=protected)
app.include_router(admins_router, dependencies=[Depends(require_admin), Depends(block_writes_if_read_only)])
app.include_router(system_health_router, dependencies=[Depends(require_admin), Depends(block_writes_if_read_only)])
