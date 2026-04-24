# GrabIT

A mobile-friendly travel assistant website for people travelling around Southeast Asia where Grab is prevalent. Built using the GrabMaps API. The UI will be developed using mobile-friendly design principles.

---

## Feature 1: Nearby POI Discovery

The user describes the kind of places they are looking for. Their browser location is available to the website.

### Interest Selection (Signup Page)

The user specifies their interests during signup. The signup page should have a visually appealing, polished UX for selecting interests — not a boring form. Interests fall into three categories:

1. **Food** — The user describes the kind of food they like. Keywords can be specific cuisines (e.g. "Vietnamese dish", "masala dosa"), or broader categories (e.g. "fast food"). These keywords are passed to the GrabMaps keyword search API.
2. **Activities / Experiences** — Tourist attractions and experiences (e.g. Cu Chi Tunnels in Ho Chi Minh, Petronas Towers, a day at Universal Studios / theme parks).
3. **Accommodations** — Places to stay.

### Search Radius

The user defines a search radius around their current location (e.g. 3 km, 5 km). The GrabMaps nearby/keyword search API is used to find the best matching POIs within that radius.

### Map View

- The user's location is shown as a point on a GrabMaps map.
- A circle is drawn around the user based on their defined search radius.
- Matching POIs appear as points inside the circle.
- The user can hover over a POI to see:
  - POI information (name, address, category, etc.)
  - Why that POI is a good match for what they are looking for.
  - ETA from the user's location to that POI (calculated via the GrabMaps directions API).

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
