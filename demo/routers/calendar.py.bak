from fastapi import APIRouter, Depends, HTTPException
import schemas
from typing import Annotated, Optional
from sqlmodel import select
from datetime import timedelta
from uuid import uuid4
import asyncio

from utils.common import create_access_token, get_current_active_user, Token, hash_password
from db import Session, get_session, User, Calender
import schemas
from config import GEMINI_API_KEY
from modules.recommender import GeminiActivityRecommender
from modules.personality import load_profile_from_json

from google.oauth2 import id_token
from google.auth.transport import requests

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter(
    prefix="/calendars",
    tags=["calendars"],
    # dependencies=[Depends(get_token_header)],
    responses={404: {"description": "Not found"}},
)

@router.get("/")
async def get_calendars(session: SessionDep, current_user: User = Depends(get_current_active_user)):
    try:
        if current_user is None:
            return {"status": "Unsuccessful"}
        calendars = session.exec(
            select(Calender)
            .where(Calender.user_id == current_user.id)
        ).all()
        ## More Filtering later -> now it returns all calendar objects in the table
        return {"status": "Success", "calendars": calendars}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{calender_id}")
async def get_calendar(calender_id: str, session: SessionDep, current_user: User = Depends(get_current_active_user)):
    try:
        if current_user is None:
            return {"status": "Unsuccessful"}
        calendars = session.exec(
            select(Calender)
            .where(Calender.user_id == current_user.id)
            .where(Calender.calendar_id == calender_id)
        ).first()
        if calendars is None:
            return {"status": "Unsuccessful"}
        ## More Filtering later -> now it returns all calendar objects in the table
        return {"status": "Success", "calendars": calendars}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{calendar_id}")
async def delete_calendar(calendar_id: str, session: SessionDep, current_user: User = Depends(get_current_active_user)):
    try:
        if current_user is None:
            return {"status": "Unsuccessful"}
        calendar = session.exec(
            select(Calender)
            .where(Calender.user_id == current_user.id)
            .where(Calender.calendar_id == calendar_id)
        ).first()

        if not calendar:
            raise HTTPException(status_code=404, detail="Calendar not found or not authorized to delete")
        
        session.delete(calendar)
        session.commit()
        ## More Filtering later -> now it returns all calendar objects in the table
        return {"status": "Success", "calendar": calendar}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_calendar(calendar: schemas.CalendarCreate, session: SessionDep, current_user: User = Depends(get_current_active_user)):
    try:
        if current_user is None:
            return {"status": "Unsuccessful"}
        db_calendar = Calender(
                calendar_id=str(uuid4()),
                user_id=current_user.id,
                color=calendar.color,
                title=calendar.title,
                description=calendar.description
        )
        session.add(db_calendar)
        session.commit()
        session.refresh(db_calendar)

        return {"status": "Success! Calendar created.", "calendar": db_calendar}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/update/{calendar_id}")
async def update_calendar(calendar_id: str, calendar: schemas.CalendarCreate, session: SessionDep, current_user: User = Depends(get_current_active_user)):
    try:
        if current_user is None:
            return {"status": "Unsuccessful"}
        db_calendar = session.exec(
            select(Calender)
            .where(Calender.user_id == current_user.id)
            .where(Calender.calendar_id == calendar_id)
        ).first()

        if not db_calendar:
            raise HTTPException(status_code=404, detail="Calendar not found or not authorized to update")
        
        db_calendar.title = calendar.title
        db_calendar.color = calendar.color
        db_calendar.description = calendar.description

        session.add(db_calendar)
        session.commit()
        session.refresh(db_calendar)
        ## More Filtering later -> now it returns all calendar objects in the table
        return {"status": "Success! Calendar updated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))