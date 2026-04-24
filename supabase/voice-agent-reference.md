# Voice Agent Supabase Reference

This file is a single implementation reference for the future voice agent.

It does four things:

1. Lists the Supabase data each feature needs.
2. Recommends `REST API` vs `Supabase Edge Function` per feature.
3. Includes the SQL you still need in Supabase.
4. Includes copy-ready code for the REST and edge-function pieces.

## 1. What Already Exists

Today the repo already has:

- `users`
- `user_interests`

Current gap summary:

- `user_interests.category` only supports `food` and `activities`.
- Feature 1 also needs `accommodations`.
- Features 2, 3, and 4 need user preferences, latest location, Telegram connection state, and friend relationships.

## 2. Per-Feature Recommendation

### Feature 1: Nearby POI Discovery

Supabase data needed:

- `user_interests`: default saved interests for `food`, `activities`, `accommodations`
- `user_preferences.default_radius_km`
- `user_preferences.radius_mode`
- `user_preferences.max_eta_minutes`
- `user_preferences.transport_profile`
- `user_locations`: only as a fallback when the client has not sent a fresh browser location

Not from Supabase:

- Current live browser location
- The user’s ad-hoc spoken query, like `"find bubble tea nearby"`

Recommendation:

- Use a `REST API call`

Why:

- This is a simple authenticated read of one user’s saved defaults.
- Your existing backend is already a FastAPI REST service.
- No background processing or privileged cross-user read is required.

### Feature 2: Bumblebee Traveller

Supabase data needed:

- `user_interests`
- `user_preferences.default_radius_km`
- `user_preferences.radius_mode`
- `user_preferences.max_eta_minutes`
- `user_preferences.transport_profile`
- `user_preferences.bumblebee_enabled`
- `user_preferences.notification_cooldown_minutes`
- `telegram_connections`
- `user_locations`
- `notification_events` for dedupe/cooldown

Recommendation:

- Use a `Supabase Edge Function`

Why:

- It needs server-side secrets for GrabMaps and Telegram.
- It may be triggered repeatedly in the background.
- It should dedupe notifications and keep the logic off the client.

### Feature 3: Social Meetup

Supabase data needed:

- `user_friends`
- `user_locations` for the initiator and friends
- `user_interests` for all participants
- `user_preferences.transport_profile`

Not from Supabase:

- The one-off spoken meetup query, like `"find bubble tea for us"`

Recommendation:

- Use a `Supabase Edge Function`

Why:

- It aggregates multiple users’ data.
- It runs the scoring algorithm server-side.
- It should not expose all friend locations to the client before ranking.

### Feature 4: Voice Agent

Supabase data needed:

- `users`
- `user_interests`
- `user_preferences`
- `telegram_connections`
- `user_locations`
- `user_friends`

Recommendation:

- Use a `Supabase Edge Function`

Why:

- The agent needs one compact context payload to decide what information is still missing.
- It is cleaner to centralize the joins and sanitization in one server-side function.
- You do not want to send Telegram secrets back to the client.

## 3. Recommended Supabase Schema Additions

Run this as a new migration after your existing `20260424_create_users_and_interests.sql`.

