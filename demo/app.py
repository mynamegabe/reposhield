from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Form,
    File,
    UploadFile,
    Request,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import select
from typing import Annotated, Optional, List
# from routers import users, auth, events, calendar, quiz
from routers import files, vulnerabilities
from utils.common import hash_password, random_string
from db import Session, get_session, User, create_db_and_tables
from utils.common import get_current_active_user
from config import *
from werkzeug.utils import secure_filename
import uvicorn
import requests
from datetime import datetime

SessionDep = Annotated[Session, Depends(get_session)]

app = FastAPI()

origins = [
    "https://nextcal.gabrielseet.com",
    "http://localhost:5173",
    "http://localhost:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# app.include_router(users.router)
app.include_router(files.router)
app.include_router(vulnerabilities.router)
# app.include_router(auth.router)
# app.include_router(events.router)
# app.include_router(calendar.router)
# app.include_router(quiz.router)


# @app.on_event("startup")
# def on_startup():
#     create_db_and_tables()

#     org_id = random_string(32)

#     session = next(get_session())

#     # create test user
#     if not session.exec(select(User).where(User.email == "johndoe@nextcal.org")).first():
#         uid = random_string(32)
#         user = User(
#             id=uid,
#             first_name="John",
#             last_name="Doe",
#             email="johndoe@nextcal.org",
#             password=hash_password("password"),
#             org_id=org_id
#         )
#         session.add(user)
#         session.commit()
#     session.close()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/test")
def read_root():
    return {"Hello": "World"}


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
