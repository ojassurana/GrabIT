"use client";

import { Suspense, useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";

declare global {
  interface Window {
    GrabMapsLib: any;
  }
}

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://grabit-backend-33a815d5fa2c.herokuapp.com";
const GRABMAPS_KEY = "bm_1776994836_w1Uc7JWZ8lLBhUlnMVjphRoO8f76Hp6E";

interface Notification {
  id: string;
  poi_id: string;
  poi_name: string;
  poi_lat: number;
  poi_lng: number;
  blurb: string;
  eta_minutes: number | null;
  distance_km: number | null;
  notified_at: string;
}

export default function BumblebeePage() {
  return (
    <Suspense>
      <BumblebeeContent />
    </Suspense>
  );
}

function BumblebeeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapLibRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const circleLayerAdded = useRef(false);

  const [loaded, setLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [token, setToken] = useState("");

  // User location
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  // Preferences
  const [enabled, setEnabled] = useState(false);
  const [radiusMode, setRadiusMode] = useState<"distance" | "eta">("distance");
  const [radiusKm, setRadiusKm] = useState(1.0);
  const [etaMinutes, setEtaMinutes] = useState(10);
  const [transportMode, setTransportMode] = useState<"walking" | "driving">("walking");
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Deep-link POI
  const deepLinkPoi = searchParams.get("poi");

  // Auth check
  useEffect(() => {
    const t = localStorage.getItem("grabit_token");
    if (!t) {
      router.push("/signup");
      return;
    }
    setToken(t);
    setUsername(localStorage.getItem("grabit_username") || "");
    setLoaded(true);
  }, [router]);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }), [token]);

  // Load preferences
  useEffect(() => {
    if (!token) return;

    const loadPrefs = async () => {
      try {
        const res = await fetch(`${API}/bumblebee/preferences`, { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          setEnabled(data.enabled);
          setRadiusMode(data.radius_mode);
          setRadiusKm(data.radius_km);
          setEtaMinutes(data.eta_minutes);
          setTransportMode(data.transport_mode);
        }
      } catch {}
    };
    loadPrefs();
  }, [token, authHeaders]);

  // Poll user location + notifications every 15s
  useEffect(() => {
    if (!loaded || !username) return;

    const fetchData = async () => {
      try {
        const [locRes, notifRes] = await Promise.all([
          fetch(`${API}/location/${username}`),
          fetch(`${API}/bumblebee/notifications`, { headers: authHeaders() }),
        ]);
        if (locRes.ok) {
          const data = await locRes.json();
          setUserLat(data.lat);
          setUserLng(data.lng);
        }
        if (notifRes.ok) {
          const data = await notifRes.json();
          setNotifications(data.notifications || []);
        }
      } catch {}
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [loaded, username, authHeaders]);

  // Init map
  useEffect(() => {
    if (!loaded || !mapContainerRef.current || mapRef.current) return;
    if (userLat === null || userLng === null) return;

    const loadAndInit = async () => {
      if (!document.querySelector('script[src*="grabmaps"]')) {
        const script = document.createElement("script");
        script.type = "module";
        script.src = "https://maps.grab.com/developer/assets/js/grabmaps.es.js";
        document.head.appendChild(script);
      }

      const waitForLib = (resolve: () => void) => {
        if (window.GrabMapsLib) resolve();
        else setTimeout(() => waitForLib(resolve), 200);
      };
      await new Promise<void>((resolve) => waitForLib(resolve));

      const lib = new window.GrabMapsLib({
        container: "bumblebee-map",
        apiKey: GRABMAPS_KEY,
        baseUrl: "https://maps.grab.com",
        lat: userLat,
        lng: userLng,
        zoom: 14,
        navigation: true,
        attribution: true,
        buildings: true,
        labels: true,
      });

      mapLibRef.current = lib;

      lib.onReady(() => {
        const mlMap = lib.getMap();
        mapRef.current = mlMap;
        setMapReady(true);
      });
    };

    loadAndInit();

    return () => {
      if (mapLibRef.current?.destroy) mapLibRef.current.destroy();
      mapRef.current = null;
      mapLibRef.current = null;
    };
  }, [loaded, userLat, userLng]);

  // Update user marker + radius circle
  useEffect(() => {
    if (!mapRef.current || userLat === null || userLng === null) return;
    const map = mapRef.current;

    // User marker
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLng, userLat]);
    } else {
      // Dynamic import maplibregl
      import("maplibre-gl").then((maplibregl) => {
        const el = document.createElement("div");
        el.innerHTML = `<div style="width:16px;height:16px;background:#f97316;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`;
        userMarkerRef.current = new maplibregl.default.Marker({ element: el })
          .setLngLat([userLng, userLat])
          .addTo(map);
      });
    }

    // Radius circle
    const radiusInKm = radiusMode === "distance" ? radiusKm : etaMinutes * 0.7;
    const circleGeoJSON = createCircleGeoJSON(userLat, userLng, radiusInKm);

    if (map.getSource("radius-circle")) {
      (map.getSource("radius-circle") as any).setData(circleGeoJSON);
    } else if (map.isStyleLoaded()) {
      map.addSource("radius-circle", { type: "geojson", data: circleGeoJSON });
      map.addLayer({
        id: "radius-circle-fill",
        type: "fill",
        source: "radius-circle",
        paint: { "fill-color": "#f97316", "fill-opacity": 0.08 },
      });
      map.addLayer({
        id: "radius-circle-border",
        type: "line",
        source: "radius-circle",
        paint: { "line-color": "#f97316", "line-width": 2, "line-opacity": 0.4 },
      });
      circleLayerAdded.current = true;
    }
  }, [mapReady, userLat, userLng, radiusKm, etaMinutes, radiusMode]);

  // Update notification pins
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    import("maplibre-gl").then((maplibregl) => {
      notifications.forEach((n) => {
        const el = document.createElement("div");
        el.innerHTML = `<div style="width:28px;height:28px;background:#f97316;border:2.5px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(249,115,22,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer;"><span style="font-size:12px;">📍</span></div>`;
        el.style.cursor = "pointer";

        const popup = new maplibregl.default.Popup({ offset: 20, maxWidth: "260px" }).setHTML(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif;padding:4px;">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${n.poi_name}</div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">📍 ${n.distance_km?.toFixed(1) ?? "?"} km · ${n.eta_minutes ? n.eta_minutes.toFixed(0) + " min" : "nearby"}</div>
            <div style="font-size:12px;color:#f97316;font-style:italic;">${n.blurb}</div>
          </div>
        `);

        const marker = new maplibregl.default.Marker({ element: el })
          .setLngLat([n.poi_lng, n.poi_lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);

        // Deep-link: fly to this POI and open popup
        if (deepLinkPoi && n.poi_id === deepLinkPoi) {
          map.flyTo({ center: [n.poi_lng, n.poi_lat], zoom: 16, duration: 1500 });
          setTimeout(() => marker.togglePopup(), 1600);
        }
      });
    });
  }, [notifications, mapReady, deepLinkPoi]);

  // Save preferences
  const savePrefs = async (overrides: Partial<{
    enabled: boolean;
    radius_mode: string;
    radius_km: number;
    eta_minutes: number;
    transport_mode: string;
  }> = {}) => {
    setSaving(true);
    try {
      await fetch(`${API}/bumblebee/preferences`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          enabled: overrides.enabled ?? enabled,
          radius_mode: overrides.radius_mode ?? radiusMode,
          radius_km: overrides.radius_km ?? radiusKm,
          eta_minutes: overrides.eta_minutes ?? etaMinutes,
          transport_mode: overrides.transport_mode ?? transportMode,
        }),
      });
    } catch {}
    setSaving(false);
  };

  // Toggle enabled
  const toggleEnabled = async () => {
    const newVal = !enabled;
    setEnabled(newVal);
    if (newVal) setNotifications([]);
    await savePrefs({ enabled: newVal });
  };

  if (!loaded) return null;

  return (
    <div className="noise min-h-screen flex flex-col relative overflow-hidden">
      <Header />

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-4xl mx-auto px-4 pt-4 pb-6">
        {/* Title bar */}
        <div className="flex items-center gap-3 mb-4 animate-slide-up">
          <button
            onClick={() => router.push("/home")}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 cursor-pointer"
            style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-2xl tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Bumblebee
            </h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Passive discovery as you roam
            </p>
          </div>
          {/* Status indicator */}
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{
                background: enabled ? "#00b14f" : "#d1d5db",
                boxShadow: enabled ? "0 0 8px rgba(0,177,79,0.5)" : "none",
              }}
            />
            <span className="text-xs font-medium" style={{ color: enabled ? "#00b14f" : "var(--muted)" }}>
              {enabled ? "Active" : "Off"}
            </span>
          </div>
        </div>

        {/* Settings panel */}
            <div
              className="rounded-2xl p-4 mb-4 animate-slide-up"
              style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
            >
              {/* Enable toggle */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold">Enable Bumblebee</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Get Telegram alerts when interesting places are nearby
                  </p>
                </div>
                <button
                  onClick={toggleEnabled}
                  className="relative w-12 h-7 rounded-full transition-all duration-300 cursor-pointer"
                  style={{ background: enabled ? "#f97316" : "#d1d5db" }}
                >
                  <div
                    className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-300"
                    style={{ left: enabled ? "22px" : "2px" }}
                  />
                </button>
              </div>

              <div className="h-px mb-4" style={{ background: "var(--border)" }} />

              {/* Radius mode */}
              <div className="mb-4">
                <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Radius mode
                </p>
                <div className="flex gap-2">
                  {(["distance", "eta"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setRadiusMode(mode);
                        savePrefs({ radius_mode: mode });
                      }}
                      className="flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer"
                      style={{
                        background: radiusMode === mode ? "#f97316" : "var(--bg)",
                        color: radiusMode === mode ? "white" : "var(--fg)",
                        border: `1.5px solid ${radiusMode === mode ? "#f97316" : "var(--border)"}`,
                      }}
                    >
                      {mode === "distance" ? "Distance (km)" : "ETA (min)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Radius slider */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                    {radiusMode === "distance" ? "Radius" : "Max ETA"}
                  </p>
                  <span className="text-sm font-bold" style={{ color: "#f97316" }}>
                    {radiusMode === "distance" ? `${radiusKm.toFixed(1)} km` : `${etaMinutes} min`}
                  </span>
                </div>
                <input
                  type="range"
                  min={radiusMode === "distance" ? 0.5 : 1}
                  max={radiusMode === "distance" ? 10 : 30}
                  step={radiusMode === "distance" ? 0.5 : 1}
                  value={radiusMode === "distance" ? radiusKm : etaMinutes}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (radiusMode === "distance") setRadiusKm(val);
                    else setEtaMinutes(val);
                  }}
                  onMouseUp={() => savePrefs()}
                  onTouchEnd={() => savePrefs()}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-[10px]" style={{ color: "var(--muted)" }}>
                  <span>{radiusMode === "distance" ? "500m" : "1 min"}</span>
                  <span>{radiusMode === "distance" ? "10 km" : "30 min"}</span>
                </div>
              </div>

              {/* Transport mode */}
              <div>
                <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                  Transport
                </p>
                <div className="flex gap-2">
                  {(["walking", "driving"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => {
                        setTransportMode(mode);
                        savePrefs({ transport_mode: mode });
                      }}
                      className="flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer"
                      style={{
                        background: transportMode === mode ? "#f97316" : "var(--bg)",
                        color: transportMode === mode ? "white" : "var(--fg)",
                        border: `1.5px solid ${transportMode === mode ? "#f97316" : "var(--border)"}`,
                      }}
                    >
                      {mode === "walking" ? "🚶 Walking" : "🚗 Driving"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Map */}
            <div
              className="rounded-2xl overflow-hidden mb-4 animate-fade-in"
              style={{ border: "1.5px solid var(--border)", height: "350px" }}
            >
              <div id="bumblebee-map" ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
              {!mapReady && (
                <div className="flex items-center justify-center h-full" style={{ background: "var(--bg)" }}>
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs" style={{ color: "var(--muted)" }}>Loading map...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Notification feed */}
            <div
              className="rounded-2xl p-4 animate-slide-up"
              style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">Recent discoveries</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--warm-light)", color: "#c2410c" }}>
                  {notifications.length}
                </span>
              </div>
              {notifications.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-3xl mb-2">🐝</p>
                  <p className="text-sm" style={{ color: "var(--muted)" }}>
                    {enabled
                      ? "Scanning nearby... discoveries will appear here"
                      : "Enable Bumblebee to start discovering"}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (mapRef.current) {
                          mapRef.current.flyTo({ center: [n.poi_lng, n.poi_lat], zoom: 16, duration: 1000 });
                          // Open the matching marker popup
                          const marker = markersRef.current.find((m) => {
                            const lngLat = m.getLngLat();
                            return Math.abs(lngLat.lng - n.poi_lng) < 0.0001 && Math.abs(lngLat.lat - n.poi_lat) < 0.0001;
                          });
                          if (marker && !marker.getPopup().isOpen()) {
                            setTimeout(() => marker.togglePopup(), 1100);
                          }
                        }
                      }}
                      className="flex items-start gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: "#fff3e6" }}>
                        <span className="text-sm">📍</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{n.poi_name}</p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          {n.distance_km?.toFixed(1) ?? "?"} km · {n.eta_minutes ? `${n.eta_minutes.toFixed(0)} min` : "nearby"}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "#f97316", fontStyle: "italic" }}>
                          {n.blurb}
                        </p>
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: "var(--muted)" }}>
                        {formatTimeAgo(n.notified_at)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
      </div>
    </div>
  );
}

// --- Helpers ---

function createCircleGeoJSON(lat: number, lng: number, radiusKm: number) {
  const points = 64;
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const newLat = lat + (dy / 111.32);
    const newLng = lng + (dx / (111.32 * Math.cos((lat * Math.PI) / 180)));
    coords.push([newLng, newLat]);
  }
  return {
    type: "Feature" as const,
    geometry: { type: "Polygon" as const, coordinates: [coords] },
    properties: {},
  };
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
