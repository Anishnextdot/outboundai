import { NextResponse } from "next/server";
import { listCampaigns, listResponses } from "@/src/lib/repository";
import { getSessionUser } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import type { Campaign, OutreachResponse } from "@/src/types";

/** GET /api/analytics — this user's funnel, rates, trust distribution, insights. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    const [campaigns, responses] = await Promise.all([listCampaigns(user.id), listResponses(user.id)]);

    const s = { pending_review: 0, approved: 0, rejected: 0, blocked: 0 };
    for (const c of campaigns) s[c.status]++;
    const total = campaigns.length;
    // "Sent" = reached the prospect on EITHER channel. LinkedIn is a human
    // handoff (no API), but once marked sent it counts like an email would.
    const wasSent = (c: Campaign) =>
      c.sendStatus === "sent" || c.sendStatus === "simulated" || !!c.linkedinSentAt;
    const sent = campaigns.filter(wasSent).length;
    const replied = new Set(responses.filter((r) => r.type === "reply").map((r) => r.campaignId)).size;
    const positive = responses.filter((r) => r.sentiment === "positive").length;
    const meetings = responses.filter((r) => r.type === "meeting").length;

    const funnel = [
      { label: "Total Prospects", value: total },
      { label: "Approved", value: s.approved },
      { label: "Sent", value: sent },
      { label: "Replied", value: replied },
      { label: "Positive Replies", value: positive },
      { label: "Meetings Booked", value: meetings },
    ];

    const rate = (a: number, b: number) => (b ? Number(((a / b) * 100).toFixed(1)) : 0);
    const rates = {
      approvalRate: rate(s.approved, total),
      sendRate: rate(sent, s.approved),
      replyRate: rate(replied, sent),
      positiveRate: rate(positive, sent),
      meetingRate: rate(meetings, sent),
    };

    const trust = [0, 0, 0, 0];
    for (const c of campaigns) {
      const t = c.trustScore;
      if (t >= 80) trust[0]++;
      else if (t >= 60) trust[1]++;
      else if (t >= 40) trust[2]++;
      else trust[3]++;
    }

    const insights = buildInsights({ campaigns, responses, s, sent, replied, positive, total, threshold: env.trustThreshold });

    return NextResponse.json({
      funnel,
      rates,
      trust,
      counts: { ...s, total, sent, replied, positive, meetings },
      insights,
    });
  } catch (err) {
    console.error("[/api/analytics]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

type Tone = "good" | "warn" | "info";
interface Insight {
  tone: Tone;
  title: string;
  detail: string;
}

// Phase 5 — the learning layer: real, data-derived recommendations.
function buildInsights(args: {
  campaigns: Campaign[];
  responses: OutreachResponse[];
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
      detail: rr >= 15 ? "At or above the 15% benchmark — keep the current angle style." : "Below benchmark. Try sharper subject lines and one low-friction ask.",
    });
    if (positive > 0)
      out.push({ tone: "good", title: `${positive} positive repl${positive > 1 ? "ies" : "y"}`, detail: "Review the winning emails in Sent and reuse what worked." });
  } else if (s.approved > 0) {
    out.push({ tone: "info", title: `${s.approved} approved, none sent`, detail: "Send approved emails to start tracking replies." });
  }

  const approved = campaigns.filter((c) => c.status === "approved");
  if (approved.length) {
    const avg = Math.round(approved.reduce((a, c) => a + c.trustScore, 0) / approved.length);
    out.push({ tone: "info", title: `Avg trust of approved: ${avg}`, detail: `Threshold ${threshold}. Verified email + grounded research lift both trust and reply odds.` });
  }

  return out;
}
