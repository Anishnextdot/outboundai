"use client";

import { AppShell } from "../components/AppShell";
import { useCampaigns, PageEmpty, PageError } from "../components/data";

export default function ResearchPage() {
  const { campaigns, loading, error } = useCampaigns();
  const withResearch = campaigns.filter((c) => c.research);

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Research</h1>
          <div className="sub">Structured dossiers generated before any outreach.</div>
        </div>
      </div>

      {error && <PageError text={error} />}

      {loading ? (
        <div className="card"><PageEmpty text="Loading…" /></div>
      ) : withResearch.length === 0 ? (
        <div className="card">
          <PageEmpty text="No research yet. Non-blocked leads get a research dossier when the pipeline runs." />
        </div>
      ) : (
        withResearch.map((c) => {
          const r = c.research!;
          return (
            <div className="card" key={c.id} style={{ marginBottom: 16 }}>
              <div className="card-head">
                <span className="card-title">{c.company?.name ?? "Unknown company"}</span>
                <span className={`badge ${r.grounded ? "green" : ""}`} style={r.grounded ? {} : { background: "var(--surface-2)", color: "var(--muted)", border: "1px solid var(--border)" }}>
                  {r.grounded ? "Web-grounded" : `${r.source}`}
                </span>
              </div>
              <div className="kv" style={{ marginBottom: 12 }}>{r.summary}</div>
              <div className="grid">
                <div className="block">
                  <h3>Opportunities</h3>
                  <ul>{r.opportunities.slice(0, 4).map((o, i) => <li key={i}>{o}</li>)}</ul>
                </div>
                <div className="block">
                  <h3>Positioning &amp; Competitors</h3>
                  <div className="kv" style={{ marginBottom: 8 }}>{r.marketPositioning}</div>
                  <h3 style={{ marginTop: 8 }}>Competitors</h3>
                  <div className="kv" style={{ color: "var(--text-2)" }}>{r.competitors.slice(0, 5).join(", ") || "—"}</div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </AppShell>
  );
}
