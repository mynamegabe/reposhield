from fastapi import APIRouter, Depends, HTTPException
from db import Session, get_session, User
from sqlmodel import select
from typing import Annotated
import schemas
from utils.common import get_current_active_user, create_access_token, get_current_user, Token, hash_password

SessionDep = Annotated[Session, Depends(get_session)]


router = APIRouter(
    prefix="/users",
    tags=["users"],
    # dependencies=[Depends(get_token_header)],
    responses={404: {"description": "Not found"}},
)

# @router.get("/users/", tags=["users"])
# async def read_users(session: SessionDep):
#     users = session.exec(select(User)).all()
#     return users


@router.get("/me", response_model=schemas.UserProfile)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    return schemas.UserProfile(
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
        preferred_time=current_user.preferred_time,
        social_preference=current_user.social_preference
    )

@router.post("/")
async def update_user(updated_users: User, session: SessionDep, current_user: User = Depends(get_current_user)):
    try:
        if current_user is None:
            return {"status": "Unsuccessful"}
        existing_user = session.exec(
            select(User)
            .where(User.id == current_user.id)
        ).first()

        if not existing_user:
            raise HTTPException(status_code=404, detail="Calendar not found or not authorized to update")
        print(updated_users.interests)
        existing_user.extraversion = updated_users.extraversion
        existing_user.openness = updated_users.openness
        existing_user.conscientiousness = updated_users.conscientiousness
        existing_user.agreeableness = updated_users.agreeableness
        existing_user.neuroticism = updated_users.neuroticism
        existing_user.interests = updated_users.interests
        existing_user.energy_level = updated_users.energy_level
        existing_user.preferred_time = updated_users.preferred_time
        existing_user.social_preference = updated_users.social_preference
        session.add(existing_user)
        session.commit()
        session.refresh(existing_user)
       
        return {"status": f"Success! User {existing_user.first_name} has been updated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
