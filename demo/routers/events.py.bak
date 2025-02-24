from fastapi import APIRouter, Depends, HTTPException
import schemas
from typing import Annotated
from sqlmodel import select, and_, SQLModel
from datetime import timedelta
from uuid import uuid4
import asyncio

from utils.common import create_access_token, get_current_user, Token, hash_password
from db import Session, get_session, User, CalendarEvent, Calender, Recommendations
import schemas
from config import GEMINI_API_KEY, GOOGLE_MAPS_API_KEY
from modules.recommender import GeminiActivityRecommender, get_location_string
from modules.personality import load_profile_from_json
from modules.weather import get_forecast
from sqlalchemy import delete

from google.oauth2 import id_token
from google.auth.transport import requests
import requests as req
from math import ceil

## Location Based Stuff
from geopy.geocoders import Nominatim

SessionDep = Annotated[Session, Depends(get_session)]

router = APIRouter(
    prefix="/events",
    tags=["events"],
    # dependencies=[Depends(get_token_header)],
    responses={404: {"description": "Not found"}},
)
    
@router.post("/")
async def create_event(event : schemas.CalendarEvent, session: SessionDep, current_user: User = Depends(get_current_user)):
    try:
        if current_user is None:
            return {"status": "unsuccessful"}
        else:
            new_event = CalendarEvent(
                id=str(uuid4()),
                title = event.title,
                category = event.category,
                location = event.location,
                frequency = event.frequency,
                ## This one need process properly, the db we process as int
                start_time = event.start_time,
                end_time = event.end_time,
                calendar_id=event.calendar_id
            )
            print(new_event)
            session.add(new_event)
            session.commit()
            session.refresh(new_event)

            return {
                "status": "success",
                "message": f"Event {event.title} created succesfully",  
                "event": {
                    "id" : new_event.id,
                    "title": new_event.title,
                    "category" : new_event.category,
                    "location" : new_event.location,
                    "frequency" : new_event.frequency,
                    "start_time": new_event.start_time,
                    "end_time": new_event.end_time,
                    "calendar_id": new_event.calendar_id
                } 
            }
    except Exception as e:
        print(e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create event: {str(e)}"
        )

@router.get("/{calendar_id}")
async def get_event(calendar_id : str, session: SessionDep, current_user: User = Depends(get_current_user)):
    try:
        if current_user is None:
            return {"status": "unsuccessful"}
        else:
            events = session.exec(select(CalendarEvent).where(CalendarEvent.calendar_id == calendar_id).order_by(CalendarEvent.start_time)).all()
            return {
            "status":"Success",
             "events" : [
                {
                "id" : event.id,
                "title": event.title,
                "category" : event.category,
                "location" : event.location,
                "frequency" : event.frequency,
                "start_time": event.start_time,
                "end_time": event.end_time,                
                } for event in events
             ]
            }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get all events: {str(e)}"
        )

@router.delete("/{event_id}")
async def delete_event(event_id : str, session: SessionDep, current_user: User = Depends(get_current_user)):
    try:
        if current_user is None:
            return {"status": "unsuccessful"}
        else:
            ## 1. Get Calendar Event and the associated calendar ID and make sure they match
            event = session.exec(select(CalendarEvent).where(
                            CalendarEvent.id == event_id
                        )
                    ).first()     

            ## 2. Check the associated calendar ID and make sure the user_id matches 
            check_user = session.exec(select(Calender).where( and_(Calender.calendar_id == event.calendar_id, Calender.user_id == current_user.id))).all()
            if event and check_user:
                session.delete(event)
                session.commit()
                return {
                    "status" : "Success",
                    "message" : f"The event {event_id} has been deleted successfully"
                }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete events: {str(e)}"
        )
 

@router.post("/update")
async def update_event(event : schemas.CalendarEventDiff, session: SessionDep, current_user: User = Depends(get_current_user)):
    try:
        if current_user is None:
            return {"status": "unsuccessful"}
        else:
            ## 1. Get Calendar Event and the associated calendar ID and make sure they match
            existing_event = session.exec(select(CalendarEvent).where(
                            CalendarEvent.id == event.id
                        )
                    ).first()     
            print(existing_event)
            ## 2. Check the associated calendar ID and make sure the user_id matches 
            check_user = session.exec(select(Calender).where( and_(Calender.calendar_id == existing_event.calendar_id, Calender.user_id == current_user.id))).all()
            if event.diff != 0:
                existing_event.start_time -= event.diff
                existing_event.end_time -= event.diff
                session.add(existing_event)
                session.commit()
                session.refresh(existing_event)
                return {
                    "status" : "Success",
                    "message" : f"The event {existing_event.id} has been updated successfully"
                }
            ## 3. Update the event information
            if existing_event and check_user:
                existing_event.title = event.title
                existing_event.category = event.category
                existing_event.location = event.location
                existing_event.frequency = event.frequency
                existing_event.start_time = event.start_time
                existing_event.end_time = event.end_time
        
                session.add(existing_event)
                session.commit()
                session.refresh(existing_event)
                return {
                    "status" : "Success",
                    "message" : f"The event {existing_event.id} has been updated successfully"
                }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update event: {str(e)}"
        )

