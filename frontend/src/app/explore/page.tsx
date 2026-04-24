"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

declare global {
  interface Window {
    GrabMaps: any;
    GrabMapsLib: any;
  }
}

const API = process.env.NEXT_PUBLIC_API_URL || "https://grabit-backend-33a815d5fa2c.herokuapp.com";
const GRABMAPS_KEY = "bm_1776994836_w1Uc7JWZ8lLBhUlnMVjphRoO8f76Hp6E";

interface POIResult {
  rank: number;
  name: string;
  blurb: string;
  score: number;
  lat: number;
  lng: number;
  distance_km: number;
  eta_minutes: number | null;
  eta_distance_m: number | null;
  address: string;
  category: string;
  business_type: string;
}

export default function ExplorePage() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const circleLayerAdded = useRef(false);

  const [loaded, setLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(3);
  const [results, setResults] = useState<POIResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<"food" | "activities" | null>(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [transportMode, setTransportMode] = useState<"driving" | "walking">("driving");
  const [k, setK] = useState(5);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedPoi, setHighlightedPoi] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Auth check
  useEffect(() => {
    const token = localStorage.getItem("grabit_token");
    if (!token) {
      router.push("/signup");
      return;
    }
    setLoaded(true);
  }, [router]);

  // Poll user location
  useEffect(() => {
    if (!loaded) return;
    const username = localStorage.getItem("grabit_username");
    if (!username) return;

    const fetchLocation = async () => {
      try {
        const res = await fetch(`${API}/location/${username}`);
        if (res.ok) {
          const data = await res.json();
          setUserLat(data.lat);
          setUserLng(data.lng);
        }
      } catch {}
    };

    fetchLocation();
    const interval = setInterval(fetchLocation, 1000);
    return () => clearInterval(interval);
  }, [loaded]);

  const mapInited = useRef(false);

  // Init map ONCE using GrabMapsLib (all-in-one widget)
  useEffect(() => {
    if (!loaded || !mapContainer.current || mapInited.current) return;
    if (userLat === null || userLng === null) return;
    mapInited.current = true;

    const loadAndInit = async () => {
      // Load GrabMaps script dynamically
      if (!document.querySelector('script[src*="grabmaps"]')) {
        const script = document.createElement("script");
        script.type = "module";
        script.src = "https://maps.grab.com/developer/assets/js/grabmaps.es.js";
        document.head.appendChild(script);
      }

      // Wait for GrabMapsLib to be available
      const waitForLib = (resolve: () => void) => {
        if (window.GrabMapsLib) {
          resolve();
        } else {
          setTimeout(() => waitForLib(resolve), 200);
        }
      };
      await new Promise<void>((resolve) => waitForLib(resolve));

      const lib = new window.GrabMapsLib({
        container: "grab-map",
        apiKey: GRABMAPS_KEY,
        baseUrl: "https://maps.grab.com",
        viewport: { lat: userLat, lng: userLng, zoom: 13 },
        navigation: true,
        attribution: true,
        buildings: true,
        labels: true,
      });

      // Poll for the real MapLibre map via grabMapsInstance.mapInstance.getMap()
      const pollMap = () => {
        const instance = (window as any).grabMapsInstance;
        const realMap = instance?.mapInstance?.getMap?.();
        console.log("[GrabIT] polling for map...", !!realMap, realMap?.getContainer ? "has getContainer" : "no getContainer");
        if (realMap?.getContainer) {
          map.current = realMap;
          console.log("[GrabIT] map.current set, calling setMapReady(true)");
          setMapReady(true);
          return;
        }
        setTimeout(pollMap, 300);
      };
      setTimeout(pollMap, 500);
    };

    loadAndInit();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, userLat, userLng]);

  // Update user marker via GeoJSON source — moves when location changes
  useEffect(() => {
    if (!map.current || !mapReady || userLat === null || userLng === null) return;

    const geojson: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [userLng, userLat] },
    };

    if (map.current.getSource("user-location")) {
      (map.current.getSource("user-location") as any).setData(geojson);
    } else {
      map.current.addSource("user-location", { type: "geojson", data: geojson });
      // Outer pulse ring
      map.current.addLayer({
        id: "user-pulse",
        type: "circle",
        source: "user-location",
        paint: {
          "circle-radius": 18,
          "circle-color": "#00b14f",
          "circle-opacity": 0.15,
        },
      });
      // Inner dot
      map.current.addLayer({
        id: "user-dot",
        type: "circle",
        source: "user-location",
        paint: {
          "circle-radius": 7,
          "circle-color": "#00b14f",
          "circle-stroke-width": 3,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, [userLat, userLng, mapReady]);

  // Update circle overlay
  const updateCircle = useCallback(() => {
    if (!map.current || !mapReady || userLat === null || userLng === null) return;

    const points = 64;
    const coords: [number, number][] = [];
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const dx = (radius / 111.32) * Math.cos(angle);
      const dy = (radius / (111.32 * Math.cos(userLat * (Math.PI / 180)))) * Math.sin(angle);
      coords.push([userLng + dy, userLat + dx]);
    }

    const geojson: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [coords] },
    };

    if (circleLayerAdded.current) {
      (map.current.getSource("radius-circle") as any)?.setData(geojson);
    } else {
      map.current.addSource("radius-circle", { type: "geojson", data: geojson });
      map.current.addLayer({
        id: "radius-fill",
        type: "fill",
        source: "radius-circle",
        paint: { "fill-color": "#00b14f", "fill-opacity": 0.06 },
      });
      map.current.addLayer({
        id: "radius-border",
        type: "line",
        source: "radius-circle",
        paint: { "line-color": "#00b14f", "line-width": 2, "line-opacity": 0.4 },
      });
      circleLayerAdded.current = true;
    }
  }, [radius, userLat, userLng, mapReady]);

  useEffect(() => {
    updateCircle();
  }, [updateCircle]);

  // POI click handler ref to avoid stale closures
  const poiClickHandlerRef = useRef<((e: any) => void) | null>(null);

  // Add result markers as GeoJSON layer
  const addMarkers = (pois: POIResult[]) => {
    if (!map.current) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: pois.map((poi) => ({
        type: "Feature" as const,
        properties: {
          name: poi.name,
          rank: poi.rank,
          eta_minutes: poi.eta_minutes,
          distance_km: poi.distance_km,
        },
        geometry: { type: "Point" as const, coordinates: [poi.lng, poi.lat] },
      })),
    };

    // Remove old layer/source if exists
    if (map.current.getLayer("poi-labels")) map.current.removeLayer("poi-labels");
    if (map.current.getLayer("poi-circles")) map.current.removeLayer("poi-circles");
    if (map.current.getSource("poi-results")) map.current.removeSource("poi-results");
    if (poiClickHandlerRef.current) {
      map.current.off("click", "poi-circles", poiClickHandlerRef.current);
    }

    map.current.addSource("poi-results", { type: "geojson", data: geojson });
    map.current.addLayer({
      id: "poi-circles",
      type: "circle",
      source: "poi-results",
      paint: {
        "circle-radius": 14,
        "circle-color": selectedCategory === "food" ? "#f97316" : "#00b14f",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
    map.current.addLayer({
      id: "poi-labels",
      type: "symbol",
      source: "poi-results",
      layout: {
        "text-field": ["get", "rank"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });

    // Click handler for POI circles
    const handler = (e: any) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const { name, eta_minutes, distance_km } = feature.properties;
      const [lng, lat] = feature.geometry.coordinates;

      // Show popup
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div style="font-family:var(--font-body);padding:4px;">
          <div style="font-weight:600;font-size:13px;">${name}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">
            ${eta_minutes ? `${eta_minutes} min` : ""} · ${distance_km} km
          </div>
        </div>
      `;

      // Remove old popup
      const existingPopups = document.querySelectorAll(".maplibregl-popup");
      existingPopups.forEach((p) => p.remove());

      // Create popup using map's internal popup mechanism
      const popupContainer = document.createElement("div");
      popupContainer.className = "maplibregl-popup maplibregl-popup-anchor-bottom";
      popupContainer.style.cssText = `position:absolute;z-index:999;pointer-events:auto;`;
      const point = map.current!.project([lng, lat]);
      popupContainer.style.left = `${point.x}px`;
      popupContainer.style.top = `${point.y - 20}px`;
      popupContainer.style.transform = "translate(-50%, -100%)";
      popupContainer.innerHTML = `
        <div style="background:white;border-radius:8px;padding:8px 12px;box-shadow:0 2px 12px rgba(0,0,0,0.15);font-family:var(--font-body);">
          <div style="font-weight:600;font-size:13px;">${name}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">
            ${eta_minutes ? `${eta_minutes} min` : ""} · ${distance_km} km
          </div>
        </div>
      `;
      map.current!.getContainer().appendChild(popupContainer);

      setHighlightedPoi(name);
      setDrawerOpen(true);
    };

    map.current.on("click", "poi-circles", handler);
    poiClickHandlerRef.current = handler;

    // Change cursor on hover
    map.current.on("mouseenter", "poi-circles", () => {
      if (map.current) map.current.getCanvas().style.cursor = "pointer";
    });
    map.current.on("mouseleave", "poi-circles", () => {
      if (map.current) map.current.getCanvas().style.cursor = "";
    });
  };

  // Search
  const handleSearch = async (category: "food" | "activities") => {
    const token = localStorage.getItem("grabit_token");
    if (!token) return;

    setSearching(true);
    setSelectedCategory(category);
    setShowCategoryPicker(false);
    setDrawerOpen(true);
    setResults([]);

    try {
      const body: Record<string, unknown> = {
        category,
        radius_km: radius,
        transport_mode: transportMode,
        k,
      };
      if (searchQuery.trim()) {
        body.custom_query = searchQuery.trim();
      }

      const res = await fetch(`${API}/explore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok) {
        setResults(data.results || []);
        addMarkers(data.results || []);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const scrollToCard = (name: string) => {
    const el = document.getElementById(`poi-card-${name}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedPoi(name);
  };

  const flyToPoi = (poi: POIResult) => {
    if (!map.current) return;
    map.current.flyTo({ center: [poi.lng, poi.lat], zoom: 15, duration: 800 });
    setHighlightedPoi(poi.name);
  };

  if (!loaded) return null;

  return (
    <div className="noise h-screen flex flex-col relative overflow-hidden">
      <Header />

      <div className="flex flex-1 relative min-h-0">
        {/* Map area */}
        <div className="flex-1 relative min-h-0">
          <div ref={mapContainer} id="grab-map" style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }} />

          {/* Floating search bar */}
          <div className="absolute top-4 left-4 right-4 z-10 flex gap-2" style={{ maxWidth: "400px" }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedCategory) handleSearch(selectedCategory);
              }}
              placeholder="Search for something specific..."
              className="flex-1 h-11 px-4 rounded-xl text-sm outline-none"
              style={{
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(12px)",
                border: "1px solid var(--border)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  if (selectedCategory) handleSearch(selectedCategory);
                }}
                className="h-11 px-3 rounded-xl text-xs font-medium cursor-pointer"
                style={{
                  background: "rgba(255,255,255,0.95)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Discover button */}
          {!showCategoryPicker && !searching && (
            <button
              onClick={() => setShowCategoryPicker(true)}
              className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 h-12 px-8 rounded-2xl text-white font-semibold text-sm cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)",
                boxShadow: "0 4px 20px rgba(0, 177, 79, 0.4)",
              }}
            >
              🧭 Discover places based on your profile
            </button>
          )}

          {/* Category picker */}
          {showCategoryPicker && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 flex gap-3">
              <button
                onClick={() => handleSearch("food")}
                className="h-12 px-6 rounded-2xl text-white font-semibold text-sm cursor-pointer transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  boxShadow: "0 4px 20px rgba(249, 115, 22, 0.4)",
                }}
              >
                🍜 Food
              </button>
              <button
                onClick={() => handleSearch("activities")}
                className="h-12 px-6 rounded-2xl text-white font-semibold text-sm cursor-pointer transition-all hover:scale-105 active:scale-95"
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)",
                  boxShadow: "0 4px 20px rgba(0, 177, 79, 0.4)",
                }}
              >
                🏕️ Activities
              </button>
            </div>
          )}

          {/* Radius slider */}
          <div
            className="absolute bottom-4 left-4 right-4 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl md:z-10"
            style={{
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
              maxWidth: "400px",
            }}
          >
            <span className="text-xs font-semibold" style={{ color: "var(--muted)", minWidth: "45px" }}>
              {radius} km
            </span>
            <input
              type="range"
              min="0.5"
              max="20"
              step="0.5"
              value={radius}
              onChange={(e) => setRadius(parseFloat(e.target.value))}
              className="flex-1 accent-[#00b14f]"
            />
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>20 km</span>
          </div>
        </div>

        {/* Results panel — full height right sidebar */}
        <div
          className="w-[380px] border-l flex flex-col"
          style={{
            background: "var(--bg)",
            borderColor: "var(--border)",
          }}
        >

          {/* Panel header */}
          <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2">
              {/* Transport toggle */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <button
                  onClick={() => setTransportMode("driving")}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer ${transportMode === "driving" ? "text-white" : ""}`}
                  style={{
                    background: transportMode === "driving" ? "var(--accent)" : "transparent",
                  }}
                >
                  🚗
                </button>
                <button
                  onClick={() => setTransportMode("walking")}
                  className={`px-3 py-1.5 text-xs font-medium cursor-pointer ${transportMode === "walking" ? "text-white" : ""}`}
                  style={{
                    background: transportMode === "walking" ? "var(--accent)" : "transparent",
                  }}
                >
                  🚶
                </button>
              </div>

              {/* K selector */}
              <select
                value={k}
                onChange={(e) => setK(parseInt(e.target.value))}
                className="text-xs px-2 py-1.5 rounded-lg outline-none cursor-pointer"
                style={{ border: "1px solid var(--border)", background: "var(--card)" }}
              >
                <option value={3}>Top 3</option>
                <option value={5}>Top 5</option>
                <option value={10}>Top 10</option>
              </select>
            </div>

            {/* Re-search button */}
            {selectedCategory && (
              <button
                onClick={() => handleSearch(selectedCategory)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer"
                style={{ background: "var(--accent-light)", color: "var(--accent)" }}
              >
                Refresh
              </button>
            )}
          </div>

          {/* Results list */}
          <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3 flex-1">
            {searching && (
              <>
                {Array.from({ length: k }).map((_, i) => (
                  <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full" style={{ background: "var(--border)" }} />
                      <div className="flex-1">
                        <div className="h-3 rounded w-2/3 mb-2" style={{ background: "var(--border)" }} />
                        <div className="h-2 rounded w-full mb-1" style={{ background: "var(--border)" }} />
                        <div className="h-2 rounded w-1/2" style={{ background: "var(--border)" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {!searching && results.length === 0 && selectedCategory && (
              <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
                No places found. Try increasing the radius.
              </p>
            )}

            {!searching && !selectedCategory && (
              <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
                Tap &quot;Discover Places&quot; to find spots near you.
              </p>
            )}

            {results.map((poi) => (
              <button
                key={poi.name}
                id={`poi-card-${poi.name}`}
                onClick={() => flyToPoi(poi)}
                className="w-full text-left rounded-xl p-4 transition-all duration-200 cursor-pointer hover:scale-[1.01]"
                style={{
                  background: "var(--card)",
                  border: highlightedPoi === poi.name ? "2px solid var(--accent)" : "1px solid var(--border)",
                  boxShadow: highlightedPoi === poi.name ? "0 2px 12px rgba(0, 177, 79, 0.15)" : "none",
                }}
              >
                <div className="flex gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{
                      background: selectedCategory === "food"
                        ? "linear-gradient(135deg, #f97316, #ea580c)"
                        : "linear-gradient(135deg, #00b14f, #009640)",
                    }}
                  >
                    {poi.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">{poi.name}</h3>
                    <p className="text-xs mt-0.5" style={{ color: "var(--accent)" }}>
                      {poi.blurb}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
                      <span>{poi.distance_km} km</span>
                      {poi.eta_minutes && (
                        <span>
                          {transportMode === "driving" ? "🚗" : "🚶"} {poi.eta_minutes} min
                        </span>
                      )}
                      {poi.address && <span className="truncate">{poi.address}</span>}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
