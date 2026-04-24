---
name: grab-maps
description: GrabMaps API and library reference for Southeast Asia mapping — search places, routing/directions, nearby POIs, reverse geocoding, map initialization, and MCP integration. Use when working with Grab Maps, GrabMaps Playground, SEA mapping, or location-based features.
---

# GrabMaps — Complete API & Library Reference

Use this skill when building with GrabMaps APIs, initializing maps, searching places, calculating routes, or integrating GrabMaps with AI assistants via MCP.

## 1. Authentication

All protected API calls require a Bearer token in the `Authorization` header.

```
Authorization: Bearer <API_KEY>
```

API keys look like `bm_...`. Store them in environment variables or server-side code — never in client bundles.

## 2. Base URLs

- **API base**: `https://maps.grab.com/api/v1/`
- **Map style**: `https://maps.grab.com/api/style.json`
- **CDN library**: `https://maps.grab.com/developer/assets/js/grabmaps.es.js`
- **MCP endpoint**: `https://maps.grab.com/api/v1/mcp`

---

## 3. HTTP API Endpoints

### 3.1 Map Style

#### `GET /api/style.json`

Fetch the MapLibre-compatible style document. Required before initializing a MapLibre map.

| Param   | Description                                      |
|---------|--------------------------------------------------|
| `theme` | Optional. `basic`, `dark`, or `satellite`        |

**Auth**: `Authorization: Bearer <API_KEY>` (header, NOT query param)

```js
fetch('https://maps.grab.com/api/style.json?theme=basic', {
  headers: { 'Authorization': 'Bearer bm_your_api_key_here' }
})
.then(r => r.json())
.then(style => {
  const map = new maplibregl.Map({
    container: 'map',
    style: style,
    center: [103.8198, 1.3521],
    zoom: 12
  });
});
```

**Response**: MapLibre style JSON with `version`, `sources`, `layers`.

---

### 3.2 Places — Keyword Search

#### `GET /api/v1/maps/poi/v1/search`

Search for places by name or address. Adding a reference location improves relevance.

| Param      | Required | Description                                  |
|------------|----------|----------------------------------------------|
| `keyword`  | Yes      | Text query (e.g. "Marina Bay Sands")         |
| `country`  | No       | ISO 3166-1 alpha-3 (e.g. `SGP`, `IDN`, `MYS`) |
| `location` | No       | Bias point as `"latitude,longitude"`         |
| `limit`    | No       | Max number of results                        |

**Category-like queries**: Use keyword words — `restaurant`, `cafe`, `bar`, `hotel`, `mall`, `supermarket`, `bank`, etc.

```js
const params = new URLSearchParams({
  keyword: 'Marina Bay Sands',
  country: 'SGP',
  location: '1.3521,103.8198',
  limit: '5'
});

const response = await fetch('https://maps.grab.com/api/v1/maps/poi/v1/search?' + params, {
  headers: { 'Authorization': 'Bearer bm_your_api_key_here' }
});
const data = await response.json();
```

**Response shape**:
```json
{
  "places": [
    {
      "poi_id": "IT.3OCK7LEGD0GYN",
      "location": { "latitude": 1.2822848, "longitude": 103.86001 },
      "country": "Singapore",
      "country_code": "SGP",
      "city": "Singapore City",
      "street": "Bayfront Avenue",
      "house": "1",
      "postcode": "018971",
      "name": "MBS Hotel Tower 1",
      "formatted_address": "1 Bayfront Avenue, Singapore, 018971",
      "business_type": "hotel",
      "category": "hotel",
      "time_zone": { "name": "Asia/Singapore", "offset": 28800 },
      "administrative_areas": [
        { "type": "SubRegion", "name": "Singapore" },
        { "type": "Municipality", "name": "Downtown Core" },
        { "type": "Neighborhood", "name": "Bayfront Subzone" }
      ],
      "guide_info": { "guide_header": "...", "guide_body": "..." }
    }
  ],
  "renders": [...],
  "areas": [...],
  "uuid": "...",
  "is_confident": true
}
```

---

### 3.3 Places — Find Nearby

#### `GET /api/v1/maps/place/v2/nearby`

Find nearby POIs around a location.

| Param      | Required | Description                                      |
|------------|----------|--------------------------------------------------|
| `location` | Yes      | `"latitude,longitude"` of the search center      |
| `radius`   | No       | Search radius in **kilometres** (default 1 km)    |
| `limit`    | No       | Max POIs to return (default 10)                   |
| `rankBy`   | No       | `distance` (default) or `popularity`              |
| `language` | No       | Language for place names                          |

**Important**: Radius is in **kilometres**, not meters.

```js
const params = new URLSearchParams({
  location: '1.3521,103.8198',
  radius: '1',
  limit: '10',
  rankBy: 'distance'
});

const data = await fetch('https://maps.grab.com/api/v1/maps/place/v2/nearby?' + params, {
  headers: { 'Authorization': 'Bearer bm_your_api_key_here' }
}).then(r => r.json());
```

