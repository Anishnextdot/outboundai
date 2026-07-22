"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Icon } from "../components/icons";
import { TONE_OPTIONS } from "@/src/types";
import type { Campaign, Channel, EmailDraft, Tone } from "@/src/types";

export default function ApprovalsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [threshold, setThreshold] = useState(70);
  const [industry, setIndustry] = useState("Sports brands");
  const [employeeRange, setEmployeeRange] = useState("11-200");
  const [location, setLocation] = useState("");
  const [count, setCount] = useState(3);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (res.ok) {
        setCampaigns(data.campaigns ?? []);
        if (typeof data.trustThreshold === "number") setThreshold(data.trustThreshold);
        setError(null);
      } else {
        setError(data.error || "Failed to load campaigns");
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function runPipeline() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, employeeRange, location, count }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pipeline failed");
      await refresh();
      window.dispatchEvent(new Event("campaigns-updated"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Approvals</h1>
          <div className="sub">Review, edit, and approve outreach. Blocked leads never get outreach.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="runbar" style={{ marginBottom: 0 }}>
          <div className="field">
            <label>Industry / ICP</label>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Sports brands" />
          </div>
          <div className="field">
            <label>Employee range</label>
            <input value={employeeRange} onChange={(e) => setEmployeeRange(e.target.value)} placeholder="11-200" />
          </div>
          <div className="field">
            <label>Location (optional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. India" />
          </div>
          <div className="field">
            <label>How many leads</label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              style={{ minWidth: 90 }}
            />
          </div>
          <button className="btn btn-primary" onClick={runPipeline} disabled={running || !industry.trim()}>
            <Icon name="plus" size={16} />
            {running ? `Finding ${count} real lead${count > 1 ? "s" : ""}…` : `Find ${count} lead${count > 1 ? "s" : ""}`}
          </button>
        </div>
        <div className="sub" style={{ fontSize: 12.5, marginTop: 10 }}>
          Batch (2-10) finds multiple real companies fast (parametric research). Set to 1 for a single deep, web-search-grounded lead.
        </div>
      </div>

      {error && (
        <div className="notice" style={{ color: "var(--red-ink)", borderColor: "#f2c4c4" }}>
          {error}
        </div>
      )}

      <div className="notice">
        Approval requires a trust score of <b>{threshold}+</b> and a non-blocked status. A campaign is <b>BLOCKED</b>{" "}
        (and produces no outreach) if the company, decision-maker, or a verified email is missing.
      </div>

      {campaigns.length === 0 ? (
        <div className="empty">No campaigns yet. Run the pipeline above to generate your first lead.</div>
      ) : (
        campaigns.map((c) => <CampaignCard key={c.id} campaign={c} threshold={threshold} onChange={refresh} />)
      )}
    </AppShell>
  );
}

function CampaignCard({
  campaign,
  threshold,
  onChange,
}: {
  campaign: Campaign;
  threshold: number;
  onChange: () => void;
}) {
  const current = campaign.editedEmail ?? campaign.email;
  const currentLi = campaign.editedLinkedin ?? campaign.linkedin;
  const [subject, setSubject] = useState(current?.subject ?? "");
  const [body, setBody] = useState(current?.body ?? "");
  const [liBody, setLiBody] = useState(currentLi?.body ?? "");
  const [toneEmail, setToneEmail] = useState<Tone>((current?.tone as Tone) ?? "direct");
  const [toneLi, setToneLi] = useState<Tone>((currentLi?.tone as Tone) ?? "direct");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);
  const [fromEmail, setFromEmail] = useState("");

  const dm = campaign.decisionMaker;
  const company = campaign.company;
  const isBlocked = campaign.status === "blocked";
  const dirty = current ? subject !== current.subject || body !== current.body : false;
  const liDirty = currentLi ? liBody !== currentLi.body : false;
  const belowTrust = campaign.trustScore < threshold;
  const approveDisabled = busy || campaign.status !== "pending_review" || isBlocked || belowTrust;
  const alreadySent = campaign.sendStatus === "sent" || campaign.sendStatus === "simulated";
  const liSent = !!campaign.linkedinSentAt;

  async function act(
    action: "approve" | "reject" | "edit" | "send" | "regenerate" | "send_linkedin",
    opts?: { channel?: Channel; tone?: Tone; from?: string }
  ) {
    setBusy(true);
    setActionError(null);
    try {
      const channel: Channel = opts?.channel ?? "email";
      const payload: { id: string; action: string; email?: EmailDraft; channel?: Channel; tone?: Tone; from?: string } = {
        id: campaign.id,
        action,
        channel,
      };
      if (opts?.tone) payload.tone = opts.tone;
      if (opts?.from) payload.from = opts.from;
      if (action === "edit") {
        payload.email =
          channel === "linkedin"
            ? { subject: "", body: liBody, source: campaign.linkedin?.source ?? "claude" }
            : { subject, body, source: campaign.email?.source ?? "claude" };
      }
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      await onChange();
      // Tell the sidebar to refresh its pending-approvals count.
      window.dispatchEvent(new Event("campaigns-updated"));
      // LinkedIn: hand the message to the operator (clipboard + profile tab).
      if (action === "send_linkedin" && data.linkedin) {
        try {
          await navigator.clipboard.writeText(data.linkedin.message);
        } catch {
          /* clipboard may be blocked — the text is still on screen */
        }
        if (data.linkedin.profileUrl) window.open(data.linkedin.profileUrl, "_blank", "noopener");
      }

      const sent = data.send?.status as string | undefined;
      const provider = data.send?.provider as string | undefined;
      setFlash(
        action === "approve"
          ? "✓ Approved"
          : action === "reject"
          ? "✓ Rejected"
          : action === "regenerate"
          ? `✓ Regenerated (${opts?.tone ?? "direct"})`
          : action === "send_linkedin"
          ? "✓ DM copied — profile opened"
          : action === "send"
          ? sent === "simulated"
            ? "Simulated — no mail provider configured"
            : sent === "failed"
            ? `Send failed: ${data.send?.error ?? "unknown"}`
            : `✓ Sent via ${provider}`
          : "✓ Saved"
      );
      if (action === "send") setShowSend(false);
      setTimeout(() => setFlash(null), 3500);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sources = [company?.source, dm?.source].filter(Boolean);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="card-title" style={{ fontSize: 17 }}>{company?.name ?? "Unknown company"}</div>
          <div className="sub" style={{ fontSize: 13 }}>
            {company?.industry ?? campaign.icp.industry}
            {company?.location ? ` · ${company.location}` : ""}
            {company?.employeeCount ? ` · ${company.employeeCount} employees` : ""}
            {sources.length > 0 && <span className="pill-tag">source: {sources.join(" / ")}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`trust ${trustClass(campaign.trustScore)}`} title="Trust score">
            {campaign.trustScore}
          </span>
          <span className={`badge-status ${campaign.status}`}>{campaign.status.replace("_", " ")}</span>
        </div>
      </div>

      {isBlocked && (
        <div className="blocked-banner">
          <b>Blocked:</b> {campaign.blockedReason ?? "missing critical data"}. No outreach was generated.
        </div>
      )}

      <div className="block" style={{ marginBottom: 14 }}>
        <h3>Trust breakdown</h3>
        <div className="trustgrid">
          <TrustBar label="Company data" value={campaign.trust?.companyData ?? 0} />
          <TrustBar label="Decision maker" value={campaign.trust?.decisionMaker ?? 0} />
          <TrustBar label="Verified email" value={campaign.trust?.verifiedEmail ?? 0} />
          <TrustBar label="Research grounding" value={campaign.trust?.researchGrounding ?? 0} />
        </div>
      </div>

      <div className="grid">
        <div className="block">
          <h3>Decision Maker</h3>
          {dm ? (
            <div className="kv">
              <div><b>Who:</b> {dm.name} — {dm.role}</div>
              <div><b>Confidence:</b> {dm.confidence}</div>
              <div>
                <b>Email:</b> {dm.email ?? "—"}{" "}
                {dm.email ? (
                  dm.emailVerified ? (
                    <span style={{ color: "var(--green-ink)" }}>✓ verified</span>
                  ) : (
                    <span style={{ color: "var(--amber-ink)" }}>unverified</span>
                  )
                ) : null}
              </div>
              <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 13 }}>{dm.reasoning}</div>
            </div>
          ) : (
            <div className="kv" style={{ color: "var(--muted)" }}>No decision-maker identified.</div>
          )}
        </div>

        <div className="block">
          <h3>Research</h3>
          {campaign.research ? (
            <>
              <div className="kv" style={{ marginBottom: 8 }}>{campaign.research.summary}</div>
              <h3 style={{ marginTop: 8 }}>Opportunities</h3>
              <ul>
                {campaign.research.opportunities.slice(0, 3).map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="kv" style={{ color: "var(--muted)" }}>No research — outreach was not generated.</div>
          )}
        </div>
      </div>

      {campaign.angles.length > 0 && (
        <div className="block" style={{ marginTop: 14 }}>
          <h3>Outreach Angles</h3>
          <ul>
            {campaign.angles.map((a, i) => (
              <li key={i}><b>{a.observation}</b> {a.opportunity}</li>
            ))}
          </ul>
        </div>
      )}

      {!isBlocked && campaign.email && (
        <div style={{ marginTop: 14 }}>
          <div className="draft-head">
            <h3 className="draft-label">Email draft {campaign.email.source === "mock" ? "(mock)" : ""}</h3>
            <div className="tone-row">
              <select className="tone-select" value={toneEmail} onChange={(e) => setToneEmail(e.target.value as Tone)}>
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act("regenerate", { channel: "email", tone: toneEmail })}>
                {busy ? "…" : "↻ Regenerate"}
              </button>
              {!alreadySent && (
                <button className="btn btn-ghost btn-sm" disabled={busy || !dirty} onClick={() => act("edit", { channel: "email" })}>
                  {dirty ? "Save" : "Saved"}
                </button>
              )}
            </div>
          </div>
          <input
            style={{
              width: "100%",
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
              borderRadius: 9,
              padding: "9px 11px",
              marginBottom: 8,
              fontWeight: 600,
            }}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
      )}

      {/* LinkedIn DM channel */}
      {!isBlocked && (
        <div style={{ marginTop: 16 }}>
          <div className="draft-head">
            <h3 className="draft-label">
              LinkedIn DM {campaign.linkedin?.source === "mock" ? "(mock)" : ""}
              {dm?.linkedinUrl && (
                <a href={dm.linkedinUrl} target="_blank" rel="noreferrer" className="link" style={{ marginLeft: 8, fontSize: 11 }}>
                  open profile ↗
                </a>
              )}
            </h3>
            <div className="tone-row">
              <select className="tone-select" value={toneLi} onChange={(e) => setToneLi(e.target.value as Tone)}>
                {TONE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act("regenerate", { channel: "linkedin", tone: toneLi })}>
                {busy ? "…" : campaign.linkedin ? "↻ Regenerate" : "Generate"}
              </button>
              {campaign.linkedin && (
                <button className="btn btn-ghost btn-sm" disabled={busy || !liDirty} onClick={() => act("edit", { channel: "linkedin" })}>
                  {liDirty ? "Save" : "Saved"}
                </button>
              )}
            </div>
          </div>
          {campaign.linkedin ? (
            <textarea style={{ minHeight: 110 }} value={liBody} onChange={(e) => setLiBody(e.target.value)} />
          ) : (
            <div className="block" style={{ color: "var(--muted)", fontSize: 13 }}>
              No LinkedIn DM yet — click Generate.
            </div>
          )}
        </div>
      )}

      {actionError && (
        <div className="notice" style={{ color: "var(--red-ink)", borderColor: "#f2c4c4", marginTop: 12 }}>
          {actionError}
        </div>
      )}

      <div className="actions">
        <button className="btn approve" disabled={approveDisabled} onClick={() => act("approve")}>
          {campaign.status === "approved" ? "✓ Approved" : "Approve"}
        </button>
        {/* Phase 3 — send appears once approved. */}
        {campaign.status === "approved" && (
          alreadySent ? (
            <span className="status-tag" style={{ background: "var(--green-soft)", color: "var(--green-ink)" }}>
              {campaign.sendStatus === "simulated" ? "Sent (simulated)" : "Sent ✓"}
            </span>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={() => setShowSend((v) => !v)}>
              Send email
            </button>
          )
        )}
        {/* LinkedIn send — copies the DM and opens the real profile. */}
        {campaign.status === "approved" && campaign.linkedin && (
          liSent ? (
            <span className="status-tag" style={{ background: "var(--blue-soft)", color: "#1c5fbf" }}>
              LinkedIn sent ✓
            </span>
          ) : (
            <button className="btn btn-ghost" disabled={busy} onClick={() => act("send_linkedin")}>
              Send on LinkedIn
            </button>
          )
        )}
        <button className="btn reject" disabled={busy || campaign.status === "rejected"} onClick={() => act("reject")}>
          {campaign.status === "rejected" ? "✓ Rejected" : "Reject"}
        </button>
        {flash && <span style={{ color: "var(--green-ink)", fontWeight: 600, fontSize: 13.5 }}>{flash}</span>}
        {belowTrust && !isBlocked && campaign.status === "pending_review" && (
          <span style={{ color: "var(--amber-ink)", fontSize: 13 }}>
            Trust {campaign.trustScore} &lt; {threshold} — approval locked
          </span>
        )}
      </div>

      {/* Send dialog — asks which address to send from. */}
      {showSend && !alreadySent && (
        <div className="send-panel">
          <div className="send-row">
            <span className="send-label">From</span>
            <input
              className="auth-input send-input"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>
          <div className="send-row">
            <span className="send-label">To</span>
            <span className="send-to">{dm?.email ?? "—"}</span>
          </div>
          <div className="send-row">
            <span className="send-label">Subject</span>
            <span className="send-to">{(campaign.editedEmail ?? campaign.email)?.subject}</span>
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button
              className="btn btn-primary"
              disabled={busy || !fromEmail.trim()}
              onClick={() => act("send", { from: fromEmail.trim() })}
            >
              {busy ? "Sending…" : "Send now"}
            </button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setShowSend(false)}>
              Cancel
            </button>
            <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
              Sends for real via your mail provider (Resend/SMTP). Without one configured it&apos;s simulated.
            </span>
          </div>
        </div>
      )}

      <div className="log">{campaign.log.join("  ·  ")}</div>
    </div>
  );
}

function TrustBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="trustbar-label">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="trustbar-track">
        <div className="trustbar-fill" style={{ width: `${value}%`, background: barColor(value) }} />
      </div>
    </div>
  );
}

function trustClass(t: number): string {
  if (t >= 75) return "high";
  if (t >= 50) return "mid";
  return "low";
}

function barColor(v: number): string {
  if (v >= 75) return "#22c55e";
  if (v >= 50) return "#f59e0b";
  return "#ef4444";
}
