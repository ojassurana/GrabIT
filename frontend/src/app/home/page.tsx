"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

const features = [
  {
    id: "explore",
    title: "Explore Nearby",
    description: "Discover the best spots around you — food, activities, stays",
    badge: "Coming soon",
    gradient: "linear-gradient(135deg, #00b14f 0%, #009640 60%, #007a33 100%)",
    shadowColor: "rgba(0, 177, 79, 0.25)",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        {/* Compass body */}
        <circle cx="24" cy="24" r="20" stroke="white" strokeWidth="2" strokeOpacity="0.3" />
        <circle cx="24" cy="24" r="16" stroke="white" strokeWidth="1.5" strokeOpacity="0.15" />
        {/* Compass needle */}
        <path d="M24 8L27 24L24 40L21 24L24 8Z" fill="white" fillOpacity="0.9" />
        <path d="M24 8L27 24H21L24 8Z" fill="white" />
        <path d="M24 40L27 24H21L24 40Z" fill="white" fillOpacity="0.4" />
        {/* Center dot */}
        <circle cx="24" cy="24" r="3" fill="white" />
        {/* Radiating pulses */}
        <circle cx="24" cy="24" r="22" stroke="white" strokeWidth="0.5" strokeOpacity="0.15" strokeDasharray="3 5" />
      </svg>
    ),
  },
  {
    id: "bumblebee",
    title: "Bumblebee",
    description: "Roam freely — get notified when great places are nearby",
    badge: "Coming soon",
    gradient: "linear-gradient(135deg, #f97316 0%, #ea580c 60%, #c2410c 100%)",
    shadowColor: "rgba(249, 115, 22, 0.25)",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        {/* Bee body */}
        <ellipse cx="24" cy="26" rx="10" ry="12" fill="white" fillOpacity="0.9" />
        {/* Stripes */}
        <rect x="14" y="22" width="20" height="3" rx="1.5" fill="black" fillOpacity="0.15" />
        <rect x="14" y="28" width="20" height="3" rx="1.5" fill="black" fillOpacity="0.15" />
        {/* Wings */}
        <ellipse cx="16" cy="18" rx="6" ry="8" fill="white" fillOpacity="0.4" transform="rotate(-20 16 18)" />
        <ellipse cx="32" cy="18" rx="6" ry="8" fill="white" fillOpacity="0.4" transform="rotate(20 32 18)" />
        {/* Eyes */}
        <circle cx="21" cy="20" r="1.5" fill="black" fillOpacity="0.3" />
        <circle cx="27" cy="20" r="1.5" fill="black" fillOpacity="0.3" />
        {/* Antennae */}
        <path d="M22 15Q20 10 18 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
        <path d="M26 15Q28 10 30 8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
        <circle cx="18" cy="8" r="1.5" fill="white" fillOpacity="0.5" />
        <circle cx="30" cy="8" r="1.5" fill="white" fillOpacity="0.5" />
      </svg>
    ),
  },
  {
    id: "together",
    title: "Together",
    description: "Find the perfect activity to enjoy with your friends",
    badge: "Coming soon",
    gradient: "linear-gradient(135deg, #6366f1 0%, #4f46e5 60%, #4338ca 100%)",
    shadowColor: "rgba(99, 102, 241, 0.25)",
    icon: (
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        {/* Three pins converging */}
        {/* Center pin */}
        <path d="M24 34L24 28" stroke="white" strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="24" cy="24" r="5" fill="white" fillOpacity="0.9" />
        <circle cx="24" cy="24" r="2" fill="white" fillOpacity="0.3" />
        {/* Left pin */}
        <path d="M14 20L18 23" stroke="white" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
        <circle cx="12" cy="18" r="4" fill="white" fillOpacity="0.5" />
        <circle cx="12" cy="18" r="1.5" fill="white" fillOpacity="0.2" />
        {/* Right pin */}
        <path d="M34 20L30 23" stroke="white" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="2 2" />
        <circle cx="36" cy="18" r="4" fill="white" fillOpacity="0.5" />
        <circle cx="36" cy="18" r="1.5" fill="white" fillOpacity="0.2" />
        {/* Encompassing circle */}
        <circle cx="24" cy="22" r="18" stroke="white" strokeWidth="1" strokeOpacity="0.12" strokeDasharray="4 3" />
        {/* Activity sparkle */}
        <path d="M24 10L25 13L28 14L25 15L24 18L23 15L20 14L23 13Z" fill="white" fillOpacity="0.6" />
      </svg>
    ),
  },
];

export default function HomePage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("grabit_token");
    if (!token) {
      router.push("/signup");
      return;
    }
    setUsername(localStorage.getItem("grabit_username") || "Traveller");
    setLoaded(true);
  }, [router]);

  if (!loaded) return null;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="noise min-h-screen flex flex-col relative overflow-hidden">
      <Header />
      {/* Background accents */}
      <div
        className="absolute top-[-15%] right-[-20%] w-[450px] h-[450px] rounded-full opacity-12 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-[-10%] left-[-15%] w-[350px] h-[350px] rounded-full opacity-10 blur-3xl"
        style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }}
      />

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-lg mx-auto px-6 pt-12 pb-8">
        {/* Header */}
        <div className="mb-10 animate-slide-up">
          <p
            className="text-sm font-medium tracking-wide uppercase mb-1"
            style={{ color: "var(--muted)", letterSpacing: "0.08em" }}
          >
            {greeting}
          </p>
          <h1
            className="text-4xl tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {username}
          </h1>
          <p
            className="text-sm mt-2"
            style={{ color: "var(--muted)" }}
          >
            What would you like to do today?
          </p>
        </div>

        {/* Feature cards */}
        <div className="flex flex-row gap-4 stagger overflow-x-auto">
          {features.map((feature, i) => (
            <button
              key={feature.id}
              className="animate-bubble-in group relative flex-1 min-w-0 rounded-3xl p-6 text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer overflow-hidden"
              style={{
                opacity: 0,
                background: feature.gradient,
                boxShadow: `0 8px 32px ${feature.shadowColor}, 0 2px 8px rgba(0,0,0,0.08)`,
                minHeight: "140px",
              }}
              onClick={() => {
                // All coming soon for now
              }}
            >
              {/* Subtle pattern overlay */}
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                  backgroundSize: "24px 24px",
                }}
              />

              {/* Glow on hover */}
              <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-2xl"
                style={{ background: "white" }}
              />

              <div className="relative flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2
                    className="text-xl text-white font-semibold mb-1.5 tracking-tight"
                    style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem" }}
                  >
                    {feature.title}
                  </h2>
                  <p className="text-sm text-white/70 leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Coming soon badge */}
                  <span
                    className="inline-block mt-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                    style={{
                      background: "rgba(239, 68, 68, 0.9)",
                      color: "white",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {feature.badge}
                  </span>
                </div>

                {/* Icon */}
                <div
                  className="flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{
                    background: "rgba(255, 255, 255, 0.12)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {feature.icon}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <p
          className="text-center text-xs mt-8 animate-fade-in"
          style={{ color: "var(--muted)", animationDelay: "500ms", opacity: 0 }}
        >
          Powered by GrabMaps
        </p>
      </div>
    </div>
  );
}
