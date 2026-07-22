"use client";

import { AppShell } from "../components/AppShell";
import { useCampaigns, trustClass, initials, avatarColor, logoColor, fmtDate, PageEmpty, PageError } from "../components/data";

export default function LeadsPage() {
  const { campaigns, loading, error } = useCampaigns();

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Leads</h1>
          <div className="sub">Every discovered prospect and its verified contact data.</div>
        </div>
      </div>

      {error && <PageError text={error} />}

      <div className="card">
        <div className="card-head">
          <span className="card-title">
            All Leads {campaigns.length > 0 && <span className="nav-badge" style={{ marginLeft: 6 }}>{campaigns.length}</span>}
          </span>
        </div>
        {loading ? (
          <PageEmpty text="Loading…" />
        ) : campaigns.length === 0 ? (
          <PageEmpty text="No leads yet. Run the pipeline from Approvals to discover your first lead." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Trust</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const dm = c.decisionMaker;
                  const name = dm?.name ?? "—";
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="cell-user">
                          <span className="avatar" style={{ background: avatarColor(name) }}>
                            {dm ? initials(name) : "?"}
                          </span>
                          {name}
                        </div>
                      </td>
                      <td>
                        <div className="company">
                          <span className="logo-badge" style={{ background: logoColor(c.company?.name ?? "") }}>
                            {(c.company?.name ?? "—").charAt(0)}
                          </span>
                          {c.company?.name ?? "—"}
                        </div>
                      </td>
                      <td style={{ color: "var(--text-2)" }}>{dm?.role ?? "—"}</td>
                      <td style={{ color: "var(--text-2)" }}>
                        {dm?.email ?? "—"}{" "}
                        {dm?.email ? (
                          dm.emailVerified ? (
                            <span style={{ color: "var(--green-ink)", fontSize: 12 }}>✓</span>
                          ) : (
                            <span style={{ color: "var(--amber-ink)", fontSize: 12 }}>unverified</span>
                          )
                        ) : null}
                      </td>
                      <td>
                        <span className={`trust ${trustClass(c.trustScore)}`}>{c.trustScore}</span>
                      </td>
                      <td>
                        <span className={`badge-status ${c.status}`}>{c.status.replace("_", " ")}</span>
                      </td>
                      <td style={{ color: "var(--muted)" }}>{fmtDate(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
