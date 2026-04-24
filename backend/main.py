import os
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
JWT_SECRET = os.getenv("SUPABASE_SERVICE_KEY")
security = HTTPBearer()


# --- Models ---

class SignupRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class InterestsRequest(BaseModel):
    category: str  # "food" or "activities"
    bubbles: list[str]
    free_text: str = ""


# --- Auth helpers ---

def create_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# --- Routes ---

@app.get("/")
def hello():
    return {"message": "Hello from GrabIT!"}


@app.post("/auth/signup")
def signup(req: SignupRequest):
    existing = supabase.table("users").select("id").eq("username", req.username).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Username already taken")

    password_hash = bcrypt.hashpw(req.password.encode(), bcrypt.gensalt()).decode()
    result = supabase.table("users").insert({
        "username": req.username,
        "password_hash": password_hash,
    }).execute()

    user = result.data[0]
    token = create_token(user["id"])
    return {"token": token, "user_id": user["id"], "username": req.username}


@app.post("/auth/login")
def login(req: LoginRequest):
    result = supabase.table("users").select("*").eq("username", req.username).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = result.data[0]
    if not bcrypt.checkpw(req.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user["id"])
    return {"token": token, "user_id": user["id"], "username": user["username"]}


@app.post("/interests")
def save_interests(req: InterestsRequest, user_id: str = Depends(get_current_user)):
    if req.category not in ("food", "activities"):
        raise HTTPException(status_code=400, detail="Category must be 'food' or 'activities'")

    supabase.table("user_interests").upsert({
        "user_id": user_id,
        "category": req.category,
        "bubbles": req.bubbles,
        "free_text": req.free_text,
    }, on_conflict="user_id,category").execute()

    return {"status": "saved"}


@app.get("/interests")
def get_interests(user_id: str = Depends(get_current_user)):
    result = supabase.table("user_interests").select("*").eq("user_id", user_id).execute()
    return {"interests": result.data}
