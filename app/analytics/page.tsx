"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Donut, type DonutSeg } from "../components/charts";
import { PageEmpty, PageError } from "../components/data";

interface Analytics {
  funnel: { label: string; value: number }[];
  rates: { approvalRate: number; sendRate: number; replyRate: number; positiveRate: number; meetingRate: number };
  trust: number[];
  counts: Record<string, number>;
  insights: { tone: "good" | "warn" | "info"; title: string; detail: string }[];
}

const FUNNEL_COLORS = [
  "oklch(0.55 0.215 283)",
  "oklch(0.58 0.19 274)",
  "oklch(0.6 0.16 262)",
  "oklch(0.62 0.15 232)",
  "oklch(0.64 0.14 190)",
  "oklch(0.66 0.15 152)",
];
const FUNNEL_WIDTHS = [100, 84, 74, 60, 46, 34];

export default function AnalyticsPage() {
  const [a, setA] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/analytics");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load analytics");
        setA(data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  const trust: DonutSeg[] = a
    ? [
        { label: "80 - 100", value: a.trust[0], color: "var(--green)" },
        { label: "60 - 80", value: a.trust[1], color: "var(--amber)" },
        { label: "40 - 60", value: a.trust[2], color: "var(--orange)" },
        { label: "0 - 40", value: a.trust[3], color: "var(--red)" },
      ]
    : [];
  const trustTotal = trust.reduce((s, x) => s + x.value, 0);

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Analytics</h1>
          <div className="sub">Funnel performance and conversion rates, computed from real campaign data.</div>
        </div>
      </div>

      {error && <PageError text={error} />}
      {!a && !error && <div className="card"><PageEmpty text="Loading…" /></div>}

      {a && (
        <>
          {/* Rate cards */}
          <div className="stat-grid">
            <RateCard label="Approval rate" value={a.rates.approvalRate} sub={`${a.counts.approved}/${a.counts.total} leads`} />
            <RateCard label="Send rate" value={a.rates.sendRate} sub={`${a.counts.sent}/${a.counts.approved} approved`} />
            <RateCard label="Reply rate" value={a.rates.replyRate} sub={`${a.counts.replied}/${a.counts.sent} sent`} />
            <RateCard label="Positive rate" value={a.rates.positiveRate} sub={`${a.counts.positive} positive`} />
            <RateCard label="Meeting rate" value={a.rates.meetingRate} sub={`${a.counts.meetings} booked`} />
          </div>

          <div className="row-2">
            <div className="card">
              <div className="card-head">
                <span className="card-title">Conversion Funnel</span>
                <span className="pill-tag">live</span>
              </div>
              <div className="funnel-wrap">
                <div className="funnel">
                  {a.funnel.map((f, i) => (
                    <div key={f.label} className="funnel-bar" style={{ width: `${FUNNEL_WIDTHS[i]}%`, background: FUNNEL_COLORS[i] }}>
                      {f.value}
                    </div>
                  ))}
                </div>
                <div className="legend">
                  {a.funnel.map((f, i) => (
                    <div className="legend-row" key={f.label}>
                      <span className="dot" style={{ background: FUNNEL_COLORS[i] }} />
                      <span className="lg-label">{f.label}</span>
                      <span className="lg-val">{f.value}</span>
                      <span className="lg-pct">
                        {a.funnel[0].value ? `${((f.value / a.funnel[0].value) * 100).toFixed(1)}%` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <div className="card-head">
                  <span className="card-title">Trust Distribution</span>
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
          </div>

          {/* Phase 5 — Insights / learning layer */}
          <div className="card" style={{ marginTop: 18 }}>
            <div className="card-head">
              <span className="card-title">Insights &amp; Recommendations</span>
              <span className="badge green">Learning layer</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {a.insights.map((ins, i) => (
                <div key={i} className="insight" style={{ borderLeft: `3px solid ${toneColor(ins.tone)}` }}>
                  <div className="insight-title">
                    <span className="insight-dot" style={{ background: toneColor(ins.tone) }} />
                    {ins.title}
                  </div>
                  <div className="insight-detail">{ins.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function RateCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="stat">
      <div className="stat-top">{label}</div>
      <div className="stat-num" style={{ margin: "8px 0 4px" }}>{value}%</div>
      <div className="stat-foot">
        <span className="delta" style={{ color: "var(--muted-2)", fontWeight: 500 }}>{sub}</span>
      </div>
    </div>
  );
}

function toneColor(t: "good" | "warn" | "info"): string {
  if (t === "good") return "var(--green)";
  if (t === "warn") return "var(--amber)";
  return "var(--blue)";
}
