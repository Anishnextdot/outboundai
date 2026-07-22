"use client";

import { useEffect, useState } from "react";
import type { Campaign } from "@/src/types";

/** Shared loader for the campaign-backed pages. */
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [threshold, setThreshold] = useState(70);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/campaigns");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load campaigns");
        setCampaigns(data.campaigns ?? []);
        if (typeof data.trustThreshold === "number") setThreshold(data.trustThreshold);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { campaigns, threshold, loading, error };
}

export function trustClass(t: number): string {
  if (t >= 75) return "high";
  if (t >= 50) return "mid";
  return "low";
}

export function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = ["#6c5ce7", "#e8590c", "#0ca678", "#1c7ed6", "#ae3ec9", "#d6336c"];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function logoColor(company: string): string {
  return company.toLowerCase().includes("decathlon") ? "#0082c3" : "#16181d";
}

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

/** Small reusable states. */
export function PageEmpty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

export function PageError({ text }: { text: string }) {
  return (
    <div className="notice" style={{ color: "var(--red-ink)", borderColor: "#f2c4c4" }}>
      {text}
    </div>
  );
}