```sql
-- Expand interests to support accommodations.
alter table user_interests
drop constraint if exists user_interests_category_check;

alter table user_interests
add constraint user_interests_category_check
check (category in ('food', 'activities', 'accommodations'));

-- Saved defaults used by features 1, 2, 3, and 4.
create table if not exists user_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  default_radius_km numeric(6,2) not null default 3.00 check (default_radius_km > 0),
  radius_mode text not null default 'distance' check (radius_mode in ('distance', 'eta')),
  max_eta_minutes integer,
  transport_profile text not null default 'walking'
    check (transport_profile in ('driving', 'walking', 'cycling', 'motorcycle')),
  bumblebee_enabled boolean not null default false,
  notification_cooldown_minutes integer not null default 180
    check (notification_cooldown_minutes > 0),
  preferred_locale text not null default 'en-SG',
  updated_at timestamptz not null default now()
);

-- Last known live location, used for passive discovery and meetup ranking.
create table if not exists user_locations (
  user_id uuid primary key references users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision,
  source text not null default 'browser',
  updated_at timestamptz not null default now()
);

-- Telegram connection details.
-- For hackathon speed this can store bot_token directly.
-- For production, prefer one app-owned bot token in env and only store chat_id here.
create table if not exists telegram_connections (
  user_id uuid primary key references users(id) on delete cascade,
  bot_token text not null,
  chat_id text not null,
  bot_username text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Friend graph for feature 3. For the demo, insert three rows per user.
create table if not exists user_friends (
  user_id uuid not null references users(id) on delete cascade,
  friend_user_id uuid not null references users(id) on delete cascade,
  alias text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);

create index if not exists user_friends_user_id_idx
  on user_friends(user_id);

-- Notification log so Bumblebee does not spam the same POI repeatedly.
create table if not exists notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  feature text not null check (feature in ('bumblebee')),
  poi_id text not null,
  poi_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now()
);

create index if not exists notification_events_lookup_idx
  on notification_events(user_id, feature, poi_id, sent_at desc);
```

## 4. REST Code For Feature 1

Save this into your existing FastAPI backend later. This is the best fit for Feature 1 because it only hydrates one user’s defaults.

```python
# backend/main.py

from typing import Any


def interests_to_map(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    mapped = {
        "food": {"bubbles": [], "free_text": ""},
        "activities": {"bubbles": [], "free_text": ""},
        "accommodations": {"bubbles": [], "free_text": ""},
    }
    for row in rows:
        mapped[row["category"]] = {
            "bubbles": row.get("bubbles") or [],
            "free_text": row.get("free_text") or "",
        }
    return mapped


@app.get("/agent/context/nearby")
def get_nearby_context(user_id: str = Depends(get_current_user)):
    interests_result = (
        supabase.table("user_interests")
        .select("category, bubbles, free_text")
        .eq("user_id", user_id)
        .execute()
    )

    prefs_result = (
        supabase.table("user_preferences")
        .select(
            "default_radius_km, radius_mode, max_eta_minutes, transport_profile, preferred_locale"
        )
        .eq("user_id", user_id)
        .execute()
    )

    location_result = (
        supabase.table("user_locations")
        .select("latitude, longitude, updated_at")
        .eq("user_id", user_id)
        .execute()
    )

    preferences = prefs_result.data[0] if prefs_result.data else {
        "default_radius_km": 3,
        "radius_mode": "distance",
        "max_eta_minutes": None,
        "transport_profile": "walking",
        "preferred_locale": "en-SG",
    }

    last_location = location_result.data[0] if location_result.data else None

    return {
        "user_id": user_id,
        "interests": interests_to_map(interests_result.data or []),
        "preferences": preferences,
        "last_location": last_location,
        "agent_missing_inputs": {
            "live_location_required": True,
            "interest_override_optional": True,
        },
    }
```

## 5. Edge Function For Feature 4: `voice-agent-context`

Suggested file later:

- `supabase/functions/voice-agent-context/index.ts`

What it does:

- Fetches the user’s saved cross-feature context
- Returns only sanitized Telegram state
- Tells the voice agent what information is still missing

