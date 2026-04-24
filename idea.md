# GrabIT

A mobile-friendly travel assistant website for people travelling around Southeast Asia where Grab is prevalent. Built using the GrabMaps API. The UI will be developed using mobile-friendly design principles.

---

## Feature 1: Nearby POI Discovery (Explore Nearby)

### Interest Selection (Signup Page)

The user specifies their interests during signup. The signup page should have a visually appealing, polished UX for selecting interests — not a boring form. Two categories:

1. **Food** — Specific cuisines (e.g. "Vietnamese dish", "masala dosa"), or broader categories (e.g. "fast food"). Keywords passed to GrabMaps keyword search API.
2. **Activities / Experiences** — Tourist attractions and experiences (e.g. Cu Chi Tunnels, Petronas Towers, theme parks).

Each category has selectable bubbles, custom bubble creation (+ button), and a free text box.

### Entry Point

User taps "Explore Nearby" on the home page. **No search happens automatically.** The page opens with:

- A GrabMaps map centered on the user's location.
- User location is pulled from the **People Pointer API** (`/api/pointers/:username`), polled every ~1 second in the background to stay fresh.
- A **radius slider** below the map (0–20 km).
- A **circle overlay** on the map that expands/contracts with the slider (subtle green fill, ~5% opacity, dimmed area outside).
- A **floating search bar** on top of the map (Google Maps style).

### Search Flow

1. User presses the search/discover button → picks **Food** or **Activities** tab.
2. App searches using **all saved bubbles + free text** for that category via GrabMaps keyword search API within the current radius.
3. Small **edit button** lets the user temporarily tweak interests (bubbles + free text) for this search only — does not change saved profile.
4. GrabMaps returns ~15–20 POIs → **parallel** API calls for ETA (GrabMaps directions) + **one Claude API call** to re-rank using composite score (interest alignment + distance + POI metadata quality) and generate 5–10 word "why it fits" blurbs.
5. Results capped at **K** (default 5, changeable via dropdown: 3, 5, 10).
6. All API calls (directions + Claude) are **parallelized**.

### Custom Search

User can type a query in the floating search bar (e.g. "hojicha tea") → **replaces** profile-based results with new search results within the radius. Clear search bar to return to profile-based results.

### Transport Mode

Toggle at the top of results panel: **Driving** (default) or **Walking**. Only one ETA call per POI based on selected mode.

### Results Panel

- **Desktop**: Right-side panel with ranked list.
- **Mobile**: Collapsible bottom drawer.
- Each card shows: place name, "why it fits" blurb (AI-generated), distance, ETA.
- Dropdown to change K (3, 5, 10).

### Map Interaction

- Pins appear inside the circle for all K results (drop animation when ready).
- **Tap a pin** → small popup on map (name + ETA) + panel auto-scrolls to that POI's card.
- **Tap a card** → map centers/highlights that pin.
- Pins strictly inside the radius circle only (client-side filtering).

### Loading State

Map stays visible. Results panel shows **skeleton cards** (pulsing placeholders). When all data is ready, pins drop onto the map simultaneously and skeleton cards fill in.

### AI Agent (Claude API)

- One Claude call with structured outputs receives all ~15–20 POIs + user profile.
- Re-ranks by composite score and returns top K with "why it fits" blurbs.
- Uses POI metadata from GrabMaps (name, category, address, business_type, guide_info) to generate relevant, specific blurbs.

---

## Feature 2: Bumblebee Traveller

For travellers who like to drive, walk around, and explore freely.

### How It Works

The user's interests are already defined from signup (Feature 1). As they move around, they are automatically notified whenever a POI matching their interests comes within their defined radius.

### Radius Definition

The user can define their radius in two ways:

1. **Distance** — in kilometres (e.g. 2 km, 5 km).
2. **ETA** — in travel time (e.g. 10 minutes away), using the GrabMaps directions API to calculate.

### Notifications

When a matching POI enters their radius, the user receives a notification via **Telegram**. The notification includes:

- The POI name and details.
- ETA from their current location to the POI.
- A summary of why that POI aligns with their interests.

### Telegram Onboarding

During signup, the user connects their Telegram by going to BotFather, copying their bot token, and pasting it on the website.

---

## Feature 3: Social Meetup

A social feature for friends to find the best POI to meet at.

### Friends

- For the hackathon demo, the user has three friends pre-loaded.
- There is a UI to add and remove friends.

### How It Works

1. One person initiates by searching for an interest (e.g. "bubble tea"). They can use a default interest from their profile or type a current interest into an input box.
2. The app computes the **smallest circle that encompasses all three friends' locations** on the map.
3. All POIs matching the interest within that circle are found using the GrabMaps API.
4. Each POI is scored using an **optimal score** based on:
   - **Personal interest alignment** — how well the POI matches what they are looking for.
   - **ETA variance** — POIs where the ETA from all three friends is most similar (least variance) score higher.
5. The POIs are ranked by this score and displayed as a **ranked list** of top POIs.

### Map View

- The smallest encompassing circle around all three friends is drawn on the map.
- Matching POIs appear within this circle.
- Similar to Airbnb's search results — the user sees all matching locations within range on the map alongside the ranked list.

### Key Principle

The user should not have to manually choose a location. The ranked list provides the information; the scoring algorithm handles the decision.

---

## Feature 4: Voice Agent

A voice agent that sits on top of all three features and acts as the primary interface for hands-free usage.

### How It Works

1. The user speaks to the agent via their microphone.
2. The agent takes in the speech, understands what the user is asking, and determines which feature (1, 2, or 3) they want to use.
3. The agent checks whether the current information it has (user location, interests, friends, radius, etc.) is sufficient to execute that feature. If not, it asks the user for the missing information via voice.
4. Once it has everything it needs, the agent makes tool calls to the relevant feature's backend and returns the results to the user.

### Tool Calls

The voice agent can invoke:

- **Feature 1 (Nearby POI Discovery)** — search for POIs by interest and radius, show results on the map with ETAs.
- **Feature 2 (Bumblebee Traveller)** — enable/disable passive notifications, adjust radius, change notification preferences.
- **Feature 3 (Social Meetup)** — initiate a meetup search, specify the interest, find the optimal POI for all friends.

### Key Principle

The voice agent is synced into each feature — it is not a separate experience. It is another way to interact with the same features, making the app fully usable without touching the screen.
