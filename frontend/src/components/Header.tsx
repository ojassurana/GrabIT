"use client";

import { useRouter, usePathname } from "next/navigation";

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== "/home";

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
      <div className="flex items-center gap-2">
        {showBack && (
          <button
            onClick={() => router.push("/home")}
            className="text-sm cursor-pointer transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            ←
          </button>
        )}
        <div
          className="text-xl font-bold tracking-tight cursor-pointer"
          style={{ fontFamily: "var(--font-display)" }}
          onClick={() => router.push("/home")}
        >
          GrabIT
        </div>
      </div>
      <div className="flex items-center gap-4">
        {username && (
          <button
            onClick={() => router.push("/interests")}
            className="text-sm font-medium cursor-pointer transition-all hover:opacity-70 flex items-center gap-1.5"
            style={{ color: "var(--muted)" }}
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, var(--accent) 0%, #009640 100%)" }}
            >
              {username.charAt(0).toUpperCase()}
            </span>
            {username}
          </button>
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