```ts
// supabase/functions/voice-agent-context/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

type InterestRow = {
  category: "food" | "activities" | "accommodations";
  bubbles: string[] | null;
  free_text: string | null;
};

type FriendRow = {
  friend_user_id: string;
  alias: string | null;
  is_demo: boolean;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function interestMap(rows: InterestRow[]) {
  return {
    food: rows.find((row) => row.category === "food") ?? {
      category: "food",
      bubbles: [],
      free_text: "",
    },
    activities: rows.find((row) => row.category === "activities") ?? {
      category: "activities",
      bubbles: [],
      free_text: "",
    },
    accommodations: rows.find((row) => row.category === "accommodations") ?? {
      category: "accommodations",
      bubbles: [],
      free_text: "",
    },
  };
}

Deno.serve(async (req) => {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return json({ error: "userId is required" }, 400);
    }

    const [
      userResult,
      interestsResult,
      preferencesResult,
      telegramResult,
      locationResult,
      friendsResult,
    ] = await Promise.all([
      supabase.from("users").select("id, username").eq("id", userId).single(),
      supabase.from("user_interests").select("category, bubbles, free_text").eq("user_id", userId),
      supabase.from("user_preferences").select(
        "default_radius_km, radius_mode, max_eta_minutes, transport_profile, bumblebee_enabled, notification_cooldown_minutes, preferred_locale",
      ).eq("user_id", userId).maybeSingle(),
      supabase.from("telegram_connections").select(
        "chat_id, bot_username, is_active",
      ).eq("user_id", userId).maybeSingle(),
      supabase.from("user_locations").select(
        "latitude, longitude, accuracy_meters, updated_at",
      ).eq("user_id", userId).maybeSingle(),
      supabase.from("user_friends").select(
        "friend_user_id, alias, is_demo",
      ).eq("user_id", userId),
    ]);

    if (userResult.error || !userResult.data) {
      return json({ error: userResult.error?.message ?? "User not found" }, 404);
    }

    if (interestsResult.error) return json({ error: interestsResult.error.message }, 500);
    if (preferencesResult.error) return json({ error: preferencesResult.error.message }, 500);
    if (telegramResult.error) return json({ error: telegramResult.error.message }, 500);
    if (locationResult.error) return json({ error: locationResult.error.message }, 500);
    if (friendsResult.error) return json({ error: friendsResult.error.message }, 500);

    const friends = (friendsResult.data ?? []) as FriendRow[];
    const friendIds = friends.map((friend) => friend.friend_user_id);

    const [friendUsersResult, friendLocationsResult] = await Promise.all([
      friendIds.length
        ? supabase.from("users").select("id, username").in("id", friendIds)
        : Promise.resolve({ data: [], error: null }),
      friendIds.length
        ? supabase.from("user_locations").select("user_id, latitude, longitude, updated_at").in("user_id", friendIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (friendUsersResult.error) return json({ error: friendUsersResult.error.message }, 500);
    if (friendLocationsResult.error) return json({ error: friendLocationsResult.error.message }, 500);

    const friendUsersById = new Map(
      (friendUsersResult.data ?? []).map((row) => [row.id, row]),
    );

    const friendLocationsById = new Map(
      (friendLocationsResult.data ?? []).map((row) => [row.user_id, row]),
    );

    const preferences = preferencesResult.data ?? {
      default_radius_km: 3,
      radius_mode: "distance",
      max_eta_minutes: null,
      transport_profile: "walking",
      bumblebee_enabled: false,
      notification_cooldown_minutes: 180,
      preferred_locale: "en-SG",
    };

    const locationAgeMs = locationResult.data?.updated_at
      ? Date.now() - new Date(locationResult.data.updated_at).getTime()
      : Number.POSITIVE_INFINITY;

    const response = {
      user: userResult.data,
      interests: interestMap((interestsResult.data ?? []) as InterestRow[]),
      preferences,
      telegram: {
        connected: Boolean(telegramResult.data?.chat_id && telegramResult.data?.is_active),
        chat_id_present: Boolean(telegramResult.data?.chat_id),
        bot_username: telegramResult.data?.bot_username ?? null,
      },
      last_location: locationResult.data ?? null,
      friends: friends.map((friend) => ({
        user_id: friend.friend_user_id,
        username: friendUsersById.get(friend.friend_user_id)?.username ?? null,
        alias: friend.alias,
        is_demo: friend.is_demo,
        last_location: friendLocationsById.get(friend.friend_user_id) ?? null,
      })),
      missing: {
        nearby_discovery_needs_live_location: locationAgeMs > 30 * 1000,
        bumblebee_needs_telegram: !telegramResult.data?.chat_id,
        meetup_needs_at_least_two_friends_with_location:
          friends.filter((friend) => friendLocationsById.has(friend.friend_user_id)).length < 2,
        saved_location_stale: locationAgeMs > 5 * 60 * 1000,
      },
    };

    return json(response);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
```

## 6. Edge Function For Feature 2: `bumblebee-location-check`

Suggested file later:

- `supabase/functions/bumblebee-location-check/index.ts`

What it does:

