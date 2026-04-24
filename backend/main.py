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

from contextlib import asynccontextmanager

load_dotenv()


@asynccontextmanager
async def lifespan(app):
    print("[Bumblebee] Starting background loop...")
    task = asyncio.create_task(bumblebee_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)

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


class BumblebeePrefsRequest(BaseModel):
    enabled: bool = False
    radius_mode: str = "distance"  # "distance" or "eta"
    radius_km: float = 1.0
    eta_minutes: float = 10.0
    transport_mode: str = "walking"  # "walking" or "driving"


class PointerUsernameRequest(BaseModel):
    pointer_username: str


# --- Telegram ---

TELEGRAM_BOT_TOKEN = "8620748051:AAHhJeKubJf5_s7ySwKW_vEGuaOJkW3n0Rs"
TELEGRAM_CHAT_ID = "495589406"
BUMBLEBEE_SITE_URL = os.getenv("BUMBLEBEE_SITE_URL", "https://grab-git-main-ojasss-projects.vercel.app")


async def send_telegram_message(text: str):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True,
            },
            timeout=10.0,
        )


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

    prompt = f"""You are a travel recommendation AI for Southeast Asia. A traveller has the following profile:

{profile_desc}

Here are {len(pois_summary)} places found nearby. Rank them by a composite score:
1. Interest alignment (most important) — how specifically the place matches what they listed
2. Distance/ETA — closer is better but secondary
3. Place quality — based on metadata, category, and guide info

Return EXACTLY the top {k} places as a JSON array. Each item must have:
- "name": the exact place name from the input (must match exactly)
- "rank": integer 1 to {k}
- "blurb": 10-20 words explaining SPECIFICALLY why this place is a great fit for THIS traveller. Reference their actual interests by name. For example, if they like "Indian food", say "Serves authentic South Indian dosas and thali — matches your Indian food preference." Do NOT write generic descriptions like "local dining spot" or "convenient location." Every blurb must connect the place to the traveller's stated interests.
- "score": 0-100 composite fit score

Places to rank:
{json.dumps(pois_summary, indent=2)}

Respond with ONLY a valid JSON array, no markdown, no code fences, no explanation."""

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
        # Override profile with just the search query for Claude ranking
        user_profile = {
            "food_bubbles": [req.custom_query] if req.category == "food" else [],
            "food_text": "",
            "activity_bubbles": [req.custom_query] if req.category == "activities" else [],
            "activity_text": "",
        }
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


# --- Bumblebee endpoints ---

