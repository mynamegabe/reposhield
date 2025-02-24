from fastapi import APIRouter, Depends, HTTPException, Response
import schemas
import requests
from typing import Annotated
from sqlmodel import select
from datetime import timedelta
from uuid import uuid4
from utils.common import create_access_token, get_current_user, Token, hash_password
from db import Session, get_session, User, Calender, CalendarEvent
from schemas import UserCreate
from config import ACCESS_TOKEN_EXPIRE_MINUTES, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI


from google.oauth2 import id_token

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    # dependencies=[Depends(get_token_header)],
    responses={404: {"description": "Not found"}},
)

# async def init_calender(user_id: str, session: SessionDep):
#     default_calendar = Calender(
#         user_id=user_id,
#         title="Personal",
#         description="Personal Calendar",
        
#     )
#     session.add(default_calendar)
#     session.commit()
#     session.refresh(default_calendar)


@router.post("/google")
async def login_google(response: Response, oauth_data: schemas.OAuthLogicSchema, session: SessionDep):    
    res = requests.get(
        f"https://www.googleapis.com/oauth2/v1/userinfo?access_token={oauth_data.access_token}", 
        headers={
            "Authorization": f"Bearer {oauth_data.access_token}", 
            "Accept": "application/json"
        }
    )
    idinfo = res.json()

    ## Get user information 
    user_info = schemas.GoogleUserInfo(
        email = idinfo["email"],
        first_name = idinfo.get("given_name", ""),
        last_name = idinfo.get("family_name", ""),
        picture=idinfo.get("picture")
    )
    ## Query database for user 
    user = session.exec(select(User).where(User.email == user_info.email)).first()
    is_new_user = False
    if not user:
        is_new_user = True
        user = User(
                id=str(uuid4()),
                email=user_info.email,
                first_name=user_info.first_name,
                last_name=user_info.last_name,
                password="",  # OAuth users don't need password
                role="user" ,
                picture=user_info.picture
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        
        default_calendar = Calender(
            calendar_id=str(uuid4()),
            user_id=user.id,
            title="Personal",
            description="Personal Calendar",
        )
        session.add(default_calendar)
        session.commit()
        session.refresh(default_calendar)
        # await init_calender(user.id, session)
        print("Default calendar created")
        
    
        
    # Generate JWT Token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.id,
              "email": user.email,
              "role": user.role,
              "new_user" : is_new_user # Add this flag to check if new user or not
            },
        expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")
                

@router.post("/register", tags=["auth"])
async def register_user(user: schemas.UserCreate, session: SessionDep):
    ## Check if user exists
    db_user = session.exec(select(User).where(User.email == user.email)).first()
    if db_user: 
        raise HTTPException(statu_code=400, detail="Email already registered")
    ## Create new user and login 
    hashed_password = hash_password(user.password)
    db_user = User(
            id=str(uuid4()),
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            password=hashed_password,
            role="user"
    )
    session.add(db_user)
    session.commit()
    session.refresh(user)
    default_calendar = Calender(
        calendar_id=str(uuid4()),
        user_id=user.id,
        title="Personal",
        description="Personal Calendar",
    )
    session.add(default_calendar)
    session.commit()
    session.refresh(default_calendar)

    return {"status": "Registration successful!"}


@router.post("/login", tags=["auth"])
async def login_user(user: schemas.UserCreate, session: SessionDep):
    ## Check if user exists
    db_user = session.exec(select(User).filter_by(email=user.email, password=hash_password(user.password)))
    if db_user:
        # Generate JWT Token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": db_user.id,
                  "email": db_user.email,
                  "role": db_user.role
                },
            expires_delta=access_token_expires
        )
        return Token(access_token=access_token, token_type="bearer")
    else:
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    
# @router.post("/reset_password", tags=["auth"])
# async def reset_password(user: schemas.ForgetPassword, session: SessionDep):
#     # Check if user exists
#     user = session.exec(select(User).where(User.email == user.email)).first()
#     if not user:
#         raise HTTPException(
#             status_code=404,
#             detail="User with this email does not exist"
#         )
#     # Generate Reset Token
#     reset_token = create_access_token(
#         data={"sub":user.id, "type":"reset"},
#         expires_delta=timedelta(minutes=15)
#     )
    