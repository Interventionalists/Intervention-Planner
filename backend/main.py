from fastapi import FastAPI
from routes.students import router

app = FastAPI()
app.include_router(router)