import { NextResponse } from "next/server";
import { listCampaigns, listResponses } from "@/src/lib/repository";
import { getSessionUser } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import type { Campaign, OutreachResponse } from "@/src/types";

const DAY = 86_400_000;

/**
 * GET /api/analytics?days=7 — this user's funnel, rates, trust distribution,
 * period-over-period trend, campaign groups, activity feed and insights.
 *
 * `days` windows every metric by real timestamps (campaign createdAt, sentAt /
 * linkedinSentAt, response receivedAt). `days=0` (the default) = all time.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const daysParam = Number(new URL(req.url).searchParams.get("days") ?? 0);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 0;

  try {
    const [allCampaigns, allResponses] = await Promise.all([listCampaigns(user.id), listResponses(user.id)]);

    const now = Date.now();
    const from = days > 0 ? now - days * DAY : null;
    const window: Window = { from, to: now };

    const m = measure(allCampaigns, allResponses, window);

    const funnel = [
      { label: "Total Prospects", value: m.total },
      { label: "Approved", value: m.s.approved },
      { label: "Sent", value: m.sent },
      { label: "Replied", value: m.replied },
      { label: "Positive Replies", value: m.positive },
      { label: "Meetings Booked", value: m.meetings },
    ];

    const rates = {
      approvalRate: rate(m.s.approved, m.total),
      sendRate: rate(m.sent, m.s.approved),
      replyRate: rate(m.replied, m.sent),
      positiveRate: rate(m.positive, m.sent),
      meetingRate: rate(m.meetings, m.sent),
    };

    // Period-over-period: the selected window vs the equally-long window before
    // it. Falls back to 7v7 when viewing all time, so the KPI chips always
    // compare like with like.
    const span = days > 0 ? days : 7;
    const cur = measure(allCampaigns, allResponses, { from: now - span * DAY, to: now });
    const prev = measure(allCampaigns, allResponses, { from: now - 2 * span * DAY, to: now - span * DAY });
    const trend = {
      spanDays: span,
      prospects: delta(cur.total, prev.total),
      sent: delta(cur.sent, prev.sent),
      replied: delta(cur.replied, prev.replied),
      meetings: delta(cur.meetings, prev.meetings),
      positive: delta(cur.positive, prev.positive),
      replyRate: delta(rate(cur.replied, cur.sent), rate(prev.replied, prev.sent)),
    };

    return NextResponse.json({
      window: { days, from: from ? new Date(from).toISOString() : null, to: new Date(now).toISOString() },
      funnel,
      rates,
      trust: m.trust,
      counts: { ...m.s, total: m.total, sent: m.sent, replied: m.replied, positive: m.positive, meetings: m.meetings },
      trend,
      groups: buildGroups(m.campaigns, allResponses),
      activity: buildActivity(m.campaigns, allResponses, window),
      insights: buildInsights({
        campaigns: m.campaigns,
        s: m.s,
        sent: m.sent,
        replied: m.replied,
        positive: m.positive,
        total: m.total,
        threshold: env.trustThreshold,
      }),
    });
  } catch (err) {
    console.error("[/api/analytics]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ---------------------------------------------------------------- primitives

interface Window {
  from: number | null;
  to: number;
}

const rate = (a: number, b: number) => (b ? Number(((a / b) * 100).toFixed(1)) : 0);

function ts(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function inWindow(t: number | null, w: Window): boolean {
  if (t === null) return false;
  if (t > w.to) return false;
  return w.from === null || t >= w.from;
}

/** "Sent" = reached the prospect on EITHER channel; LinkedIn is a human handoff. */
function sentAtOf(c: Campaign): number | null {
  const email = c.sendStatus === "sent" || c.sendStatus === "simulated" ? ts(c.sentAt) : null;
  const li = ts(c.linkedinSentAt);
  if (email !== null && li !== null) return Math.min(email, li);
  return email ?? li;
}

function respAt(r: OutreachResponse): number | null {
  return ts(r.receivedAt) ?? ts(r.createdAt);
}

function delta(current: number, previous: number) {
  // No baseline → no percentage. The UI says "no prior data" rather than
  // inventing a +100%.
  const changePct = previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null;
  return { current, previous, changePct };
}

