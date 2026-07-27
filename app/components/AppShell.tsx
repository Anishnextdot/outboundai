"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "./icons";
import type { Campaign } from "@/src/types";

interface NavItem {
  label: string;
  icon: IconName;
  href: string;
}

const NAV: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
  { label: "Leads", icon: "leads", href: "/leads" },
  { label: "Research", icon: "research", href: "/research" },
  { label: "Drafts", icon: "drafts", href: "/drafts" },
  { label: "Approvals", icon: "approvals", href: "/approvals" },
  { label: "Campaigns", icon: "campaigns", href: "/campaigns" },
  { label: "Sent", icon: "sent", href: "/sent" },
  { label: "Replies", icon: "replies", href: "/replies" },
  { label: "Analytics", icon: "analytics", href: "/analytics" },
  { label: "Settings", icon: "settings", href: "/settings" },
];

interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authState, setAuthState] = useState<"checking" | "in" | "out">("checking");
  const [pending, setPending] = useState<number | null>(null);

  // Auth gate — nothing renders until we know who (if anyone) is signed in.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          setAuthState("out");
          router.replace("/login");
          return;
        }
        const data = await res.json();
        setUser(data.user);
        setAuthState("in");
      } catch {
        setAuthState("out");
        router.replace("/login");
      }
    })();
  }, [router]);

  async function loadCount() {
    try {
      const res = await fetch("/api/campaigns");
      if (!res.ok) return;
      const data = await res.json();
      const campaigns: Campaign[] = data.campaigns ?? [];
      setPending(campaigns.filter((c) => c.status === "pending_review").length);
    } catch {
      /* leave badge hidden on error */
    }
  }

  useEffect(() => {
    if (authState === "in") loadCount();
  }, [pathname, authState]);
  useEffect(() => {
    const handler = () => loadCount();
    window.addEventListener("campaigns-updated", handler);
    return () => window.removeEventListener("campaigns-updated", handler);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  // Never show the app (or any placeholder data) before auth resolves.
  if (authState !== "in") {
    return (
      <div className="auth-wrap">
        <div className="auth-loading">{authState === "checking" ? "Loading your workspace…" : "Redirecting to sign in…"}</div>
      </div>
    );
  }

  const initials =
    (user?.name || user?.email || "?")
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="sparkle" size={21} filled />
          </div>
          <div>
            <div className="brand-name">Arka Alliance</div>
            <div className="brand-sub">AI Outbound</div>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const badge = item.href === "/approvals" && pending ? pending : 0;
            return (
              <div
                key={item.href}
                className={`nav-item${active ? " active" : ""}`}
                onClick={() => router.push(item.href)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {badge > 0 ? <span className="nav-badge">{badge}</span> : null}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="avatar" style={{ background: "var(--brand-soft-2)", color: "var(--brand-ink)" }}>
            {initials}
          </div>
          <div style={{ lineHeight: 1.25, minWidth: 0 }}>
            <div className="user-name">{user?.name ?? "Signed in"}</div>
            <div className="user-sub">{user?.email}</div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">
            ⏻
          </button>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