@router.get("/recommend/{calendar_id}")
async def recommend(calendar_id : str, session: SessionDep, current_user: User = Depends(get_current_user)):
    try:
        if current_user is None:
            return {"status": "unsuccessful"}
        events = session.exec(select(Recommendations).where(Recommendations.calendar_id == calendar_id)).all()
        return {
            "status":"Success",
            "events" : [
                 schemas.Recommendations(
                    recommendation_id=event.recommendation_id,
                    name=event.name,
                    description=event.description,
                    duration_minutes=event.duration_minutes,
                    duration_hours=int(ceil(event.duration_minutes / 60)),
                    is_novel=event.is_novel,
                    novel_reason=event.novel_reason,
                    date=event.date,
                    location=event.location,
                    calendar_id=event.calendar_id,
                    url=event.url
                ) for event in events
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recommend")
async def recommend(payload : schemas.LocationData, session: SessionDep, current_user: User = Depends(get_current_user)):
    try:
        if current_user is None:
            return {"status": "unsuccessful"}
        # Sample personality profile (in practice, this would come from your quiz)
        # run_personality_quiz()
        sample_personality = schemas.UserProfile(
            first_name=current_user.first_name,
            last_name=current_user.last_name,
            email=current_user.email,
            picture=current_user.picture,
            extraversion=current_user.extraversion,
            openness=current_user.openness,
            conscientiousness=current_user.conscientiousness,
            agreeableness=current_user.agreeableness,
            neuroticism=current_user.neuroticism,
            interests=current_user.interests,
            energy_level=current_user.energy_level,
            social_preference=current_user.social_preference
        )
        ## Verification and Retrieval of Calendar and associated events with user
        user_calendar = session.exec(select(Calender)
                    .where(Calender.user_id == current_user.id)
                    .where(Calender.calendar_id == payload.calendar_id)).first()
        if user_calendar is None:
            return {"status": "Unsuccessful"}
        
        user_events = session.exec(select(CalendarEvent)
                    .where(CalendarEvent.calendar_id == payload.calendar_id)
                    .order_by(CalendarEvent.start_time)).all()

        recommender = GeminiActivityRecommender(GEMINI_API_KEY)
        location = get_location_string(payload.longitude, payload.latitude)
         
        ## these might need to adjust
        num_days = 2
        days_skipped = 0
        # Sample weather
        # Location needs to be retrieved from previous calendars first? If not will put as generic Singapore,Singapore
        forecasts = await get_forecast(location, num_days, days_skipped)
        weather_data = {weather['date']: [weather['avgTempC'], weather['weather']] for weather in forecasts}
        
        # Get recommendations
        recommendations = await recommender.get_recommendations(sample_personality.model_dump(), weather_data, user_events, [payload.latitude, payload.longitude])

        session.exec(delete(Recommendations))
        session.commit()
        #Set some breakpoint or sum sht
        google_maps_api = f"https://maps.googleapis.com/maps/api/place/textsearch/json?query={{}}&key={GOOGLE_MAPS_API_KEY}"
        place_detail_api = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={{}}&fields=website&key={GOOGLE_MAPS_API_KEY}"
        for date, recs in recommendations.items():
            for recommendation in recs:
                r = req.get(google_maps_api.format(recommendation['location'])).json()
                if len(r['results']) > 0:
                    place_id = r['results'][0]['place_id']
                    r = req.get(place_detail_api.format(place_id)).json()
                    url = r['result'].get('website', '')
                else:
                    url=''
                recommendation['url'] = url
                new_event = Recommendations(
                    recommendation_id=str(uuid4()),
                    name=recommendation['name'],
                    description=recommendation['description'],
                    duration_minutes=recommendation['duration_minutes'],
                    is_novel=recommendation.get('is_novel', False),
                    novel_reason=recommendation.get('novel_reason', ''),
                    date=date,
                    calendar_id=payload.calendar_id,
                    location=recommendation['location'],
                    url=url
                )
                session.add(new_event)
        session.commit()
        session.refresh(new_event)


        return recommendations
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