**Response shape**:
```json
{
  "uuid": "...",
  "status": { "code": "SUCCESS", "message": "OK" },
  "places": [
    {
      "poi_id": "IT.01MXY1E16UKCQ",
      "location": { "latitude": 1.3521, "longitude": 103.8198 },
      "name": "Eis Corner Foodhub",
      "formatted_address": "San Ramon, Singapore, 4511",
      "business_type": "food and beverage",
      "categories": [{ "category_name": "food and beverage" }],
      "place_type": "POI"
    }
  ]
}
```

---

### 3.4 Places — Reverse Geocoding

#### `GET /api/v1/maps/poi/v1/reverse-geo`

Resolve coordinates to a candidate place (pin drop / map move).

| Param      | Required | Description                                      |
|------------|----------|--------------------------------------------------|
| `location` | Yes      | `"latitude,longitude"` of the pin                |
| `type`     | No       | Scenario: `"dropoff"` or `"pickup"`              |

```js
const params = new URLSearchParams({ location: '1.2834,103.8607' });

const response = await fetch('https://maps.grab.com/api/v1/maps/poi/v1/reverse-geo?' + params, {
  headers: { 'Authorization': 'Bearer bm_your_api_key_here' }
});
const data = await response.json();
```

**Response**: Same shape as keyword search — `places[]`, `renders[]`, `areas[]`.

---

### 3.5 Routing — Directions

#### `GET /api/v1/maps/eta/v1/direction`

Calculate routes between points. Supports multi-stop, multiple profiles, and avoidance options.

| Param          | Required | Description                                                    |
|----------------|----------|----------------------------------------------------------------|
| `coordinates`  | Yes      | Repeated per point. Default: `lng,lat` (e.g. `103.8198,1.3521`) |
| `lat_first`    | No       | Set `true` if passing `lat,lng` instead                        |
| `profile`      | No       | `driving`, `motorcycle`, `tricycle`, `cycling`, `walking`      |
| `overview`     | No       | Set `full` to include encoded route geometry                   |
| `geometries`   | No       | `polyline6` (default, high precision) or `polyline`            |
| `avoid`        | No       | Comma-separated: `tolls`, `highways`                           |
| `alternatives` | No       | Number of alternative routes (integer)                         |

**Coordinate order**: Default is `longitude,latitude`. Use `lat_first=true` to switch.

```js
const params = new URLSearchParams();
params.append('coordinates', '103.8198,1.3521');
params.append('coordinates', '103.7767,1.2921');
params.set('profile', 'driving');
params.set('overview', 'full');

const response = await fetch('https://maps.grab.com/api/v1/maps/eta/v1/direction?' + params, {
  headers: { 'Authorization': 'Bearer bm_your_api_key_here' }
});
const data = await response.json();
```

**Multi-stop example** (4 waypoints with toll avoidance):
```js
const params = new URLSearchParams();
params.append('coordinates', '103.8198,1.3521');
params.append('coordinates', '103.7767,1.2921');
params.append('coordinates', '103.8454,1.3146');
params.append('coordinates', '103.8000,1.3000');
params.set('profile', 'driving');
params.set('overview', 'full');
params.set('avoid', 'tolls');
```

**Response shape**:
```json
{
  "code": "ok",
  "waypoints": [
    { "hint": "", "distance": 548.073, "name": "", "location": [1.355168, 103.823657] }
  ],
  "routes": [
    {
      "distance": 14635.232,
      "duration": 1557,
      "geometry": "_yuqAqq{_eE...(encoded polyline6)",
      "legs": [
        { "distance": 14635.232, "duration": 1557 }
      ],
      "fee": { "amount": 0, "currency": "" },
      "traffic_light": 0
    }
  ]
}
```

**Units**: `distance` = meters, `duration` = seconds.

---

### 3.6 Other Endpoints

| Method | Path                                    | Notes                                |
|--------|-----------------------------------------|--------------------------------------|
| `GET`  | `/api/v1/coverage-tiles/{x}/{y}/{z}.png` | Coverage tiles                       |
| `POST` | `/api/v1/map-issues/report`             | Report map issues                    |
| `POST` | `/api/v1/sessions/waypoints`            | Save waypoint session                |
| `POST` | `/api/v1/sessions/routes`               | Save route session                   |
| `GET`  | `/api/v1/sessions/waypoints/{sessionId}` | Load waypoint session               |
| `GET`  | `/api/v1/sessions/routes/{sessionId}`    | Load route session                  |

---

## 4. GrabMaps JavaScript Library (`grab-maps`)

### 4.1 Include via CDN

```html
<script type="module" src="https://maps.grab.com/developer/assets/js/grabmaps.es.js"></script>
```

Must use `type="module"`. Also requires MapLibre GL JS (`maplibre-gl`) and its CSS.

### 4.2 Integration Levels

| Level              | Entry                                         | Use case                   |
|--------------------|-----------------------------------------------|----------------------------|
| Composable API     | `GrabMapsBuilder` -> `GrabMapsClient` -> builders | Custom UIs              |
| All-in-one widget  | `GrabMapsLib` + options                        | Search, routing, layers    |
| Minimal embed      | `embed.ts`                                     | Map-only embed             |
| Plain MapLibre     | `maplibregl` + style fetch                     | Full control via MapLibre  |

