"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://grabit-backend-33a815d5fa2c.herokuapp.com";

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

  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");

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

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);

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
                  {mode === "walking" ? "Walking" : "Driving"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Live location */}
        <div
          className="rounded-2xl p-4 mb-4 animate-fade-in"
          style={{ background: "var(--card)", border: "1.5px solid var(--border)" }}
        >
          <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            Current location
          </p>
          <div className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{
                background: userLat !== null ? "#00b14f" : "#d1d5db",
                boxShadow: userLat !== null ? "0 0 6px rgba(0,177,79,0.4)" : "none",
              }}
            />
            {userLat !== null && userLng !== null ? (
              <p className="text-sm font-mono" style={{ color: "var(--fg)" }}>
                {userLat.toFixed(6)}, {userLng.toFixed(6)}
              </p>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Waiting for location...
              </p>
            )}
          </div>
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
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 p-3 rounded-xl"
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
