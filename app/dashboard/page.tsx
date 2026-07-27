"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { Icon, type IconName } from "../components/icons";
import { Donut, type DonutSeg } from "../components/charts";
import type { Campaign } from "@/src/types";

// ---------------------------------------------------------------- API shapes

interface TrendPoint {
  current: number;
  previous: number;
  /** null when the previous period had no data to compare against. */
  changePct: number | null;
}

interface CampaignGroup {
  id: string;
  name: string;
  sub: string;
  status: "active" | "review" | "completed" | "blocked" | "idle";
  leads: number;
  sent: number;
  replied: number;
  replyRate: number;
  avgTrust: number;
}

interface ActivityEvent {
  kind: "sent" | "linkedin" | "reply" | "meeting" | "lead" | "blocked";
  text: string;
  subject: string;
  at: string;
}

interface Analytics {
  window: { days: number; from: string | null; to: string };
  rates: { approvalRate: number; sendRate: number; replyRate: number; positiveRate: number; meetingRate: number };
  trust: number[];
  counts: Record<string, number>;
  trend: {
    spanDays: number;
    prospects: TrendPoint;
    sent: TrendPoint;
    replied: TrendPoint;
    meetings: TrendPoint;
    positive: TrendPoint;
    replyRate: TrendPoint;
  };
  groups: CampaignGroup[];
  activity: ActivityEvent[];
}

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 0, label: "All time" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [days, setDays] = useState(7);
  const [a, setA] = useState<Analytics | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [integrations, setIntegrations] = useState<{ supabase: boolean; apollo: boolean; anthropic: boolean } | null>(null);
  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (d: number) => {
    try {
      const res = await fetch(`/api/analytics?days=${d}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load analytics");
      setA(data);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(days);
  }, [days, loadAnalytics]);

  useEffect(() => {
    (async () => {
      try {
        const [cRes, cfgRes, meRes] = await Promise.all([
          fetch("/api/campaigns"),
          fetch("/api/config"),
          fetch("/api/auth/me"),
        ]);
        if (meRes.ok) setMe((await meRes.json()).user);
        const cData = await cRes.json();
        if (cRes.ok) setCampaigns(cData.campaigns ?? []);
        else {
          setCampaigns([]);
          setErr(cData.error || "Failed to load campaigns");
        }
        if (cfgRes.ok) setIntegrations((await cfgRes.json()).integrations);
      } catch (e) {
        setCampaigns([]);
        setErr((e as Error).message);
      }
    })();
  }, []);

  const loading = !a || campaigns === null;
  const list = campaigns ?? [];
  // Nothing has ever run — don't render a wall of zeroes.
  const isEmpty = !loading && list.length === 0;

  const kpis = a
    ? [
        { label: "Prospects Contacted", value: a.counts.total, icon: "plane" as IconName, tint: "t-purple", trend: a.trend.prospects, href: "/leads" },
        { label: "Messages Sent", value: a.counts.sent, icon: "mail" as IconName, tint: "t-blue", trend: a.trend.sent, href: "/sent" },
        { label: "Replies", value: a.counts.replied, icon: "reply" as IconName, tint: "t-green", trend: a.trend.replied, href: "/replies" },
        { label: "Meetings Booked", value: a.counts.meetings, icon: "users" as IconName, tint: "t-amber", trend: a.trend.meetings, href: "/replies" },
        { label: "Reply Rate", value: a.rates.replyRate, suffix: "%", icon: "target" as IconName, tint: "t-pink", trend: a.trend.replyRate, href: "/analytics" },
      ]
    : [];

  const trust: DonutSeg[] = a
    ? [
        { label: "80 - 100", value: a.trust[0], color: "var(--green)" },
        { label: "60 - 80", value: a.trust[1], color: "var(--amber)" },
        { label: "40 - 60", value: a.trust[2], color: "var(--orange)" },
        { label: "0 - 40", value: a.trust[3], color: "var(--red)" },
      ]
    : [];
  const trustTotal = trust.reduce((s, x) => s + x.value, 0);

  const approvals = list.filter((c) => c.status === "pending_review" || c.status === "blocked").slice(0, 5);

  const agents = [
    { name: "Lead Discovery Agent", sub: "Finding high-quality leads", ok: integrations?.apollo ?? true },
    { name: "Decision Maker Finder", sub: "Identifying key people", ok: integrations?.apollo ?? true },
    { name: "Research Agent", sub: "Gathering insights", ok: integrations?.anthropic ?? true },
    { name: "Personalization Agent", sub: "Creating angles", ok: integrations?.anthropic ?? true },
    { name: "Content Agent", sub: "Generating content", ok: integrations?.anthropic ?? true },
  ];
  const allAgentsOk = agents.every((x) => x.ok);

  const header = (
    <div className="topbar">
      <div>
        <h1>
          {greeting()}, {me?.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <div className="sub">Here&apos;s what&apos;s happening with your outbound today.</div>
      </div>
      <div className="topbar-actions">
        <RangePicker days={days} onChange={setDays} window={a?.window} />
        <button className="btn btn-primary" onClick={() => router.push("/approvals")}>
          <Icon name="plus" size={17} />
          New Campaign
        </button>
      </div>
    </div>
  );

  if (loading || isEmpty) {
    return (
      <AppShell>
        {header}
        {err && <div className="notice" style={{ color: "var(--red-ink)", borderColor: "var(--red-soft)" }}>{err}</div>}
        <div className="card">
          <div className="empty">
            {loading ? (
              "Loading your data…"
            ) : (
              <>
                No prospects yet.
                <div style={{ marginTop: 8 }}>
                  <span className="link" onClick={() => router.push("/approvals")}>
                    Run your first pipeline →
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {header}

      {err && <div className="notice" style={{ color: "var(--red-ink)", borderColor: "var(--red-soft)" }}>{err}</div>}

      {/* KPI row */}
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className="kpi" key={k.label} onClick={() => router.push(k.href)}>
            <div className="kpi-head">
              <span className={`kpi-icon ${k.tint}`}>
                <Icon name={k.icon} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="kpi-label">{k.label}</div>
                <div className="kpi-num">
                  {k.suffix ? `${k.value}${k.suffix}` : k.value.toLocaleString()}
                </div>
              </div>
            </div>
            <Delta point={k.trend} span={a!.trend.spanDays} unit={k.suffix ?? ""} />
          </div>
        ))}
      </div>

      {/* Campaigns + activity */}
      <div className="row-main">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Campaigns</span>
            <span className="link" onClick={() => router.push("/campaigns")}>View all</span>
          </div>
          {a!.groups.length === 0 ? (
            <div className="empty" style={{ padding: 28 }}>
              No campaigns in this period.
              <div style={{ marginTop: 8 }}>
                <span className="link" onClick={() => router.push("/approvals")}>Run a pipeline →</span>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Status</th>
                    <th className="num">Reply Rate</th>
                    <th className="num">Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {a!.groups.slice(0, 5).map((g, i) => (
                    <tr key={g.id} style={{ cursor: "pointer" }} onClick={() => router.push("/campaigns")}>
                      <td>
                        <div className="camp-cell">
                          <span className={`camp-row-ic ${GROUP_TINTS[i % GROUP_TINTS.length]}`}>
                            <Icon name={GROUP_ICONS[i % GROUP_ICONS.length]} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div className="n">{g.name}</div>
                            <div className="s">{g.sub}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${g.status}`}>{GROUP_STATUS_LABEL[g.status]}</span>
                      </td>
                      <td className="num">
                        {g.sent === 0 ? (
                          <span className="rate-val low">—</span>
                        ) : (
                          <span className={`rate-val ${g.replyRate >= 15 ? "good" : g.replyRate > 0 ? "mid" : "low"}`}>
                            {g.replyRate}%
                          </span>
                        )}
                      </td>
                      <td className="num">{g.sent.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Recent Activity</span>
            <span className="link" onClick={() => router.push("/campaigns")}>View all</span>
          </div>
          {a!.activity.length === 0 ? (
            <div className="empty" style={{ padding: 28 }}>No activity in this period.</div>
          ) : (
            <div className="activity">
              {a!.activity.map((e, i) => {
                const look = ACTIVITY_LOOK[e.kind];
                return (
                  <div className="act" key={`${e.at}-${i}`}>
                    <span className={`act-ic ${look.tint}`}>
                      <Icon name={look.icon} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div className="act-title">
                        {e.text} <b>{e.subject}</b>
                      </div>
                    </div>
                    <span className="act-time">{rel(e.at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Review queue + pipeline health */}
      <div className="row-2">
        <div className="stack">
        <div className="card">
          <div className="card-head">
            <span className="card-title">
              Pending Approvals
              {approvals.length > 0 && <span className="nav-badge" style={{ marginLeft: 8 }}>{approvals.length}</span>}
            </span>
            <span className="link" onClick={() => router.push("/approvals")}>Open Approvals</span>
          </div>
          {approvals.length === 0 ? (
            <div className="empty" style={{ padding: 28 }}>
              Nothing awaiting review.
              <div style={{ marginTop: 8 }}>
                <span className="link" onClick={() => router.push("/approvals")}>Run a pipeline →</span>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Prospect</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Trust</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((c) => {
                    const name = c.decisionMaker?.name ?? "—";
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className="cell-user">
                            <span className="avatar" style={{ background: avatarColor(name) }}>
                              {c.decisionMaker ? initials(name) : "?"}
                            </span>
                            {name}
                          </div>
                        </td>
                        <td>
                          <div className="company">
                            <span className="logo-badge" style={{ background: "var(--text)" }}>
                              {(c.company?.name ?? "—").charAt(0)}
                            </span>
                            {c.company?.name ?? "—"}
                          </div>
                        </td>
                        <td style={{ color: "var(--text-2)" }}>{c.decisionMaker?.role ?? "—"}</td>
                        <td>
                          <span className={`trust ${trustClass(c.trustScore)}`}>{c.trustScore}</span>
                        </td>
                        <td>
                          {c.status === "blocked" ? (
                            <span className="status-tag blocked">Blocked</span>
                          ) : (
                            <button className="btn btn-review" onClick={() => router.push("/approvals")}>Review</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">AI Agents</span>
              <span
                className={`badge ${allAgentsOk ? "green" : ""}`}
                style={allAgentsOk ? {} : { background: "var(--amber-soft)", color: "var(--amber-ink)" }}
              >
                {allAgentsOk ? "All systems operational" : "Configuration needed"}
              </span>
            </div>
            {agents.map((x) => (
              <div className="agent" key={x.name}>
                <span className="agent-ic"><Icon name="bot" /></span>
                <div>
                  <div className="agent-name">{x.name}</div>
                  <div className="agent-sub">{x.sub}</div>
                </div>
                {x.ok ? (
                  <span className="agent-status"><span className="live" /> Active</span>
                ) : (
                  <span className="agent-status" style={{ color: "var(--amber-ink)" }}>
                    <span className="live" style={{ background: "var(--amber)", boxShadow: "0 0 0 3px var(--amber-soft)" }} /> Needs key
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Trust Score Distribution</span>
            <span className="pill-tag">live</span>
          </div>
          <div className="donut-wrap">
            <div className="donut">
              <Donut segments={trust} />
              <div className="donut-center">
                <div>
                  <div className="dc-num">{trustTotal}</div>
                  <div className="dc-lbl">Leads</div>
                </div>
              </div>
            </div>
            <div className="donut-legend">
              {trust.map((s) => (
                <div className="dl" key={s.label}>
                  <span className="dot" style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <span className="dl-pct">{trustTotal ? Math.round((s.value / trustTotal) * 100) : 0}%</span>
                  <span className="dl-n">({s.value})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ------------------------------------------------------------------ pieces

/** Period-over-period chip. Says "no prior data" instead of faking a delta. */
function Delta({ point, span, unit = "" }: { point: TrendPoint; span: number; unit?: string }) {
  if (point.changePct === null) {
    // No baseline. Report the raw movement rather than an invented percentage.
    return (
      <div className="kpi-foot">
        <span className="delta flat">{point.current > 0 ? `+${point.current.toLocaleString()}${unit}` : "—"}</span>
        <span className="lbl">{point.current > 0 ? "first period on record" : "no activity yet"}</span>
      </div>
    );
  }
  const up = point.changePct > 0;
  const flat = point.changePct === 0;
  return (
    <div className="kpi-foot">
      <span className={`delta ${flat ? "flat" : up ? "up" : "down"}`}>
        {!flat && <Icon name={up ? "arrowUp" : "arrowDown"} size={13} />}
        {up ? "+" : ""}
        {point.changePct}%
      </span>
      <span className="lbl">vs previous {span} days</span>
    </div>
  );
}

function RangePicker({
  days,
  onChange,
  window: w,
}: {
  days: number;
  onChange: (d: number) => void;
  window?: Analytics["window"];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="range" ref={ref}>
      <button className="range-btn" onClick={() => setOpen((o) => !o)}>
        <Icon name="calendar" size={17} />
        {rangeLabel(days, w)}
        <Icon name="chevronDown" size={16} />
      </button>
      {open && (
        <div className="range-menu">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={`range-opt${r.days === days ? " on" : ""}`}
              onClick={() => {
                onChange(r.days);
                setOpen(false);
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- helpers

const GROUP_ICONS: IconName[] = ["plane", "campaigns", "target", "leads", "research"];
const GROUP_TINTS = ["t-purple", "t-blue", "t-amber", "t-green", "t-pink"];

const GROUP_STATUS_LABEL: Record<CampaignGroup["status"], string> = {
  active: "Active",
  review: "Needs review",
  completed: "Completed",
  blocked: "Blocked",
  idle: "Idle",
};

const ACTIVITY_LOOK: Record<ActivityEvent["kind"], { icon: IconName; tint: string }> = {
  sent: { icon: "mail", tint: "t-purple" },
  linkedin: { icon: "linkedin", tint: "t-blue" },
  reply: { icon: "reply", tint: "t-green" },
  meeting: { icon: "calendar", tint: "t-amber" },
  lead: { icon: "users", tint: "t-blue" },
  blocked: { icon: "alert", tint: "t-red" },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function rangeLabel(days: number, w?: Analytics["window"]): string {
  if (days === 0) return "All time";
  if (w?.from && w.to) {
    const from = new Date(w.from);
    const to = new Date(w.to);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(from)} – ${fmt(to)}, ${to.getFullYear()}`;
  }
  return `Last ${days} days`;
}

function rel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function trustClass(t: number): string {
  if (t >= 75) return "high";
  if (t >= 50) return "mid";
  return "low";
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "oklch(0.58 0.2 283)",
  "oklch(0.6 0.15 252)",
  "oklch(0.6 0.13 152)",
  "oklch(0.65 0.15 62)",
  "oklch(0.62 0.19 5)",
  "oklch(0.6 0.12 195)",
];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
