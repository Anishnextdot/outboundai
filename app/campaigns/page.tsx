"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { useCampaigns, trustClass, fmtDate, PageEmpty, PageError } from "../components/data";

export default function CampaignsPage() {
  const router = useRouter();
  const { campaigns, loading, error } = useCampaigns();

  const counts = {
    total: campaigns.length,
    pending: campaigns.filter((c) => c.status === "pending_review").length,
    approved: campaigns.filter((c) => c.status === "approved").length,
    blocked: campaigns.filter((c) => c.status === "blocked").length,
  };

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Campaigns</h1>
          <div className="sub">Every pipeline run and its outcome.</div>
        </div>
        <button className="btn btn-primary" onClick={() => router.push("/approvals")}>
          Run a pipeline
        </button>
      </div>

      {error && <PageError text={error} />}

      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {[
          { k: "Total", v: counts.total },
          { k: "Pending", v: counts.pending },
          { k: "Approved", v: counts.approved },
          { k: "Blocked", v: counts.blocked },
        ].map((s) => (
          <div className="stat" key={s.k}>
            <div className="stat-top">{s.k}</div>
            <div className="stat-num" style={{ margin: "8px 0 0" }}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">All Campaigns</span>
        </div>
        {loading ? (
          <PageEmpty text="Loading…" />
        ) : campaigns.length === 0 ? (
          <PageEmpty text="No campaigns yet. Run the pipeline from Approvals." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>ICP</th>
                  <th>Decision Maker</th>
                  <th>Trust</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => router.push("/approvals")}>
                    <td style={{ fontWeight: 600 }}>{c.company?.name ?? "—"}</td>
                    <td style={{ color: "var(--text-2)" }}>{c.icp.industry}</td>
                    <td style={{ color: "var(--text-2)" }}>{c.decisionMaker?.name ?? "—"}</td>
                    <td>
                      <span className={`trust ${trustClass(c.trustScore)}`}>{c.trustScore}</span>
                    </td>
                    <td>
                      <span className={`badge-status ${c.status}`}>{c.status.replace("_", " ")}</span>
                    </td>
                    <td style={{ color: "var(--muted)" }}>{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