- Accepts a live location update
- Loads saved interests and preferences from Supabase
- Searches GrabMaps
- Filters by distance or ETA
- Sends one Telegram message for the best unseen POI
- Logs the notification

```ts
// supabase/functions/bumblebee-location-check/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

type InterestRow = {
  category: "food" | "activities" | "accommodations";
  bubbles: string[] | null;
  free_text: string | null;
};

type PreferenceRow = {
  default_radius_km: number;
  radius_mode: "distance" | "eta";
  max_eta_minutes: number | null;
  transport_profile: "driving" | "walking" | "cycling" | "motorcycle";
  bumblebee_enabled: boolean;
  notification_cooldown_minutes: number;
};

type TelegramRow = {
  bot_token: string;
  chat_id: string;
  is_active: boolean;
};

type Place = {
  poi_id: string;
  name: string;
  formatted_address?: string;
  category?: string;
  business_type?: string;
  location: {
    latitude: number;
    longitude: number;
  };
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GRABMAPS_API_KEY = Deno.env.get("GRABMAPS_API_KEY")!;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function uniqueKeywords(rows: InterestRow[]): string[] {
  const all = rows.flatMap((row) => {
    const bubbles = row.bubbles ?? [];
    const freeText = row.free_text
      ? row.free_text.split(",").map((value) => value.trim()).filter(Boolean)
      : [];
    return [...bubbles, ...freeText];
  });

  return [...new Set(all.map((value) => value.trim()).filter(Boolean))].slice(0, 6);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function buildReason(place: Place, matchedKeyword: string): string {
  const label = place.category || place.business_type || "place";
  return `${place.name} looks relevant because it matched "${matchedKeyword}" and is tagged as ${label}.`;
}

async function grabKeywordSearch(
  keyword: string,
  latitude: number,
  longitude: number,
  countryCode?: string,
): Promise<Place[]> {
  const params = new URLSearchParams({
    keyword,
    location: `${latitude},${longitude}`,
    limit: "5",
  });

  if (countryCode) params.set("country", countryCode);

  const response = await fetch(
    `https://maps.grab.com/api/v1/maps/poi/v1/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${GRABMAPS_API_KEY}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GrabMaps search failed for "${keyword}"`);
  }

  const data = await response.json();
  return (data.places ?? []) as Place[];
}

