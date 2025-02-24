# from fastapi import APIRouter, Depends, HTTPException, Response
# import schemas
# import requests
# from typing import Annotated
# from sqlmodel import select
# from datetime import datetime, timezone
# from uuid import uuid4

# from utils.common import create_access_token, get_current_user, Token, hash_password
# from db import Session, get_session, User, Quiz
# from schemas import UserCreate, QuizBase, Quiz
# from config import ACCESS_TOKEN_EXPIRE_MINUTES, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI
# from typing import List, Dict, NamedTuple

# from google.oauth2 import id_token

# SessionDep = Annotated[Session, Depends(get_session)]
# UserDep = Annotated[User, Depends(get_current_user)]

# router = APIRouter(
#     prefix="/personality-profile",
#     tags=["personality-profile"],
#     # dependencies=[Depends(get_token_header)],
#     responses={404: {"description": "Not found"}},
# )


# # @router.post("/")
# # async def submit_quiz(
# #     profile: schemas.QuizCreate,
# #     current_user: UserDep,
# #     session: SessionDep
# # ):
# #     quiz = QuizBase(
# #         user_id=current_user.id,
# #         created_at=datetime.now(timezone.utc),
# #         extraversion=profile.extraversion,
# #         openness=profile.openness,
# #         conscientiousness=profile.conscientiousness,
# #         agreeableness=profile.agreeableness,
# #         neuroticism=profile.neuroticism,
# #         interests=profile.interests,
# #         energy_level=profile.energy_level,
# #         preferred_time=profile.preferred_time,
# #         social_preference=profile.social_preference
# #     )
# #     print(quiz)
# #     session.add(quiz)
# #     session.commit()
# #     session.refresh(quiz)
    
# #     return {"status": "success", "quiz_id": quiz.id}

# @router.get("/", response_model=List[QuizBase])
# async def get_quiz_results(
#     current_user: UserDep,
#     session: SessionDep
# ):
#     statement = select(Quiz).where(Quiz.user_id == current_user.id).order_by(Quiz.created_at.desc())
#     results = session.exec(statement).all()
#     return results

# @router.get("/{quiz_id}", response_model=QuizBase)
# async def get_quiz_result(
#     quiz_id: int,
#     current_user: UserDep,
#     session: SessionDep
# ):
#     statement = select(Quiz).where(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
#     result = session.exec(statement).first()
    
#     if not result:
#         raise HTTPException(status_code=404, detail="Quiz result not found")
    
#     return result

# @router.delete("/{quiz_id}")
# async def delete_quiz_result(
#     quiz_id: int,
#     current_user: UserDep,
#     session: SessionDep
# ):
#     statement = select(Quiz).where(Quiz.id == quiz_id, Quiz.user_id == current_user.id)
#     result = session.exec(statement).first()
    
#     if not result:
#         raise HTTPException(status_code=404, detail="Quiz result not found")
    
#     session.delete(result)
#     session.commit()
    
#     return {"status": "success", "message": "Quiz result deleted"}
