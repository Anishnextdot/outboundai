"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { useCampaigns, fmtDate, PageEmpty, PageError } from "../components/data";

export default function DraftsPage() {
  const router = useRouter();
  const { campaigns, loading, error } = useCampaigns();
  // A campaign may have only a LinkedIn draft — that's still a draft.
  const drafts = campaigns.filter((c) => (c.email || c.linkedin) && c.status !== "blocked");

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Drafts</h1>
          <div className="sub">Generated emails awaiting review. Approve or edit them in Approvals.</div>
        </div>
      </div>

      {error && <PageError text={error} />}

      {loading ? (
        <div className="card"><PageEmpty text="Loading…" /></div>
      ) : drafts.length === 0 ? (
        <div className="card">
          <PageEmpty text="No drafts yet. Blocked leads produce none — only non-blocked leads get an email draft." />
        </div>
      ) : (
        drafts.map((c) => {
          // Either channel may be missing — show whichever drafts exist.
          const email = c.editedEmail ?? c.email;
          const linkedin = c.editedLinkedin ?? c.linkedin;
          return (
            <div className="card" key={c.id} style={{ marginBottom: 16 }}>
              <div className="card-head" style={{ alignItems: "flex-start" }}>
                <div>
                  <div className="card-title">{email?.subject ?? `LinkedIn DM · ${c.decisionMaker?.name ?? "prospect"}`}</div>
                  <div className="sub" style={{ fontSize: 13 }}>
                    {c.decisionMaker?.name ?? "—"} · {c.company?.name ?? "—"}
                    {c.editedEmail || c.editedLinkedin ? <span className="pill-tag">edited</span> : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`badge-status ${c.status}`}>{c.status.replace("_", " ")}</span>
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>{fmtDate(c.createdAt)}</span>
                </div>
              </div>
              {email && (
                <div className="block" style={{ whiteSpace: "pre-wrap", fontSize: 13.5, color: "var(--text-2)" }}>
                  {email.body}
                </div>
              )}
              {linkedin && (
                <div className="block" style={{ whiteSpace: "pre-wrap", fontSize: 13.5, color: "var(--text-2)", marginTop: email ? 12 : 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>LINKEDIN DM</div>
                  {linkedin.body}
                </div>
              )}
              <div className="actions">
                <button className="btn btn-primary" onClick={() => router.push("/approvals")}>
                  Review in Approvals
                </button>
              </div>
            </div>
          );
        })
      )}
    </AppShell>
  );
}
