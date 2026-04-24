"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "https://grabit-backend-33a815d5fa2c.herokuapp.com";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLogin, setIsLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get("mode") === "login") setIsLogin(true);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isLogin ? "/auth/login" : "/auth/signup";
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Something went wrong");

      localStorage.setItem("grabit_token", data.token);
      localStorage.setItem("grabit_user_id", data.user_id);
      localStorage.setItem("grabit_username", data.username);

      router.push("/interests");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="noise min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute top-[-25%] left-[-10%] w-[450px] h-[450px] rounded-full opacity-15 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 w-full max-w-sm animate-slide-up">
        <button
          onClick={() => router.push("/")}
          className="mb-8 text-sm font-medium flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-70"
          style={{ color: "var(--muted)" }}
        >
          ← Back
        </button>

        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
          {isLogin
            ? "Sign in to continue your journey"
            : "Start exploring Southeast Asia your way"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full h-13 px-4 rounded-xl text-base outline-none transition-all focus:ring-2"
              style={{
                background: "var(--card)",
                border: "1.5px solid var(--border)",
                color: "var(--fg)",
              }}
              placeholder="Choose a username"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full h-13 px-4 rounded-xl text-base outline-none transition-all focus:ring-2"
              style={{
                background: "var(--card)",
                border: "1.5px solid var(--border)",
                color: "var(--fg)",
              }}
              placeholder="Create a password"
            />
          </div>

          {error && (
            <p className="text-sm font-medium px-1" style={{ color: "#ef4444" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 rounded-2xl text-white font-semibold text-base mt-2 transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)",
              boxShadow: "0 4px 20px rgba(0, 177, 79, 0.3)",
            }}
          >
            {loading ? "Hold on..." : isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-sm text-center mt-6" style={{ color: "var(--muted)" }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="font-semibold cursor-pointer underline underline-offset-2"
            style={{ color: "var(--accent)" }}
          >
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