async function getEtaMinutes(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
  profile: PreferenceRow["transport_profile"],
): Promise<number | null> {
  const params = new URLSearchParams();
  params.append("coordinates", `${originLon},${originLat}`);
  params.append("coordinates", `${destinationLon},${destinationLat}`);
  params.set("profile", profile);

  const response = await fetch(
    `https://maps.grab.com/api/v1/maps/eta/v1/direction?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${GRABMAPS_API_KEY}`,
      },
    },
  );

  if (!response.ok) return null;

  const data = await response.json();
  const seconds = data?.routes?.[0]?.duration;
  return typeof seconds === "number" ? Math.round(seconds / 60) : null;
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram send failed: ${body}`);
  }
}

Deno.serve(async (req) => {
  try {
    const { userId, latitude, longitude, countryCode } = await req.json();

    if (!userId || typeof latitude !== "number" || typeof longitude !== "number") {
      return json({ error: "userId, latitude, and longitude are required" }, 400);
    }

    await supabase.from("user_locations").upsert({
      user_id: userId,
      latitude,
      longitude,
      source: "voice-agent",
      updated_at: new Date().toISOString(),
    });

    const [prefsResult, interestsResult, telegramResult] = await Promise.all([
      supabase.from("user_preferences").select(
        "default_radius_km, radius_mode, max_eta_minutes, transport_profile, bumblebee_enabled, notification_cooldown_minutes",
      ).eq("user_id", userId).maybeSingle(),
      supabase.from("user_interests").select(
        "category, bubbles, free_text",
      ).eq("user_id", userId),
      supabase.from("telegram_connections").select(
        "bot_token, chat_id, is_active",
      ).eq("user_id", userId).maybeSingle(),
    ]);

    if (prefsResult.error) return json({ error: prefsResult.error.message }, 500);
    if (interestsResult.error) return json({ error: interestsResult.error.message }, 500);
    if (telegramResult.error) return json({ error: telegramResult.error.message }, 500);

    const prefs = prefsResult.data as PreferenceRow | null;
    const telegram = telegramResult.data as TelegramRow | null;

    if (!prefs?.bumblebee_enabled) {
      return json({ status: "disabled", notified: false });
    }

    if (!telegram?.is_active || !telegram.chat_id || !telegram.bot_token) {
      return json({ status: "telegram_not_connected", notified: false });
    }

    const keywords = uniqueKeywords((interestsResult.data ?? []) as InterestRow[]);
    if (!keywords.length) {
      return json({ status: "no_saved_keywords", notified: false });
    }

    const recentThreshold = new Date(
      Date.now() - prefs.notification_cooldown_minutes * 60 * 1000,
    ).toISOString();

    const searchResults = await Promise.all(
      keywords.map((keyword) => grabKeywordSearch(keyword, latitude, longitude, countryCode)),
    );

    const candidateMap = new Map<string, Place & { matchedKeyword: string }>();
    searchResults.forEach((places, index) => {
      const keyword = keywords[index];
      for (const place of places) {
        if (!candidateMap.has(place.poi_id)) {
          candidateMap.set(place.poi_id, { ...place, matchedKeyword: keyword });
        }
      }
    });

    const candidates = Array.from(candidateMap.values());
    if (!candidates.length) {
      return json({ status: "no_candidates", notified: false });
    }

    const ranked = await Promise.all(
      candidates.map(async (place) => {
        const distanceKm = haversineKm(
          latitude,
          longitude,
          place.location.latitude,
          place.location.longitude,
        );

        const etaMinutes = await getEtaMinutes(
          latitude,
          longitude,
          place.location.latitude,
          place.location.longitude,
          prefs.transport_profile,
        );

        const insideRadius = prefs.radius_mode === "distance"
          ? distanceKm <= prefs.default_radius_km
          : etaMinutes !== null && prefs.max_eta_minutes !== null && etaMinutes <= prefs.max_eta_minutes;

        return {
          ...place,
          distanceKm,
          etaMinutes,
          insideRadius,
        };
      }),
    );

    const filtered = ranked
      .filter((place) => place.insideRadius)
      .sort((a, b) => {
        if (a.etaMinutes === null && b.etaMinutes === null) return a.distanceKm - b.distanceKm;
        if (a.etaMinutes === null) return 1;
        if (b.etaMinutes === null) return -1;
        return a.etaMinutes - b.etaMinutes;
      });

    if (!filtered.length) {
      return json({ status: "no_place_inside_threshold", notified: false });
    }

    const best = filtered[0];

    const dedupeResult = await supabase.from("notification_events").select("id").eq(
      "user_id",
      userId,
    ).eq("feature", "bumblebee").eq("poi_id", best.poi_id).gte("sent_at", recentThreshold).limit(1);

    if (dedupeResult.error) return json({ error: dedupeResult.error.message }, 500);
    if ((dedupeResult.data ?? []).length > 0) {
      return json({ status: "cooldown_active", notified: false, poi_id: best.poi_id });
    }

    const reason = buildReason(best, best.matchedKeyword);
    const etaText = best.etaMinutes === null ? "ETA unavailable" : `${best.etaMinutes} min away`;

    await sendTelegramMessage(
      telegram.bot_token,
      telegram.chat_id,
      [
        "Bumblebee spotted a match near you.",
        "",
        `${best.name}`,
        best.formatted_address ?? "Address unavailable",
        etaText,
        reason,
      ].join("\n"),
    );

    const insertResult = await supabase.from("notification_events").insert({
      user_id: userId,
      feature: "bumblebee",
      poi_id: best.poi_id,
      poi_name: best.name,
      metadata: {
        matched_keyword: best.matchedKeyword,
        eta_minutes: best.etaMinutes,
        distance_km: best.distanceKm,
      },
    });

    if (insertResult.error) return json({ error: insertResult.error.message }, 500);

    return json({
      status: "notified",
      notified: true,
      poi: {
        poi_id: best.poi_id,
        name: best.name,
        address: best.formatted_address ?? null,
        eta_minutes: best.etaMinutes,
        distance_km: best.distanceKm,
        reason,
      },
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
```

