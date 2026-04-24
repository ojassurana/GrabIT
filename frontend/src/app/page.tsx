"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("grabit_token");
    if (token) {
      router.push("/interests");
      return;
    }
    setLoaded(true);
  }, [router]);

  if (!loaded) return null;

  return (
    <div className="noise min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background blobs */}
      <div
        className="absolute top-[-20%] right-[-15%] w-[500px] h-[500px] rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full opacity-15 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--warm) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 flex flex-col items-center gap-3 animate-slide-up">
        {/* Logo mark */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-2"
          style={{ background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)" }}
        >
          G
        </div>

        <h1
          className="text-5xl md:text-6xl tracking-tight text-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          GrabIT
        </h1>
        <p className="text-lg text-center max-w-xs" style={{ color: "var(--muted)" }}>
          Your travel companion across Southeast Asia
        </p>
      </div>

      <div className="relative z-10 flex flex-col gap-3 mt-12 w-full max-w-xs animate-slide-up" style={{ animationDelay: "200ms" }}>
        <button
          onClick={() => router.push("/signup")}
          className="w-full h-14 rounded-2xl text-white font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          style={{ background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)", boxShadow: "0 4px 20px rgba(0, 177, 79, 0.3)" }}
        >
          Get Started
        </button>
        <button
          onClick={() => router.push("/signup?mode=login")}
          className="w-full h-14 rounded-2xl font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          style={{ background: "var(--card)", border: "1.5px solid var(--border)", color: "var(--fg)" }}
        >
          I already have an account
        </button>
      </div>

      <p className="relative z-10 mt-8 text-xs" style={{ color: "var(--muted)" }}>
        Powered by GrabMaps
      </p>
    </div>
  );
}
