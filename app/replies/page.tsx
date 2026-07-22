"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { fmtDate, PageEmpty, PageError } from "../components/data";
import type { OutreachResponse } from "@/src/types";

export default function RepliesPage() {
  const [responses, setResponses] = useState<OutreachResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/responses");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load responses");
        setResponses(data.responses ?? []);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Replies</h1>
          <div className="sub">Responses from prospects, classified by sentiment. Log them from the Sent screen.</div>
        </div>
      </div>

      {error && <PageError text={error} />}

      <div className="card">
        <div className="card-head">
          <span className="card-title">
            Responses {responses.length > 0 && <span className="nav-badge" style={{ marginLeft: 6 }}>{responses.length}</span>}
          </span>
        </div>
        {loading ? (
          <PageEmpty text="Loading…" />
        ) : responses.length === 0 ? (
          <PageEmpty text="No replies yet. Send emails and log responses from the Sent page to see them here." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Sentiment</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.contact ?? "—"}</td>
                    <td style={{ color: "var(--text-2)" }}>{r.company ?? "—"}</td>
                    <td style={{ color: "var(--text-2)", textTransform: "capitalize" }}>{r.type}</td>
                    <td>{r.sentiment ? <SentimentPill s={r.sentiment} /> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td style={{ color: "var(--muted)" }}>{r.receivedAt ? fmtDate(r.receivedAt) : fmtDate(r.createdAt)}</td>
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

function SentimentPill({ s }: { s: "positive" | "neutral" | "negative" }) {
  const style =
    s === "positive"
      ? { background: "var(--green-soft)", color: "var(--green-ink)" }
      : s === "negative"
      ? { background: "var(--red-soft)", color: "var(--red-ink)" }
      : { background: "var(--surface-2)", color: "var(--muted)" };
  return (
    <span className="status-tag" style={style}>
      {s}
    </span>
  );
}