## 7. Edge Function For Feature 3: `social-meetup-rank`

Suggested file later:

- `supabase/functions/social-meetup-rank/index.ts`

What it does:

- Reads the requester and friend locations
- Computes a smallest-enclosing-circle approximation on projected coordinates
- Searches GrabMaps for matching POIs inside that circle
- Calculates ETA for each participant
- Scores POIs by interest alignment plus low ETA variance

```ts
// supabase/functions/social-meetup-rank/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

type LatLng = {
  lat: number;
  lon: number;
};

type Participant = {
  userId: string;
  username: string | null;
  alias: string | null;
  location: LatLng;
  keywords: string[];
};

type InterestRow = {
  user_id: string;
  category: "food" | "activities" | "accommodations";
  bubbles: string[] | null;
  free_text: string | null;
};

type Place = {
  poi_id: string;
  name: string;
  formatted_address?: string;
  category?: string;
  business_type?: string;
  location: {
    latitude: number;
    longitude: number;
  };
};

type Circle = {
  centerX: number;
  centerY: number;
  radius: number;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const GRABMAPS_API_KEY = Deno.env.get("GRABMAPS_API_KEY")!;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 1);
}

function keywordsFromInterestRows(rows: InterestRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const row of rows) {
    const current = map.get(row.user_id) ?? [];
    const bubbles = row.bubbles ?? [];
    const freeText = row.free_text
      ? row.free_text.split(",").map((value) => value.trim()).filter(Boolean)
      : [];

    map.set(row.user_id, [...current, ...bubbles, ...freeText]);
  }

  return map;
}

function projectPoint(point: LatLng, originLat: number): { x: number; y: number } {
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.cos((originLat * Math.PI) / 180);
  return {
    x: point.lon * kmPerLon,
    y: point.lat * kmPerLat,
  };
}

function circleFromTwoPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Circle {
  const centerX = (a.x + b.x) / 2;
  const centerY = (a.y + b.y) / 2;
  const radius = Math.hypot(a.x - b.x, a.y - b.y) / 2;
  return { centerX, centerY, radius };
}

function circleFromThreePoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): Circle | null {
  const d =
    2 *
    (a.x * (b.y - c.y) +
      b.x * (c.y - a.y) +
      c.x * (a.y - b.y));

  if (Math.abs(d) < 1e-9) return null;

  const ux =
    ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
      (b.x * b.x + b.y * b.y) * (c.y - a.y) +
      (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
    d;

  const uy =
    ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
      (b.x * b.x + b.y * b.y) * (a.x - c.x) +
      (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
    d;

  return {
    centerX: ux,
    centerY: uy,
    radius: Math.hypot(a.x - ux, a.y - uy),
  };
}

function pointInsideCircle(point: { x: number; y: number }, circle: Circle): boolean {
  return Math.hypot(point.x - circle.centerX, point.y - circle.centerY) <= circle.radius + 1e-9;
}

function makeSmallestEnclosingCircle(points: { x: number; y: number }[]): Circle {
  let circle: Circle | null = null;

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (circle && pointInsideCircle(p, circle)) continue;

    circle = { centerX: p.x, centerY: p.y, radius: 0 };

    for (let j = 0; j < i; j++) {
      const q = points[j];
      if (pointInsideCircle(q, circle)) continue;

      circle = circleFromTwoPoints(p, q);

      for (let k = 0; k < j; k++) {
        const r = points[k];
        if (pointInsideCircle(r, circle)) continue;

        const candidate = circleFromThreePoints(p, q, r);
        if (candidate) circle = candidate;
      }
    }
  }

  return circle ?? { centerX: 0, centerY: 0, radius: 0 };
}

function unprojectPoint(
  point: { x: number; y: number },
  originLat: number,
): LatLng {
  const kmPerLat = 111.32;
  const kmPerLon = 111.32 * Math.cos((originLat * Math.PI) / 180);
  return {
    lat: point.y / kmPerLat,
    lon: point.x / kmPerLon,
  };
}

async function grabKeywordSearch(
  keyword: string,
  latitude: number,
  longitude: number,
  countryCode?: string,
): Promise<Place[]> {
  const params = new URLSearchParams({
    keyword,
    location: `${latitude},${longitude}`,
    limit: "20",
  });

  if (countryCode) params.set("country", countryCode);

  const response = await fetch(
    `https://maps.grab.com/api/v1/maps/poi/v1/search?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${GRABMAPS_API_KEY}` },
    },
  );

  if (!response.ok) {
    throw new Error("GrabMaps keyword search failed");
  }

  const data = await response.json();
  return (data.places ?? []) as Place[];
}