/** Every metric for one time window, all derived from real row timestamps. */
function measure(campaigns: Campaign[], responses: OutreachResponse[], w: Window) {
  const inRange = campaigns.filter((c) => inWindow(ts(c.createdAt), w));
  const s = { pending_review: 0, approved: 0, rejected: 0, blocked: 0 };
  for (const c of inRange) s[c.status]++;

  const sent = campaigns.filter((c) => inWindow(sentAtOf(c), w)).length;
  const resp = responses.filter((r) => inWindow(respAt(r), w));
  const replied = new Set(resp.filter((r) => r.type === "reply").map((r) => r.campaignId)).size;
  const positive = resp.filter((r) => r.sentiment === "positive").length;
  const meetings = resp.filter((r) => r.type === "meeting").length;

  const trust = [0, 0, 0, 0];
  for (const c of inRange) {
    const t = c.trustScore;
    if (t >= 80) trust[0]++;
    else if (t >= 60) trust[1]++;
    else if (t >= 40) trust[2]++;
    else trust[3]++;
  }

  return { campaigns: inRange, s, total: inRange.length, sent, replied, positive, meetings, trust };
}

// ------------------------------------------------------------------- groups

export type GroupStatus = "active" | "review" | "completed" | "blocked" | "idle";

export interface CampaignGroup {
  id: string;
  name: string;
  sub: string;
  status: GroupStatus;
  leads: number;
  sent: number;
  replied: number;
  replyRate: number;
  avgTrust: number;
}

/**
 * A "campaign" in the UI sense = every lead run against the same ICP. Our unit
 * of work is a single lead, so the ICP is the only real grouping key we have.
 */
function buildGroups(campaigns: Campaign[], responses: OutreachResponse[]): CampaignGroup[] {
  const repliedIds = new Set(responses.filter((r) => r.type === "reply").map((r) => r.campaignId));
  const buckets = new Map<string, Campaign[]>();

  for (const c of campaigns) {
    const key = [c.icp.industry, c.icp.location ?? "", c.icp.employeeRange ?? "", (c.icp.targetRoles ?? []).join("/")]
      .join("|")
      .toLowerCase();
    const list = buckets.get(key);
    if (list) list.push(c);
    else buckets.set(key, [c]);
  }

  const groups: CampaignGroup[] = [];
  for (const [key, list] of buckets) {
    const icp = list[0].icp;
    const sent = list.filter((c) => sentAtOf(c) !== null).length;
    const replied = list.filter((c) => repliedIds.has(c.id)).length;
    const sub = [
      titleCase(icp.location),
      icp.employeeRange ? `${icp.employeeRange} employees` : null,
      titleCase((icp.targetRoles ?? [])[0]),
    ]
      .filter(Boolean)
      .join(" · ");

    groups.push({
      id: key,
      name: titleCase(icp.industry) || "Untitled campaign",
      sub: sub || `${list.length} lead${list.length === 1 ? "" : "s"}`,
      status: groupStatus(list, sent),
      leads: list.length,
      sent,
      replied,
      replyRate: rate(replied, sent),
      avgTrust: Math.round(list.reduce((a, c) => a + c.trustScore, 0) / list.length),
    });
  }

  // Busiest first — the mockup's ordering is "what's actually running".
  return groups.sort((a, b) => b.sent - a.sent || b.leads - a.leads);
}

/**
 * ICP text is typed by the operator and usually arrives lowercase. Only
 * all-lowercase words are capitalised, so "SaaS" and "D2C" survive intact.
 */