### 4.3 GrabMapsBuilder (Composable API)

```js
const client = new window.GrabMaps.GrabMapsBuilder()
  .setBaseUrl('https://maps.grab.com')
  .setApiKey(import.meta.env.VITE_BRAGMAPS_KEY)
  .build();

const map = new window.GrabMaps.MapBuilder(client)
  .setContainer('map')
  .setCenter([103.8198, 1.3521])
  .setZoom(12)
  .enableNavigation()
  .enableLabels()
  .enableBuildings()
  .enableAttribution()
  .build();
```

Reuse one `client` for multiple builders to avoid redundant auth handshakes.

### 4.4 Client Services

After `GrabMapsBuilder().build()`:

| Service           | Role                                  |
|-------------------|---------------------------------------|
| `client.api`      | Low-level GET/POST/DELETE with auth   |
| `client.search`   | POI search, nearby, reverse geocode   |
| `client.routing`  | Directions / waypoints                |

### 4.5 Available Builders

`MapBuilder`, `SearchBuilder`, `RouteBuilder`, `RoutingIntegrationBuilder`, `PolygonBuilder`, `CircleBuilder`, `WaypointBuilder`, `PinBuilder`, `StyleBuilder`, `GeocodingBuilder`, `ControlsBuilder`, `NearbyBuilder`.

### 4.6 GrabMapsLib (All-in-One Widget)

```js
const lib = new GrabMapsLib({
  container: 'map',
  apiKey: '<API_KEY>',
  baseUrl: 'https://maps.grab.com',
  viewport: { lat: 1.3521, lng: 103.8198, zoom: 12 },
  navigation: true,
  attribution: true,
  buildings: true,
  labels: true,
  showSearchBar: true,
  showWaypointsModal: true,
  showLayersMenu: true
});
```

**Key methods**: `getMap()`, `getClient()`, `onReady()`, `flyTo()`, `openPOI()`, `searchPlaces()`, `setLayerVisibility()`, `calculateWaypointRoute()`, `clearRoute()`, `clearWaypoints()`, `destroy()`.

### 4.7 Get Routes via Library

```js
const route = await client.routing.getRoute(
  [1.3521, 103.8198],   // [lat, lng] start
  [1.2921, 103.7767],   // [lat, lng] end
  { mode: 'car' }
);
```

### 4.8 Composable Search + Map

```js
const client = new GrabMapsBuilder().setBaseUrl(baseUrl).setApiKey(key).build();
const map = new MapBuilder(client).setContainer('map').enableAttribution().build();
const search = new SearchBuilder(client)
  .setContainer('search-box')
  .onPlaceSelected((place) => map.flyTo([place.lng, place.lat], 16))
  .build();
```

### 4.9 Map Options

| Option              | Description                                    |
|---------------------|------------------------------------------------|
| `center`            | `[lng, lat]` starting viewport                 |
| `zoom`              | 0-22. SEA city zooms: 10-15                    |
| `pitch`             | 0-60. Use 45 for hero scenes                   |
| `bearing`           | Rotate to match marketing shots                |
| `minZoom` / `maxZoom` | Clamp user exploration area                  |
| `maxBounds`         | Restrict panning to a bounding box             |

---

## 5. MCP Integration (for AI Assistants)

### 5.1 Configuration

Add to Claude Desktop or Cursor MCP config:

```json
{
  "mcpServers": {
    "grab-maps-playground": {
      "url": "https://maps.grab.com/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### 5.2 MCP Tools

| Tool              | Purpose                        | Parameters                           |
|-------------------|--------------------------------|--------------------------------------|
| `search_places`   | Search places by name/category | `query`, `lat`, `lon`, `radius`      |
| `get_directions`  | Calculate routes               | `origin`, `destination`, `waypoints` |
| `nearby_search`   | Find nearby POIs               | `lat`, `lon`, `radius`, `category`   |

---

## 6. SEA Coverage

High-frequency updates across: **Singapore**, **Manila**, **Jakarta**, **Kuala Lumpur**, and more — 700+ cities in 8 countries.

## 7. Attribution Requirements

Required on all map implementations:

```
© Grab | © OpenStreetMap contributors
```

Use `enableAttribution()` in the builder or add the MapLibre attribution control manually.

## 8. Constraints & Best Practices

- **Map style**: Always fetch via `GET /api/style.json` with Bearer header. Do NOT use `?key=` query params.
- **POI search**: Adding reference `location` improves relevance.
- **Nearby V2**: Radius is in **kilometres**, not meters.
- **Directions**: Default coordinate order is `lng,lat`. Use `lat_first=true` for `lat,lng`.
- **Directions**: Use `overview=full` when you need geometry for map rendering.
- **Duration**: Returned in seconds. **Distance**: Returned in meters.
- **API keys**: Keep in server-side code or env vars. Rotate keys that hit client bundles.
- **Client reuse**: Reuse one `GrabMapsClient` across multiple builders.
