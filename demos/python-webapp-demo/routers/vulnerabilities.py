from fastapi import APIRouter, Response, HTTPException
import requests
import os
import pickle
import html
from starlette.responses import HTMLResponse
from sqlalchemy import create_engine, text, Table, Column, String, MetaData
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter(
    prefix="/vulnerabilities",
    tags=["vulnerabilities"],
    responses={404: {"description": "Not found"}},
)

# Set up SQLAlchemy engine
DATABASE_URL = "sqlite:///test.db"
engine = create_engine(DATABASE_URL)
metadata = MetaData()

# Define users table
users_table = Table(
    "users", metadata,
    Column("username", String, primary_key=True),
    Column("email", String, unique=True),
    Column("password", String)
)

# Create table and insert a test user on startup


def init_db():
    with engine.connect() as conn:
        metadata.create_all(engine)
        conn.execute(text("""
            INSERT OR IGNORE INTO users (username, email, password)
            VALUES ('testuser', 'test@example.com', 'password')
        """))


init_db()

# SSRF - Server-Side Request Forgery


@router.get("/full_ssrf")
async def full_ssrf(target: str):
    """BAD: User has full control over the target URL"""
    resp = requests.get(f"https://{target}.example.com/data/")
    return {"data": resp.text}


@router.get("/partial_ssrf")
async def partial_ssrf(user_id: str):
    """BAD: User fully controls the path component"""
    resp = requests.get(f"https://api.example.com/user_info/{user_id}")
    return {"data": resp.text}


# Reflected XSS - Cross-Site Scripting
@router.get("/unsafe_xss", response_class=HTMLResponse)
async def unsafe_xss(name: str = ""):
    """BAD: Unsanitized user input rendered in HTML"""
    return f"<h1>Your name is {name}</h1>"


@router.get("/safe_xss", response_class=HTMLResponse)
async def safe_xss(name: str = ""):
    """GOOD: Properly escaped user input"""
    return f"<h1>Your name is {html.escape(name)}</h1>"


@router.get("/unsafe_sqli")
async def unsafe_sqli(username: str):
    """BAD: SQL injection vulnerability"""
    try:
        # Build the query with raw user input (unsafe)
        query = text(f"SELECT * FROM users WHERE username = '{username}'")

        # Execute the query
        with engine.connect() as conn:
            result = conn.execute(query)
            user = result.fetchall()

        return {"user": user}

    except SQLAlchemyError as e:
        # Capture the exception and return the raw MySQL error message
        # Access the original exception message
        error_message = str(e.__dict__['orig'])
        raise HTTPException(
            status_code=500, detail=f"SQL Error: {error_message}")

# Unsafe Deserialization


@router.get("/unsafe_deserialization")
async def unsafe_deserialization(serialized_object: str):
    """BAD: Arbitrary deserialization of user input"""
    return {"result": pickle.loads(bytes.fromhex(serialized_object))}


# Cookie Injection
@router.get("/set_cookie")
async def set_cookie(response: Response, name: str):
    """BAD: User-controlled cookie name/value"""
    response.set_cookie(key=name, value=name)
    return {"message": "Cookie set"}


@router.get("/set_cookie_header")
async def set_cookie_header(response: Response, name: str):
    """BAD: User-controlled raw cookie header"""
    response.headers["Set-Cookie"] = f"{name}={name};"
    return {"message": "Raw cookie header set"}


# Path Injection / Path Traversal
@router.get("/unsafe_file_access")
async def unsafe_file_access(p: str):
    """BAD: Arbitrary file read vulnerability"""
    with open(p, 'rb') as f:
        return Response(content=f.read())


@router.get("/safe_file_access")
async def safe_file_access(p: str):
    """GOOD: Restricts access to files only within allowed directory"""
    base_path = "/server/static/images"
    fullpath = os.path.normpath(os.path.join(base_path, p))
    if not fullpath.startswith(base_path):
        return {"error": "Access Denied"}
    with open(fullpath, 'rb') as f:
        return Response(content=f.read())


@router.get("/open_redirect")
async def open_redirect(url: str):
    """BAD: Open redirect vulnerability"""
    return Response(status_code=302, headers={"Location": url})