@app.post("/bumblebee/preferences")
def save_bumblebee_prefs(req: BumblebeePrefsRequest, user_id: str = Depends(get_current_user)):
    # If enabling, clear old notification history for fresh start
    was_enabled = False
    existing = supabase.table("bumblebee_preferences").select("enabled").eq("user_id", user_id).execute()
    if existing.data:
        was_enabled = existing.data[0].get("enabled", False)

    if req.enabled and not was_enabled:
        # Clear notification history on re-enable
        supabase.table("notification_events").delete().eq("user_id", user_id).execute()

    supabase.table("bumblebee_preferences").upsert({
        "user_id": user_id,
        "enabled": req.enabled,
        "radius_mode": req.radius_mode,
        "radius_km": req.radius_km,
        "eta_minutes": req.eta_minutes,
        "transport_mode": req.transport_mode,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="user_id").execute()

    return {"status": "saved"}


@app.get("/bumblebee/preferences")
def get_bumblebee_prefs(user_id: str = Depends(get_current_user)):
    result = supabase.table("bumblebee_preferences").select("*").eq("user_id", user_id).execute()
    if not result.data:
        return {
            "enabled": False,
            "radius_mode": "distance",
            "radius_km": 1.0,
            "eta_minutes": 10.0,
            "transport_mode": "walking",
        }
    prefs = result.data[0]
    return {
        "enabled": prefs["enabled"],
        "radius_mode": prefs["radius_mode"],
        "radius_km": prefs["radius_km"],
        "eta_minutes": prefs["eta_minutes"],
        "transport_mode": prefs["transport_mode"],
    }


@app.get("/bumblebee/notifications")
def get_notifications(user_id: str = Depends(get_current_user)):
    result = (
        supabase.table("notification_events")
        .select("*")
        .eq("user_id", user_id)
        .order("notified_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"notifications": result.data}


@app.post("/user/pointer-username")
def set_pointer_username(req: PointerUsernameRequest, user_id: str = Depends(get_current_user)):
    supabase.table("users").update({"pointer_username": req.pointer_username}).eq("id", user_id).execute()
    return {"status": "saved"}


@app.get("/user/pointer-username")
def get_pointer_username(user_id: str = Depends(get_current_user)):
    result = supabase.table("users").select("pointer_username").eq("id", user_id).execute()
    if not result.data or not result.data[0].get("pointer_username"):
        return {"pointer_username": None}
    return {"pointer_username": result.data[0]["pointer_username"]}


# --- Bumblebee background loop ---

async def bumblebee_tick():
    """One tick of the Bumblebee polling loop. Runs for all active users."""
    try:
        active = supabase.table("bumblebee_preferences").select("*").eq("enabled", True).execute()
        if not active.data:
            return
        print(f"[Bumblebee] Tick: {len(active.data)} active user(s)")

        for prefs in active.data:
            try:
                await process_bumblebee_user(prefs)
            except Exception as e:
                print(f"[Bumblebee] Error for user {prefs['user_id']}: {e}")
    except Exception as e:
        print(f"[Bumblebee] Tick error: {e}")


async def process_bumblebee_user(prefs: dict):
    user_id = prefs["user_id"]

    # Get username (used as People Pointer username)
    user = supabase.table("users").select("username").eq("id", user_id).execute()
    if not user.data:
        return
    pointer_username = user.data[0]["username"]

    # Fetch location from People Pointer
    loc = await get_user_location(pointer_username)
    if not loc:
        return
    user_lat, user_lng = loc["lat"], loc["lng"]

    # Get user interests
    interests = supabase.table("user_interests").select("*").eq("user_id", user_id).execute()
    food = next((i for i in interests.data if i["category"] == "food"), {"bubbles": [], "free_text": ""})
    activities = next((i for i in interests.data if i["category"] == "activities"), {"bubbles": [], "free_text": ""})

    # Build keywords for food and activities
    food_keywords = food.get("bubbles", [])[:]
    if food.get("free_text"):
        food_keywords.append(food["free_text"])
    activity_keywords = activities.get("bubbles", [])[:]
    if activities.get("free_text"):
        activity_keywords.append(activities["free_text"])

    # Determine search radius in km
    if prefs["radius_mode"] == "eta":
        # Approximate: ETA minutes * 0.7 km (generous for walking/driving in city)
        search_radius_km = prefs["eta_minutes"] * 0.7
    else:
        search_radius_km = prefs["radius_km"]

    # Search GrabMaps: 2 calls (food + activities), combine keywords
    food_query = " ".join(food_keywords[:5]) if food_keywords else "restaurant"
    activity_query = " ".join(activity_keywords[:5]) if activity_keywords else "attraction"

    food_results, activity_results = await asyncio.gather(
        grabmaps_keyword_search(food_query, user_lat, user_lng, limit=10),
        grabmaps_keyword_search(activity_query, user_lat, user_lng, limit=10),
    )

    # Merge, deduplicate, filter by radius
    seen_names = set()
    all_pois = []
    for poi in food_results + activity_results:
        name = poi.get("name", "")
        if not name or name in seen_names:
            continue
        seen_names.add(name)
        poi_lat = poi.get("location", {}).get("latitude", 0)
        poi_lng = poi.get("location", {}).get("longitude", 0)
        dist = haversine_km(user_lat, user_lng, poi_lat, poi_lng)
        if dist <= search_radius_km:
            poi["_distance_km"] = dist
            poi["_lat"] = poi_lat
            poi["_lng"] = poi_lng
            all_pois.append(poi)

    if not all_pois:
        return

    # Check 24h cooldown — filter out already notified POIs
    one_day_ago = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    recent = (
        supabase.table("notification_events")
        .select("poi_id")
        .eq("user_id", user_id)
        .gte("notified_at", one_day_ago)
        .execute()
    )
    notified_poi_ids = {r["poi_id"] for r in recent.data}
    new_pois = [p for p in all_pois if p.get("poi_id", p.get("name", "")) not in notified_poi_ids]

    if not new_pois:
        return

    # Get ETAs for new POIs
    transport = prefs.get("transport_mode", "walking")
    eta_tasks = [grabmaps_get_eta(user_lat, user_lng, p["_lat"], p["_lng"], transport) for p in new_pois]
    etas = await asyncio.gather(*eta_tasks)
    for poi, eta in zip(new_pois, etas):
        poi["_eta"] = eta

    # If ETA mode, filter by actual ETA
    if prefs["radius_mode"] == "eta":
        max_eta_s = prefs["eta_minutes"] * 60
        new_pois = [p for p in new_pois if p.get("_eta", {}).get("duration_s") and p["_eta"]["duration_s"] <= max_eta_s]
        if not new_pois:
            return

    # Rank with Claude — pick top 3
    user_profile = {
        "food_bubbles": food.get("bubbles", []),
        "food_text": food.get("free_text", ""),
        "activity_bubbles": activities.get("bubbles", []),
        "activity_text": activities.get("free_text", ""),
    }

    ranked = await asyncio.to_thread(rank_pois_with_claude, new_pois, user_profile, min(3, len(new_pois)))
    if asyncio.iscoroutine(ranked):
        ranked = await ranked

    # Match ranked back to POI data and send notifications
    for r in ranked[:3]:
        matching = next((p for p in new_pois if p.get("name") == r["name"]), None)
        if not matching:
            continue

        poi_id = matching.get("poi_id", matching.get("name", "unknown"))
        dist_km = matching["_distance_km"]
        eta_min = round(matching["_eta"]["duration_s"] / 60, 1) if matching.get("_eta", {}).get("duration_s") else None
        blurb = r.get("blurb", "Great spot nearby")

        # Format Telegram message
        eta_str = f"{eta_min} min {transport}" if eta_min else "nearby"
        link = f"{BUMBLEBEE_SITE_URL}/bumblebee?poi={poi_id}"
        msg = (
            f"*{matching['name']}*\n"
            f"📍 {dist_km:.1f} km away · {eta_str}\n"
            f"_{blurb}_\n\n"
            f"[View on map]({link})"
        )

        try:
            await send_telegram_message(msg)
        except Exception as e:
            print(f"[Bumblebee] Telegram send failed: {e}")

        # Record notification
        supabase.table("notification_events").insert({
            "user_id": prefs["user_id"],
            "poi_id": poi_id,
            "poi_name": matching.get("name", ""),
            "poi_lat": matching["_lat"],
            "poi_lng": matching["_lng"],
            "blurb": blurb,
            "eta_minutes": eta_min,
            "distance_km": round(dist_km, 2),
        }).execute()


async def bumblebee_loop():
    """Background loop that ticks every 15 seconds."""
    print("[Bumblebee] Loop started")
    while True:
        await bumblebee_tick()
        await asyncio.sleep(15)


