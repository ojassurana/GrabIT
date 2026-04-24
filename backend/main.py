import os
import json
import math
import bcrypt
import jwt
import httpx
import anthropic
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client
import asyncio

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
GRABMAPS_API_KEY = os.getenv("GRABMAPS_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
PEOPLE_POINTER_URL = os.getenv("PEOPLE_POINTER_URL")
GRABMAPS_BASE = "https://maps.grab.com/api/v1"

security = HTTPBearer()
claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# --- Models ---

class SignupRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class InterestsRequest(BaseModel):
    category: str
    bubbles: list[str]
    free_text: str = ""


class ExploreRequest(BaseModel):
    category: str  # "food" or "activities"
    radius_km: float
    transport_mode: str = "driving"  # "driving" or "walking"
    k: int = 5
    custom_query: str | None = None
    bubbles_override: list[str] | None = None
    free_text_override: str | None = None


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


# --- GrabMaps helpers ---

async def grabmaps_keyword_search(keyword: str, lat: float, lng: float, limit: int = 20) -> list[dict]:
    async with httpx.AsyncClient() as client:
        params = {
            "keyword": keyword,
            "location": f"{lat},{lng}",
            "limit": str(limit),
        }
        resp = await client.get(
            f"{GRABMAPS_BASE}/maps/poi/v1/search",
            params=params,
            headers={"Authorization": f"Bearer {GRABMAPS_API_KEY}"},
            timeout=15.0,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("places", [])


async def grabmaps_get_eta(origin_lat: float, origin_lng: float, dest_lat: float, dest_lng: float, profile: str = "driving") -> dict:
    async with httpx.AsyncClient() as client:
        params = [
            ("coordinates", f"{origin_lng},{origin_lat}"),
            ("coordinates", f"{dest_lng},{dest_lat}"),
            ("profile", profile),
        ]
        resp = await client.get(
            f"{GRABMAPS_BASE}/maps/eta/v1/direction",
            params=params,
            headers={"Authorization": f"Bearer {GRABMAPS_API_KEY}"},
            timeout=15.0,
        )
        if resp.status_code != 200:
            return {"distance_m": None, "duration_s": None}
        data = resp.json()
        routes = data.get("routes", [])
        if not routes:
            return {"distance_m": None, "duration_s": None}
        return {
            "distance_m": routes[0].get("distance"),
            "duration_s": routes[0].get("duration"),
        }


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def get_user_location(username: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{PEOPLE_POINTER_URL}/api/pointers/{username}", timeout=10.0)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return {"lat": data["latitude"], "lng": data["longitude"]}


async def rank_pois_with_claude(pois_with_eta: list[dict], user_profile: dict, k: int) -> list[dict]:
    pois_summary = []
    for p in pois_with_eta:
        pois_summary.append({
            "name": p.get("name", "Unknown"),
            "category": p.get("category", p.get("business_type", "")),
            "address": p.get("formatted_address", ""),
            "distance_km": round(p.get("_distance_km", 0), 2),
            "eta_minutes": round(p["_eta"]["duration_s"] / 60, 1) if p.get("_eta", {}).get("duration_s") else None,
            "business_type": p.get("business_type", ""),
            "guide_info": p.get("guide_info", {}),
        })

    profile_desc = f"Food interests: {', '.join(user_profile.get('food_bubbles', []))}. {user_profile.get('food_text', '')}\n"
    profile_desc += f"Activity interests: {', '.join(user_profile.get('activity_bubbles', []))}. {user_profile.get('activity_text', '')}"

    prompt = f"""You are a travel recommendation AI for Southeast Asia.

A traveller has the following profile:
{profile_desc}

Here are {len(pois_summary)} places found nearby. Rank them by a composite score considering:
1. How well the place matches the traveller's interests (most important)
2. Distance/ETA (closer is better, but less important than interest match)
3. Quality of the place based on available metadata

Return EXACTLY the top {k} places as a JSON array. Each item must have:
- "name": the exact place name from the input
- "rank": integer 1 to {k}
- "blurb": a punchy 5-10 word reason why this place fits the traveller (be specific about WHY — reference their actual interests)
- "score": a number 0-100 representing the composite fit

Places to rank:
{json.dumps(pois_summary, indent=2)}

Respond with ONLY a valid JSON array, no markdown, no explanation."""

    response = claude.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        ranked = json.loads(response.content[0].text)
    except (json.JSONDecodeError, IndexError):
        ranked = [{"name": p["name"], "rank": i + 1, "blurb": "Great spot nearby", "score": 50} for i, p in enumerate(pois_summary[:k])]

    return ranked


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


@app.get("/location/{username}")
async def get_location(username: str):
    loc = await get_user_location(username)
    if not loc:
        raise HTTPException(status_code=404, detail="User location not found")
    return loc


@app.post("/explore")
async def explore(req: ExploreRequest, user_id: str = Depends(get_current_user)):
    # Get user profile
    user = supabase.table("users").select("username").eq("id", user_id).execute()
    if not user.data:
        raise HTTPException(status_code=404, detail="User not found")
    username = user.data[0]["username"]

    # Get user location from People Pointer
    loc = await get_user_location(username)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found in People Pointer")

    user_lat, user_lng = loc["lat"], loc["lng"]

    # Get user interests
    interests = supabase.table("user_interests").select("*").eq("user_id", user_id).execute()
    food_interests = next((i for i in interests.data if i["category"] == "food"), {"bubbles": [], "free_text": ""})
    activity_interests = next((i for i in interests.data if i["category"] == "activities"), {"bubbles": [], "free_text": ""})

    user_profile = {
        "food_bubbles": food_interests.get("bubbles", []),
        "food_text": food_interests.get("free_text", ""),
        "activity_bubbles": activity_interests.get("bubbles", []),
        "activity_text": activity_interests.get("free_text", ""),
    }

    # Determine search keywords
    if req.custom_query:
        keywords = [req.custom_query]
    else:
        bubbles = req.bubbles_override if req.bubbles_override is not None else (
            food_interests.get("bubbles", []) if req.category == "food" else activity_interests.get("bubbles", [])
        )
        free_text = req.free_text_override if req.free_text_override is not None else (
            food_interests.get("free_text", "") if req.category == "food" else activity_interests.get("free_text", "")
        )
        keywords = bubbles[:]
        if free_text:
            keywords.append(free_text)

    if not keywords:
        keywords = [req.category]

    # Search GrabMaps for POIs using all keywords in parallel
    search_tasks = [grabmaps_keyword_search(kw, user_lat, user_lng, limit=10) for kw in keywords[:5]]
    search_results = await asyncio.gather(*search_tasks)

    # Merge and deduplicate by name
    seen_names = set()
    all_pois = []
    for results in search_results:
        for poi in results:
            name = poi.get("name", "")
            if name and name not in seen_names:
                seen_names.add(name)
                poi_lat = poi.get("location", {}).get("latitude", 0)
                poi_lng = poi.get("location", {}).get("longitude", 0)
                dist = haversine_km(user_lat, user_lng, poi_lat, poi_lng)
                if dist <= req.radius_km:
                    poi["_distance_km"] = dist
                    poi["_lat"] = poi_lat
                    poi["_lng"] = poi_lng
                    all_pois.append(poi)

    if not all_pois:
        return {"results": [], "user_location": {"lat": user_lat, "lng": user_lng}}

    # Get ETAs in parallel for all POIs
    profile_map = {"driving": "driving", "walking": "walking"}
    transport = profile_map.get(req.transport_mode, "driving")

    eta_tasks = [grabmaps_get_eta(user_lat, user_lng, p["_lat"], p["_lng"], transport) for p in all_pois]
    etas = await asyncio.gather(*eta_tasks)

    for poi, eta in zip(all_pois, etas):
        poi["_eta"] = eta

    # Rank with Claude (one call)
    ranked = await asyncio.to_thread(rank_pois_with_claude, all_pois, user_profile, min(req.k, len(all_pois)))
    ranked = await ranked if asyncio.iscoroutine(ranked) else ranked

    # Build response — match ranked names back to full POI data
    results = []
    for r in ranked:
        matching_poi = next((p for p in all_pois if p.get("name") == r["name"]), None)
        if not matching_poi:
            continue
        results.append({
            "rank": r["rank"],
            "name": r["name"],
            "blurb": r["blurb"],
            "score": r.get("score", 0),
            "lat": matching_poi["_lat"],
            "lng": matching_poi["_lng"],
            "distance_km": round(matching_poi["_distance_km"], 2),
            "eta_minutes": round(matching_poi["_eta"]["duration_s"] / 60, 1) if matching_poi["_eta"].get("duration_s") else None,
            "eta_distance_m": matching_poi["_eta"].get("distance_m"),
            "address": matching_poi.get("formatted_address", ""),
            "category": matching_poi.get("category", matching_poi.get("business_type", "")),
            "business_type": matching_poi.get("business_type", ""),
        })

    results.sort(key=lambda x: x["rank"])

    return {
        "results": results,
        "user_location": {"lat": user_lat, "lng": user_lng},
        "radius_km": req.radius_km,
        "transport_mode": req.transport_mode,
    }
