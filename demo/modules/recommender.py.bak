from fastapi import APIRouter, Depends, HTTPException
import google.generativeai as genai
from typing import Dict, List
from modules.weather import WeatherCondition
import json, schemas
from config import GEMINI_API_KEY
from typing import Annotated
from uuid import uuid4

from utils.common import create_access_token, get_current_user, Token, hash_password
from db import Session, get_session, User, CalendarEvent, Calender, Recommendations
from sqlmodel import select, and_, SQLModel, text
from modules.weather import get_forecast
from sqlalchemy import inspect
from geopy.geocoders import Nominatim
from math import ceil


SessionDep = Annotated[Session, Depends(get_session)]

def get_location_string(longitude: float, latitude: float) -> str:
    try:
        geolocator = Nominatim(user_agent="calendar_app")
        location = geolocator.reverse(f"{latitude}, {longitude}", language='en')
        
        if location and location.raw.get('address'):
            ## Get prominent location features
            address = location.raw['address']
            suburb = address.get('suburb', '')
            city_district = address.get('city_district', '')
            country = address.get('country', '')
            return f"{suburb},{city_district},{country}".lower().strip(", ")
        
        else:
            raise Exception("Location not found")
        
    except Exception as e:
        print(f"Error getting location: {e}")
        return "singapore,central,singapore"

class GeminiActivityRecommender:
    def __init__(self, api_key: str):
        """Initialize the Gemini API client"""
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash-exp')
    
    def _format_previous_events(self, events: List[Dict]) -> str:
        """Format previous events into a readable string for the prompt"""
        if not events:
            return "No previous events recorded."
            
        events_text = []
        for event in events:
            event_str = (
                f"- {event['title']} ({event['category']})\n"
                f"  Location: {event['location']}\n"
                f"  Time: {event['start_time']} - {event['end_time']}\n"
                f"  Frequency: {event['frequency']}"
            )
            events_text.append(event_str)
            
        return "Previous events:\n" + "\n".join(events_text)

    def _create_prompt(self, personality: Dict, weather_days: List[Dict], events_info: List[Dict], coord: List[float]) -> str:
        """Create a detailed prompt for Gemini based on personality and multiple days of weather. Refer to the user in first person."""
        example_response = {
            "11 Jan 2025": [
                {
                    "name": "Group Hiking",
                    "description": "A moderate-intensity group hike on local trails with scenic views",
                    "duration_minutes": 120,
                    "location":"Bukit Timah Hill"
                }
            ]
        }
        
        # Format weather conditions for each day
        weather_info = "\n".join([
            f"- {day}:\n  Temperature: {conditions[0]}°C\n  Condition: {conditions[1]}"
            for day, conditions in weather_days.items()
        ])
        
        prompt = f"""Given personality traits:
        - Extraversion: {personality['extraversion']:.2f}
        - Openness: {personality['openness']:.2f}
        - Conscientiousness: {personality['conscientiousness']:.2f}
        - Agreeableness: {personality['agreeableness']:.2f}
        - Neuroticism: {personality['neuroticism']:.2f}
        - Energy: {personality['energy_level']:.2f}
        - Social: {personality['social_preference']:.2f}
        - Interests: {personality['interests']}
    
        Weather forecast:
        {weather_info}

        {events_info}

        Consider the following when making recommendations:
        1. Avoid scheduling conflicts with existing events
        2. Account for frequency patterns in previous activities
        3. Maintain variety while respecting preferences shown in past events
        4. For each day, include at least one novel activity that:
        - Aligns with personality traits but isn't in previous events
        - Builds on existing interests but offers a new experience
        - Matches the user's energy level and social preferences
        - Could expand the user's comfort zone while remaining enjoyable
        5. When suggesting new activities:
        - Explain why it might appeal based on personality traits
        - Connect it to existing interests or past activities
        - Consider the openness score for how novel to go
        6. For each novel evenet
        - Add a column is_novel boolean
        - Add a column novel_reason to explain why it is novel

        Return JSON with 3 activities per date (including at least 1 new activity). Format:
        {{
            "10 Jan 2025": [
                {{
                    "name": "Activity",
                    "description": "Details",
                    "duration_minutes": 30,
                    "location": "location"
                }},
                ...
            ],
            ...
        }}

        Rules:
        - name: ≥3 chars
        - description: ≥10 chars
        - duration: 15-240 mins
        - location: string, provide more specific locations based on the current location coordinates at {coord}
        - Return only JSON
        - Match personality & weather
        - Avoid time conflicts with previous events
        - Consider activity patterns & preferences
        - Include novel activities matching personality
        - Higher openness score = more novel suggestions
        - Novel descriptions should not be too long, under 100 chars"""
        
        return prompt

    def _parse_gemini_response(self, response_text: str) -> Dict[str, List[Dict]]:
        """Parse Gemini's response into structured activity data by day"""
        try:
            # Remove markdown code block markers if present
            cleaned_text = response_text.strip()
            if cleaned_text.startswith("```json"):
                cleaned_text = cleaned_text[7:]  # Remove ```json
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text[3:]  # Remove ```
            if cleaned_text.endswith("```"):
                cleaned_text = cleaned_text[:-3]  # Remove trailing ```
            
            # Parse the cleaned JSON
            cleaned_text = cleaned_text.strip()
            daily_activities = json.loads(cleaned_text)
            return daily_activities
        except json.JSONDecodeError as e:
            print("Failed to parse JSON response. Raw response:", response_text)
            raise ValueError(f"Failed to parse Gemini response as JSON: {str(e)}")
        except Exception as e:
            print("Error while parsing response. Raw response:", response_text)
            raise

    async def get_recommendations(self, personality: Dict, weather: List[WeatherCondition], events, coord) -> List[Dict]:
        """Get activity recommendations using Gemini"""
        try:
            prompt = self._create_prompt(personality, weather, events, coord)
            response = await self.model.generate_content_async(prompt)
            
            # Extract the text response
            response_text = response.text
            print(response_text)
            # Parse and validate the response
            activities = self._parse_gemini_response(response_text)
            
            return activities
        except Exception as e:
            raise Exception(f"Failed to get recommendations from Gemini: {str(e)}")

## LocationData must have calendar_id, longitude, latitude
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
        print(recommendations)

        session.exec(delete(Recommendations))
        session.commit()
        for date, recs in recommendations.items():
            for recommendation in recs:
                new_event = Recommendations(
                    recommendation_id=str(uuid4()),
                    name=recommendation['name'],
                    description=recommendation['description'],
                    duration_minutes=recommendation['duration_minutes'],
                    is_novel=recommendation.get('is_novel', False),
                    novel_reason=recommendation.get('novel_reason', ''),
                    date=date,
                    calendar_id=payload.calendar_id
                )
                session.add(new_event)
        session.commit()
        session.refresh(new_event)


        return recommendations
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


