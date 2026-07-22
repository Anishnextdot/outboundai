"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { Icon, type IconName } from "../components/icons";
import { Sparkline, Donut, type DonutSeg } from "../components/charts";
import type { Campaign } from "@/src/types";

interface StatCard {
  label: string;
  value: number;
  icon: IconName;
  tint: string;
  foot: string;
  /** Real 7-day history, or undefined when we have no timestamps to plot. */
  spark?: number[];
  sparkColor: string;
}

interface Activity {
  icon: IconName;
  tint: string;
  title: string;
  sub: string;
  time: string;
}

interface AgentRow {
  name: string;
  sub: string;
  ok: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [threshold, setThreshold] = useState(70);
  const [integrations, setIntegrations] = useState<{ supabase: boolean; apollo: boolean; anthropic: boolean } | null>(
    null
  );
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const [cRes, cfgRes, aRes, meRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/config"),
        fetch("/api/analytics"),
        fetch("/api/auth/me"),
      ]);
      if (meRes.ok) setMe((await meRes.json()).user);
      const cData = await cRes.json();
      if (cRes.ok) {
        setCampaigns(cData.campaigns ?? []);
        if (typeof cData.trustThreshold === "number") setThreshold(cData.trustThreshold);
        setErr(null);
      } else {
        setCampaigns([]);
        setErr(cData.error || "Failed to load campaigns");
      }
      const cfg = await cfgRes.json();
      if (cfgRes.ok) setIntegrations(cfg.integrations);
      const a = await aRes.json();
      if (aRes.ok) setCounts(a.counts);
    } catch (e) {
      setCampaigns([]);
      setErr((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const loading = campaigns === null;
  const list = campaigns ?? [];
  const isEmpty = !loading && list.length === 0;

  // ---- Real aggregates ----
  const byStatus = { pending_review: 0, approved: 0, rejected: 0, blocked: 0 };
  for (const c of list) byStatus[c.status]++;
  const total = list.length;

  // Sparklines are REAL 7-day history derived from campaign timestamps — never
  // decorative filler. Reply/meeting cards carry no line because the analytics
  // endpoint returns totals without per-day timestamps to plot.
  const stats: StatCard[] = [
    { label: "Active Campaigns", value: byStatus.approved, icon: "plane", tint: "t-purple", foot: "approved & ready", spark: dailySeries(list, (c) => c.status === "approved"), sparkColor: "#6c5ce7" },
    { label: "Pending Approval", value: byStatus.pending_review, icon: "clock", tint: "t-amber", foot: `of ${total} leads`, spark: dailySeries(list, (c) => c.status === "pending_review"), sparkColor: "#f59e0b" },
    { label: "Blocked Leads", value: byStatus.blocked, icon: "shield", tint: "t-red", foot: "missing data", spark: dailySeries(list, (c) => c.status === "blocked"), sparkColor: "#ef4444" },
    { label: "Positive Replies", value: counts?.positive ?? 0, icon: "chat", tint: "t-green", foot: `${counts?.sent ?? 0} sent`, sparkColor: "#22c55e" },
    { label: "Meetings Booked", value: counts?.meetings ?? 0, icon: "calendar", tint: "t-blue", foot: `${counts?.replied ?? 0} replies`, sparkColor: "#3b82f6" },
  ];

  const funnelVals = [total, byStatus.approved, counts?.sent ?? 0, counts?.replied ?? 0, counts?.positive ?? 0, counts?.meetings ?? 0];
  const funnel = FUNNEL_META.map((f, i) => ({ ...f, value: funnelVals[i], pct: pct(funnelVals[i], funnelVals[0]) }));

  const trustBuckets = bucketTrust(list);
  const trust: DonutSeg[] = [
    { label: "80 - 100", value: trustBuckets[0], color: "#22c55e" },
    { label: "60 - 80", value: trustBuckets[1], color: "#3b82f6" },
    { label: "40 - 60", value: trustBuckets[2], color: "#f59e0b" },
    { label: "0 - 40", value: trustBuckets[3], color: "#ef4444" },
  ];
  const trustTotal = trust.reduce((a, s) => a + s.value, 0);

  const activity: Activity[] = list.slice(0, 5).map(deriveActivity);
  const approvals = list.filter((c) => c.status === "pending_review" || c.status === "blocked").slice(0, 4);
  const topLead = [...list].sort((a, b) => b.trustScore - a.trustScore)[0] ?? null;

  const agents: AgentRow[] = [
    { name: "Lead Discovery Agent", sub: "Finding high-quality leads", ok: integrations?.apollo ?? true },
    { name: "Decision Maker Finder", sub: "Identifying key people", ok: integrations?.apollo ?? true },
    { name: "Research Agent", sub: "Gathering insights", ok: integrations?.anthropic ?? true },
    { name: "Personalization Agent", sub: "Creating angles", ok: integrations?.anthropic ?? true },
    { name: "Content Agent", sub: "Generating content", ok: integrations?.anthropic ?? true },
  ];
  const allAgentsOk = agents.every((a) => a.ok);

  // Wait for real data — never render placeholder numbers.
  if (loading || isEmpty) {
    return (
      <AppShell>
        <div className="topbar">
          <div>
            <h1>Dashboard</h1>
            <div className="sub">Here&apos;s what&apos;s happening with your outbound campaigns.</div>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => router.push("/approvals")}>
              <Icon name="plus" size={17} />
              Create Campaign
            </button>
          </div>
        </div>
        {err && (
          <div className="notice" style={{ color: "var(--red-ink)", borderColor: "#f2c4c4" }}>
            {err}
          </div>
        )}
        <div className="card">
          <div className="empty">
            {loading ? (
              "Loading your data…"
            ) : (
              <>
                No leads yet.
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
      <div className="topbar">
        <div>
          <h1>{greeting()}, {me?.name?.split(" ")[0] ?? "there"} 👋</h1>
          <div className="sub">Here&apos;s what&apos;s happening with your outbound campaigns.</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => router.push("/approvals")}>
            <Icon name="plus" size={17} />
            Create Campaign
          </button>
        </div>
      </div>

      {err && (
        <div className="notice" style={{ color: "var(--red-ink)", borderColor: "#f2c4c4" }}>
          {err}
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat" key={s.label} style={{ cursor: "pointer" }} onClick={() => router.push(statLink(s.label))}>
            <div className="stat-top">
              <span className={`stat-icon ${s.tint}`}>
                <Icon name={s.icon} />
              </span>
              {s.label}
            </div>
            <div className="stat-num">{s.value}</div>
            <div className="stat-foot">
              <span className="delta" style={{ color: "var(--muted-2)", fontWeight: 500 }}>{s.foot}</span>
              {s.spark && <Sparkline values={s.spark} color={s.sparkColor} />}
            </div>
          </div>
        ))}
      </div>

      {/* Row: funnel / activity / top lead */}
      <div className="row-3">
        <div className="card">
          <div className="card-head">
            <span className="card-title">Pipeline Overview</span>
            <span className="pill-tag">live</span>
          </div>
          <div className="funnel-wrap">
            <div className="funnel">
              {funnel.map((f) => (
                <div key={f.label} className="funnel-bar" style={{ width: `${f.width}%`, background: f.color }}>
                  {f.value}
                </div>
              ))}
            </div>
            <div className="legend">
              {funnel.map((f) => (
                <div className="legend-row" key={f.label}>
                  <span className="dot" style={{ background: f.color }} />
                  <span className="lg-label">{f.label}</span>
                  <span className="lg-val">{f.value}</span>
                  <span className="lg-pct">{f.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Recent Activity</span>
            <span className="link" onClick={() => router.push("/campaigns")}>View all</span>
          </div>
          <div className="activity">
            {activity.length === 0 ? (
              <div className="empty" style={{ padding: 24 }}>No activity yet.</div>
            ) : (
              activity.map((a, i) => (
                <div className="act" key={i}>
                  <span className={`act-ic ${a.tint}`}>
                    <Icon name={a.icon} size={15} />
                  </span>
                  <div>
                    <div className="act-title">{a.title}</div>
                    <div className="act-sub">{a.sub}</div>
                  </div>
                  <span className="act-time">{a.time}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title">Top Lead by Trust</span>
            {topLead && <span className={`badge-status ${topLead.status}`}>{topLead.status.replace("_", " ")}</span>}
          </div>
          {topLead ? (
            <>
              <div className="camp-name">{topLead.company?.name ?? topLead.icp.industry}</div>
              <div className="metric-row">
                <div className="metric">
                  <div className="m-label">Trust</div>
                  <div className="m-val">{topLead.trustScore}</div>
                </div>
                <div className="metric">
                  <div className="m-label">Confidence</div>
                  <div className="m-val">{topLead.decisionMaker?.confidence ?? "—"}</div>
                </div>
                <div className="metric">
                  <div className="m-label">Email</div>
                  <div className="m-val">{topLead.decisionMaker?.emailVerified ? "✓" : "—"}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <MiniBar label="Company data" value={topLead.trust?.companyData ?? 0} />
                <MiniBar label="Decision maker" value={topLead.trust?.decisionMaker ?? 0} />
                <MiniBar label="Verified email" value={topLead.trust?.verifiedEmail ?? 0} />
                <MiniBar label="Research grounding" value={topLead.trust?.researchGrounding ?? 0} />
              </div>
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <span className="link" onClick={() => router.push("/approvals")}>View in Approvals →</span>
              </div>
            </>
          ) : (
            <div className="empty" style={{ padding: 24 }}>
              No leads yet.
              <div style={{ marginTop: 8 }}>
                <span className="link" onClick={() => router.push("/approvals")}>Run your first pipeline →</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row: approvals / trust + agents */}
      <div className="row-2">
        <div className="card">
          <div className="card-head">
            <span className="card-title">
              Pending Approvals <span className="nav-badge" style={{ marginLeft: 6 }}>{approvals.length}</span>
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
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((c) => {
                    const name = c.decisionMaker?.name ?? "—";
                    const blocked = c.status === "blocked";
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
                            <span className="logo-badge" style={{ background: "#16181d" }}>
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
                          <span className={`badge-status ${c.status}`}>{c.status.replace("_", " ")}</span>
                        </td>
                        <td>
                          {blocked ? (
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

        <div className="stack">
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

          <div className="card">
            <div className="card-head">
              <span className="card-title">AI Agents Status</span>
              <span className={`badge ${allAgentsOk ? "green" : ""}`} style={allAgentsOk ? {} : { background: "var(--amber-soft)", color: "var(--amber-ink)" }}>
                {allAgentsOk ? "All systems operational" : "Configuration needed"}
              </span>
            </div>
            {agents.map((a) => (
              <div className="agent" key={a.name}>
                <span className="agent-ic"><Icon name="bot" /></span>
                <div>
                  <div className="agent-name">{a.name}</div>
                  <div className="agent-sub">{a.sub}</div>
                </div>
                {a.ok ? (
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
      </div>
    </AppShell>
  );
}

// ---- helpers ----

const FUNNEL_META = [
  { label: "Total Prospects", color: "#6366f1", width: 100 },
  { label: "Approved", color: "#3b82f6", width: 84 },
  { label: "Sent", color: "#14b8a6", width: 74 },
  { label: "Replied", color: "#f59e0b", width: 60 },
  { label: "Positive Replies", color: "#f97316", width: 46 },
  { label: "Meetings Booked", color: "#ef4444", width: 34 },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function statLink(label: string): string {
  if (label === "Pending Approval" || label === "Blocked Leads") return "/approvals";
  return "/campaigns";
}

function bucketTrust(list: Campaign[]): number[] {
  const b = [0, 0, 0, 0];
  for (const c of list) {
    const t = c.trustScore;
    if (t >= 80) b[0]++;
    else if (t >= 60) b[1]++;
    else if (t >= 40) b[2]++;
    else b[3]++;
  }
  return b;
}

/**
 * Real per-day counts for the last `days` days, bucketed by campaign
 * createdAt. Returns undefined when nothing matches, so the card renders no
 * line at all rather than a flat one implying history we don't have.
 */
function dailySeries(list: Campaign[], match: (c: Campaign) => boolean, days = 7): number[] | undefined {
  const series = new Array(days).fill(0);
  const DAY = 86_400_000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  let hits = 0;
  for (const c of list) {
    if (!match(c)) continue;
    const t = Date.parse(c.createdAt);
    if (!Number.isFinite(t)) continue;
    const daysAgo = Math.floor((startOfToday - new Date(t).setHours(0, 0, 0, 0)) / DAY);
    if (daysAgo < 0 || daysAgo >= days) continue;
    series[days - 1 - daysAgo]++;
    hits++;
  }
  return hits > 0 ? series : undefined;
}

function deriveActivity(c: Campaign): Activity {
  const company = c.company?.name ?? c.icp.industry;
  const time = rel(c.createdAt);
  if (c.status === "blocked")
    return { icon: "alert", tint: "t-amber", title: `Lead blocked — ${company}`, sub: c.blockedReason ?? "missing data", time };
  if (c.status === "approved")
    return { icon: "check", tint: "t-green", title: `Email approved — ${company}`, sub: c.decisionMaker?.name ?? "", time };
  if (c.status === "rejected")
    return { icon: "info", tint: "t-red", title: `Rejected — ${company}`, sub: c.decisionMaker?.role ?? "", time };
  return { icon: "check", tint: "t-blue", title: `Draft ready — ${company}`, sub: `Trust ${c.trustScore}`, time };
}

function rel(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function pct(v: number, total: number): string {
  if (!total || v === total) return "";
  return `${((v / total) * 100).toFixed(1)}%`;
}

function trustClass(t: number): string {
  if (t >= 75) return "high";
  if (t >= 50) return "mid";
  return "low";
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = ["#6c5ce7", "#e8590c", "#0ca678", "#1c7ed6", "#ae3ec9", "#d6336c"];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="trustbar-label">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="trustbar-track">
        <div
          className="trustbar-fill"
          style={{ width: `${value}%`, background: value >= 75 ? "#22c55e" : value >= 50 ? "#f59e0b" : "#ef4444" }}
        />
      </div>
    </div>
  );
}