async function etaMinutes(
  origin: LatLng,
  destination: LatLng,
  profile: string,
): Promise<number | null> {
  const params = new URLSearchParams();
  params.append("coordinates", `${origin.lon},${origin.lat}`);
  params.append("coordinates", `${destination.lon},${destination.lat}`);
  params.set("profile", profile);

  const response = await fetch(
    `https://maps.grab.com/api/v1/maps/eta/v1/direction?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${GRABMAPS_API_KEY}` },
    },
  );

  if (!response.ok) return null;

  const data = await response.json();
  const seconds = data?.routes?.[0]?.duration;
  return typeof seconds === "number" ? Math.round(seconds / 60) : null;
}

function alignmentScore(place: Place, participants: Participant[], queryText: string): number {
  const placeText = [
    place.name,
    place.formatted_address ?? "",
    place.category ?? "",
    place.business_type ?? "",
  ].join(" ");

  const placeTokens = new Set(normalizeWords(placeText));
  const queryTokens = normalizeWords(queryText);

  const queryMatch = queryTokens.length
    ? queryTokens.filter((token) => placeTokens.has(token)).length / queryTokens.length
    : 0;

  const participantMatches = participants.map((participant) => {
    const wanted = participant.keywords.flatMap(normalizeWords);
    if (!wanted.length) return 0.4;
    const hits = wanted.filter((token) => placeTokens.has(token)).length;
    return hits / wanted.length;
  });

  const participantAverage =
    participantMatches.reduce((sum, value) => sum + value, 0) / participantMatches.length;

  return 0.7 * queryMatch + 0.3 * participantAverage;
}

