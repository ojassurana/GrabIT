"use client";

import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("grabit_token");
    localStorage.removeItem("grabit_user_id");
    localStorage.removeItem("grabit_username");
    router.push("/");
  };

  const username = typeof window !== "undefined" ? localStorage.getItem("grabit_username") : null;

  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between px-6 py-4"
      style={{ background: "rgba(250, 247, 242, 0.85)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="text-xl font-bold tracking-tight cursor-pointer"
        style={{ fontFamily: "var(--font-display)" }}
        onClick={() => router.push("/home")}
      >
        GrabIT
      </div>
      <div className="flex items-center gap-4">
        {username && (
          <span className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            {username}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm font-semibold px-4 py-2 rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95"
          style={{
            background: "var(--card)",
            border: "1.5px solid var(--border)",
            color: "var(--fg)",
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
