"use client";

import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { useCampaigns, fmtDate, PageEmpty, PageError } from "../components/data";
import type { Campaign, Sentiment } from "@/src/types";

export default function SentPage() {
  const { campaigns, loading, error } = useCampaigns();
  // Either channel counts as sent — LinkedIn DMs are handed off manually but
  // recorded via linkedinSentAt, so they belong here too.
  const sent = campaigns.filter(
    (c) =>
      c.sendStatus === "sent" ||
      c.sendStatus === "simulated" ||
      c.sendStatus === "failed" ||
      c.linkedinSentAt
  );

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Sent</h1>
          <div className="sub">Approved emails that have gone out. Log replies here to feed Analytics.</div>
        </div>
      </div>

      {error && <PageError text={error} />}

      <div className="card">
        <div className="card-head">
          <span className="card-title">
            Sent emails {sent.length > 0 && <span className="nav-badge" style={{ marginLeft: 6 }}>{sent.length}</span>}
          </span>
        </div>
        {loading ? (
          <PageEmpty text="Loading…" />
        ) : sent.length === 0 ? (
          <PageEmpty text="Nothing sent yet. Approve a campaign, then click Send in Approvals." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Company</th>
                  <th>Subject</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Log reply</th>
                </tr>
              </thead>
              <tbody>
                {sent.map((c) => (
                  <SentRow key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SentRow({ c }: { c: Campaign }) {
  const [logged, setLogged] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailSent = c.sendStatus !== "not_sent";
  const linkedinSent = !!c.linkedinSentAt;
  // A campaign can go out on one channel or both.
  const channel = emailSent && linkedinSent ? "Email + LinkedIn" : linkedinSent ? "LinkedIn" : "Email";
  const draft = emailSent ? c.editedEmail ?? c.email : c.editedLinkedin ?? c.linkedin;
  // LinkedIn DMs have no subject line — show the opening instead.
  const label = emailSent ? draft?.subject : draft?.body?.slice(0, 60);
  const when = emailSent ? c.sentAt : c.linkedinSentAt;

  async function logReply(type: "reply" | "meeting", sentiment: Sentiment | null) {
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: c.id, type, sentiment }),
      });
      if (res.ok) {
        setLogged(type === "meeting" ? "meeting booked" : `${sentiment} reply`);
      } else {
        // Don't leave the button looking untouched on failure.
        const data = await res.json().catch(() => ({}));
        setFailed(data.error || `Couldn't log (HTTP ${res.status})`);
      }
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{c.decisionMaker?.name ?? "—"}</td>
      <td style={{ color: "var(--text-2)" }}>{c.company?.name ?? "—"}</td>
      <td style={{ color: "var(--text-2)", maxWidth: 320 }}>{label || "—"}</td>
      <td style={{ color: "var(--text-2)" }}>{channel}</td>
      <td>
        <span
          className="status-tag"
          style={
            c.sendStatus === "failed"
              ? { background: "var(--red-soft)", color: "var(--red-ink)" }
              : c.sendStatus === "simulated"
              ? { background: "var(--amber-soft)", color: "var(--amber-ink)" }
              : { background: "var(--green-soft)", color: "var(--green-ink)" }
          }
        >
          {emailSent ? c.sendStatus : "sent"}
        </span>
      </td>
      <td style={{ color: "var(--muted)" }}>{when ? fmtDate(when) : "—"}</td>
      <td>
        {logged ? (
          <span style={{ color: "var(--green-ink)", fontSize: 13, fontWeight: 600 }}>✓ {logged}</span>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn btn-review" disabled={busy} onClick={() => logReply("reply", "positive")} title="Positive reply">
              👍
            </button>
            <button className="btn btn-review" disabled={busy} onClick={() => logReply("reply", "neutral")} title="Neutral reply">
              💬
            </button>
            <button className="btn btn-review" disabled={busy} onClick={() => logReply("reply", "negative")} title="Negative reply">
              👎
            </button>
            <button className="btn btn-review" disabled={busy} onClick={() => logReply("meeting", "positive")} title="Meeting booked">
              📅
            </button>
            {failed && <span style={{ color: "var(--red-ink)", fontSize: 12 }}>{failed}</span>}
          </div>
        )}
      </td>
    </tr>
  );
}