function etaVariance(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

Deno.serve(async (req) => {
  try {
    const { requesterUserId, interestQuery, countryCode } = await req.json();

    if (!requesterUserId || !interestQuery) {
      return json({ error: "requesterUserId and interestQuery are required" }, 400);
    }

    const [friendsResult, requesterResult, prefsResult] = await Promise.all([
      supabase.from("user_friends").select("friend_user_id, alias").eq("user_id", requesterUserId),
      supabase.from("users").select("id, username").eq("id", requesterUserId).single(),
      supabase.from("user_preferences").select("transport_profile").eq("user_id", requesterUserId).maybeSingle(),
    ]);

    if (friendsResult.error) return json({ error: friendsResult.error.message }, 500);
    if (requesterResult.error || !requesterResult.data) {
      return json({ error: requesterResult.error?.message ?? "Requester not found" }, 404);
    }
    if (prefsResult.error) return json({ error: prefsResult.error.message }, 500);

    const friendIds = (friendsResult.data ?? []).map((row) => row.friend_user_id);
    const participantIds = [requesterUserId, ...friendIds];

    const [usersResult, locationsResult, interestsResult] = await Promise.all([
      supabase.from("users").select("id, username").in("id", participantIds),
      supabase.from("user_locations").select("user_id, latitude, longitude, updated_at").in("user_id", participantIds),
      supabase.from("user_interests").select("user_id, category, bubbles, free_text").in("user_id", participantIds),
    ]);

    if (usersResult.error) return json({ error: usersResult.error.message }, 500);
    if (locationsResult.error) return json({ error: locationsResult.error.message }, 500);
    if (interestsResult.error) return json({ error: interestsResult.error.message }, 500);

    const usersById = new Map((usersResult.data ?? []).map((row) => [row.id, row]));
    const locationsById = new Map((locationsResult.data ?? []).map((row) => [
      row.user_id,
      { lat: row.latitude, lon: row.longitude },
    ]));
    const keywordsByUserId = keywordsFromInterestRows((interestsResult.data ?? []) as InterestRow[]);
    const aliasesByUserId = new Map((friendsResult.data ?? []).map((row) => [row.friend_user_id, row.alias]));

    const participants: Participant[] = participantIds.map((userId) => {
      const location = locationsById.get(userId);
      if (!location) {
        throw new Error(`Missing location for participant ${userId}`);
      }

      return {
        userId,
        username: usersById.get(userId)?.username ?? null,
        alias: userId === requesterUserId ? null : aliasesByUserId.get(userId) ?? null,
        location,
        keywords: keywordsByUserId.get(userId) ?? [],
      };
    });

    if (participants.length < 2) {
      return json({ error: "At least two participants are required" }, 400);
    }

    const originLat = participants.reduce((sum, p) => sum + p.location.lat, 0) / participants.length;
    const projected = participants.map((participant) => projectPoint(participant.location, originLat));
    const circle = makeSmallestEnclosingCircle(projected);
    const center = unprojectPoint({ x: circle.centerX, y: circle.centerY }, originLat);

    const searchResults = await grabKeywordSearch(
      interestQuery,
      center.lat,
      center.lon,
      countryCode,
    );

    const inCircle = searchResults.filter((place) => {
      const distanceToCenter = haversineKm(
        center.lat,
        center.lon,
        place.location.latitude,
        place.location.longitude,
      );
      return distanceToCenter <= circle.radius;
    });

    const transportProfile = prefsResult.data?.transport_profile ?? "driving";

    const scored = await Promise.all(
      inCircle.slice(0, 12).map(async (place) => {
        const etas = await Promise.all(
          participants.map((participant) =>
            etaMinutes(
              participant.location,
              { lat: place.location.latitude, lon: place.location.longitude },
              transportProfile,
            )),
        );

        if (etas.some((value) => value === null)) return null;

        const numericEtas = etas as number[];
        const interest = alignmentScore(place, participants, interestQuery);
        const fairness = 1 / (1 + etaVariance(numericEtas) / 100);
        const score = 0.6 * interest + 0.4 * fairness;

        return {
          poi_id: place.poi_id,
          name: place.name,
          address: place.formatted_address ?? null,
          category: place.category ?? place.business_type ?? null,
          score,
          interest_score: interest,
          eta_fairness_score: fairness,
          etas: participants.map((participant, index) => ({
            user_id: participant.userId,
            username: participant.username,
            alias: participant.alias,
            eta_minutes: numericEtas[index],
          })),
        };
      }),
    );

    const ranked = scored
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 5);

    return json({
      query: interestQuery,
      circle: {
        center_latitude: center.lat,
        center_longitude: center.lon,
        radius_km: circle.radius,
      },
      participants: participants.map((participant) => ({
        user_id: participant.userId,
        username: participant.username,
        alias: participant.alias,
        location: participant.location,
      })),
      ranked_pois: ranked,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
```

## 8. Final Call On REST vs Edge

Use this split:

- Feature 1: `REST API`
- Feature 2: `Edge Function`
- Feature 3: `Edge Function`
- Feature 4: `Edge Function`

That split matches the shape of your product:

- Feature 1 is just user-default hydration.
- Features 2 and 3 are server-side orchestration problems.
- Feature 4 needs a clean, joined context payload for the voice layer.

## 9. Important Notes Before Your Engineer Implements This

- Your current `user_interests` constraint must be expanded to include `accommodations`.
- Feature 2 only works well if location updates are written frequently into `user_locations`.
- For Telegram, the safer production design is one app-level bot token in env plus a stored `chat_id`. The schema above keeps `bot_token` only because your hackathon flow currently says each user pastes one.
- The social meetup function above uses a projected minimal-circle implementation for the map circle and GrabMaps directions for ETA fairness. That is the right place for the ranking logic to live.
- Because this repo currently uses custom FastAPI JWT auth instead of Supabase Auth, call these edge functions from your trusted backend or voice-agent service, not directly from the public client with a raw `userId`.
