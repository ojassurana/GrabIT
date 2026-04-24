"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import Header from "@/components/Header";

declare global {
  interface Window {
    GrabMaps: any;
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
  const map = useRef<maplibregl.Map | null>(null);
  const circleLayerAdded = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

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

  // Init map using GrabMaps library
  useEffect(() => {
    if (!loaded || !mapContainer.current || map.current) return;
    if (userLat === null || userLng === null) return;

    const waitForGrabMaps = () => {
      if (window.GrabMaps) {
        const client = new window.GrabMaps.GrabMapsBuilder()
          .setBaseUrl("https://maps.grab.com")
          .setApiKey(GRABMAPS_KEY)
          .build();

        const grabMap = new window.GrabMaps.MapBuilder(client)
          .setContainer(mapContainer.current!.id || "grab-map")
          .setCenter([userLng, userLat])
          .setZoom(12)
          .enableNavigation()
          .enableLabels()
          .enableBuildings()
          .enableAttribution()
          .build();

        // Get the underlying MapLibre map instance
        const mlMap = grabMap.getMap ? grabMap.getMap() : grabMap;
        map.current = mlMap;

        mlMap.on("load", () => {
          setMapReady(true);
        });

        // If the map is already loaded
        if (mlMap.loaded && mlMap.loaded()) {
          setMapReady(true);
        }
      } else {
        setTimeout(waitForGrabMaps, 200);
      }
    };

    waitForGrabMaps();

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [loaded, userLat, userLng]);

  // Update user marker
  useEffect(() => {
    if (!map.current || userLat === null || userLng === null) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLng, userLat]);
    } else {
      const el = document.createElement("div");
      el.innerHTML = `<div style="width:16px;height:16px;background:#00b14f;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`;
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLng, userLat])
        .addTo(map.current);
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
      (map.current.getSource("radius-circle") as maplibregl.GeoJSONSource)?.setData(geojson);
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

  // Clear markers
  const clearMarkers = () => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    popupRef.current?.remove();
  };

  // Add result markers
  const addMarkers = (pois: POIResult[]) => {
    if (!map.current) return;
    clearMarkers();

    pois.forEach((poi, i) => {
      const el = document.createElement("div");
      el.innerHTML = `<div class="poi-pin" data-poi="${poi.name}" style="
        width:28px;height:28px;border-radius:50%;
        background:${selectedCategory === "food" ? "#f97316" : "#00b14f"};
        border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:12px;font-weight:700;cursor:pointer;
      ">${poi.rank}</div>`;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([poi.lng, poi.lat])
        .addTo(map.current!);

      el.querySelector(".poi-pin")!.addEventListener("click", (e) => {
        e.stopPropagation();
        popupRef.current?.remove();
        const popup = new maplibregl.Popup({ offset: 20, closeButton: false })
          .setLngLat([poi.lng, poi.lat])
          .setHTML(`
            <div style="font-family:var(--font-body);padding:4px;">
              <div style="font-weight:600;font-size:13px;">${poi.name}</div>
              <div style="font-size:11px;color:#6b7280;margin-top:2px;">
                ${poi.eta_minutes ? `${poi.eta_minutes} min` : ""} · ${poi.distance_km} km
              </div>
            </div>
          `)
          .addTo(map.current!);
        popupRef.current = popup;
        setHighlightedPoi(poi.name);
        setDrawerOpen(true);
      });

      // Animate pin drop
      el.style.transform = "translateY(-20px)";
      el.style.opacity = "0";
      el.style.transition = "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
      setTimeout(() => {
        el.style.transform = "translateY(0)";
        el.style.opacity = "1";
      }, i * 80);

      markersRef.current.push(marker);
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
          <div ref={mapContainer} id="grab-map" className="absolute inset-0" />

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
          {!showCategoryPicker && results.length === 0 && !searching && (
            <button
              onClick={() => setShowCategoryPicker(true)}
              className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 h-12 px-8 rounded-2xl text-white font-semibold text-sm cursor-pointer transition-all hover:scale-105 active:scale-95"
              style={{
                background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)",
                boxShadow: "0 4px 20px rgba(0, 177, 79, 0.4)",
              }}
            >
              Discover Places
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

        {/* Results panel — desktop: right side, mobile: bottom drawer */}
        <div
          className={`
            fixed bottom-0 left-0 right-0 z-30
            md:static md:w-[380px] md:min-h-0 md:border-l
            transition-transform duration-300 ease-out
            ${drawerOpen ? "translate-y-0" : "translate-y-[calc(100%-48px)]"}
            md:translate-y-0
          `}
          style={{
            background: "var(--bg)",
            borderColor: "var(--border)",
            maxHeight: "45vh",
            borderTopLeftRadius: "20px",
            borderTopRightRadius: "20px",
          }}
        >
          {/* Drawer handle (mobile) */}
          <div
            className="md:hidden flex justify-center py-2 cursor-pointer"
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            <div className="w-10 h-1 rounded-full" style={{ background: "var(--border)" }} />
          </div>

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
          <div className="overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ maxHeight: "calc(45vh - 100px)" }}>
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