function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\b[a-z][a-z0-9'’-]*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

function groupStatus(list: Campaign[], sent: number): GroupStatus {
  if (list.some((c) => c.status === "pending_review")) return "review";
  if (list.some((c) => c.status === "approved" && sentAtOf(c) === null)) return "active";
  if (sent > 0) return "completed";
  if (list.every((c) => c.status === "blocked")) return "blocked";
  return "idle";
}

// ----------------------------------------------------------------- activity

export type ActivityKind = "sent" | "linkedin" | "reply" | "meeting" | "lead" | "blocked";

export interface ActivityEvent {
  kind: ActivityKind;
  /** Lead-in text; the UI bolds `subject` after it. */
  text: string;
  subject: string;
  at: string;
}

/** Real events only — every row here is backed by a stored timestamp. */
function buildActivity(campaigns: Campaign[], responses: OutreachResponse[], w: Window): ActivityEvent[] {
  const out: { e: ActivityEvent; t: number }[] = [];
  const push = (t: number | null, e: Omit<ActivityEvent, "at">) => {
    if (!inWindow(t, w)) return;
    const at = t as number;
    out.push({ t: at, e: { ...e, at: new Date(at).toISOString() } });
  };

  for (const c of campaigns) {
    const who = c.decisionMaker?.name ?? c.company?.name ?? c.icp.industry;
    const emailSent = c.sendStatus === "sent" || c.sendStatus === "simulated" ? ts(c.sentAt) : null;
    push(emailSent, { kind: "sent", text: "Email sent to", subject: who });
    push(ts(c.linkedinSentAt), { kind: "linkedin", text: "LinkedIn DM sent to", subject: who });
    if (c.status === "blocked")
      push(ts(c.createdAt), {
        kind: "blocked",
        text: "Lead blocked —",
        subject: c.company?.name ?? c.icp.industry,
      });
    else push(ts(c.createdAt), { kind: "lead", text: "New prospect added:", subject: who });
  }

  const known = new Set(campaigns.map((c) => c.id));
  for (const r of responses) {
    if (!known.has(r.campaignId)) continue;
    const who = r.contact ?? r.company ?? "a prospect";
    if (r.type === "meeting") push(respAt(r), { kind: "meeting", text: "Meeting booked with", subject: who });
    else if (r.type === "reply") push(respAt(r), { kind: "reply", text: "Reply received from", subject: who });
  }

  return out
    .sort((a, b) => b.t - a.t)
    .slice(0, 8)
    .map((x) => x.e);
}

// ----------------------------------------------------------------- insights

type Tone = "good" | "warn" | "info";
interface Insight {
  tone: Tone;
  title: string;
  detail: string;
}

// Phase 5 — the learning layer: real, data-derived recommendations.
function buildInsights(args: {
  campaigns: Campaign[];
  s: Record<string, number>;
  sent: number;
  replied: number;
  positive: number;
  total: number;
  threshold: number;
}): Insight[] {
  const { campaigns, s, sent, replied, positive, total, threshold } = args;
  const out: Insight[] = [];
  if (total === 0) {
    out.push({ tone: "info", title: "No data yet", detail: "Run pipelines and send outreach to unlock insights." });
    return out;
  }

  const blocked = campaigns.filter((c) => c.status === "blocked");
  if (blocked.length) {
    const reasons: Record<string, number> = {};
    for (const c of blocked) {
      const r = c.blockedReason ?? "unknown";
      reasons[r] = (reasons[r] || 0) + 1;
    }
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
    const pctBlocked = Math.round((blocked.length / total) * 100);
    out.push({
      tone: "warn",
      title: `${pctBlocked}% of leads blocked`,
      detail: `Top reason: "${top[0]}" (${top[1]}). ${
        top[0].toLowerCase().includes("email")
          ? "Verify domains / enable Apollo email reveal to recover these."
          : "Revisit targeting or data source."
      }`,
    });
  }

  const withResearch = campaigns.filter((c) => c.research);
  const grounded = withResearch.filter((c) => c.research!.grounded).length;
  if (withResearch.length && grounded < withResearch.length) {
    out.push({
      tone: "warn",
      title: `${grounded}/${withResearch.length} leads have grounded research`,
      detail: "Set ENABLE_WEB_SEARCH=true — grounded research adds ~25 points of trust and sharper personalization.",
    });
  }

  if (sent > 0) {
    const rr = Math.round((replied / sent) * 100);
    out.push({
      tone: rr >= 15 ? "good" : "warn",
      title: `Reply rate ${rr}%`,
      detail:
        rr >= 15
          ? "At or above the 15% benchmark — keep the current angle style."
          : "Below benchmark. Try sharper subject lines and one low-friction ask.",
    });
    if (positive > 0)
      out.push({
        tone: "good",
        title: `${positive} positive repl${positive > 1 ? "ies" : "y"}`,
        detail: "Review the winning emails in Sent and reuse what worked.",
      });
  } else if (s.approved > 0) {
    out.push({ tone: "info", title: `${s.approved} approved, none sent`, detail: "Send approved emails to start tracking replies." });
  }

  const approved = campaigns.filter((c) => c.status === "approved");
  if (approved.length) {
    const avg = Math.round(approved.reduce((a, c) => a + c.trustScore, 0) / approved.length);
    out.push({
      tone: "info",
      title: `Avg trust of approved: ${avg}`,
      detail: `Threshold ${threshold}. Verified email + grounded research lift both trust and reply odds.`,
    });
  }

  return out;
}
