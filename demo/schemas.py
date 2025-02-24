from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
from enum import Enum

## Define user schemas
class UserBase(BaseModel):
    email: str
    first_name: str
    last_name: str
    
class UserCreate(UserBase):
    password: str

class UserProfile(UserBase):
    picture: Optional[str] = None
    extraversion: Optional[float] = None
    openness: Optional[float] = None
    conscientiousness: Optional[float] = None
    agreeableness: Optional[float] = None
    neuroticism: Optional[float] = None
    interests: Optional[str] = None
    energy_level: Optional[float] = None
    social_preference: Optional[float] = None


## Define OAuthLogicSchema 
class OAuthLogicSchema(BaseModel):
    access_token: str

class GoogleUserInfo(BaseModel):
    email: str
    first_name: str
    last_name: str
    picture: Optional[str] = None
    
class OAuthResponse(BaseModel):
    user: GoogleUserInfo
    access_token: str
    token_type: str = "bearer"


# ## Define Calendar Stuff
class CalendarBase(BaseModel):
    color: str
    title: str
    description : str
    
class Calendar(CalendarBase):
    calendar_id: str = None
    user_id: str = None
    
class CalendarCreate(CalendarBase):
    pass

class CalendarEvent(BaseModel):
    id: str = None
    title: str
    category: Optional[str] = None
    location:  Optional[str] = None
    frequency:  Optional[str] = None
    start_time: int
    end_time: int
    calendar_id: str = None
    url: str = None

class CalendarEventDiff(BaseModel):
    diff: int = 0
    id: str

class LocationData(BaseModel):
    latitude: float
    longitude: float
    calendar_id: str


class Recommendations(BaseModel):
    id: str = None
    name: str = ''
    description: str = ''
    duration_minutes: int
    is_novel: bool = False
    novel_reason: str = ''
    date: str = ''
    calendar_id: str
    location: str = ''
    url: Optional[str] = ''
