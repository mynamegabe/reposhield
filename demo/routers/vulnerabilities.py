from fastapi import APIRouter, Response, Query, Depends
import requests
import os
import pickle
import html
from starlette.responses import HTMLResponse
from databases import Database

router = APIRouter(
    prefix="/vulnerabilities",
    tags=["vulnerabilities"],
    responses={404: {"description": "Not found"}},
)


# database = Database("sqlite:///test.db")

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


# SQL Injection
@router.get("/unsafe_sqli/{username}")
async def unsafe_sqli(username: str):
    """BAD: SQL injection vulnerability"""
    query = f"SELECT * FROM users WHERE username = '{username}'"
    result = await database.fetch_one(query)
    return {"user": result}


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

@router.get("/path_traversal")
async def path_traversal(p: str):
    """BAD: Potential directory traversal"""
    base_path = "/server/static/images"
    with open(os.path.join(base_path, p), 'rb') as f:
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
