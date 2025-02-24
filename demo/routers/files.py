from fastapi import APIRouter, Depends, HTTPException
from db import Session, get_session
from typing import Annotated
import schemas
from utils.common import get_current_active_user, create_access_token, get_current_user, Token, hash_password

SessionDep = Annotated[Session, Depends(get_session)]


router = APIRouter(
    prefix="/files",
    tags=["files"],
    # dependencies=[Depends(get_token_header)],
    responses={404: {"description": "Not found"}},
)


@router.get("/file")
async def read_file(filename: str):
    try:
        with open(f'files/{filename}', 'r') as file:
            return file.read()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")