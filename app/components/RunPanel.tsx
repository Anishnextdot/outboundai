"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import type { Campaign, Icp } from "@/src/types";

// ------------------------------------------------------- stream event shapes

export type RunEvent =
  | { t: "start"; count: number; icp: Icp }
  | { t: "discovered"; companies: { key: string; name: string; source: string | null }[] }
  | { t: "step"; key: string; node: string; company: string | null; blocked: boolean }
  | { t: "lead"; key: string; campaign: Campaign }
  | { t: "lead_error"; key: string; message: string }
  | { t: "done"; count: number }
  | { t: "error"; message: string };

/**
 * POST the pipeline and hand back each NDJSON line as it arrives. Every event
 * comes from a real pipeline callback, so the UI never has to guess progress.
 */
export async function runPipelineStream(
  body: { industry: string; employeeRange?: string; location?: string; count: number },
  onEvent: (e: RunEvent) => void
): Promise<void> {
  const res = await fetch("/api/pipeline", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    // Auth/validation failures still answer with plain JSON.
    let message = `Pipeline failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      /* non-JSON body — keep the status message */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as RunEvent);
      } catch {
        /* partial or malformed line — ignore rather than kill the run */
      }
    }
  }
  if (buf.trim()) {
    try {
      onEvent(JSON.parse(buf) as RunEvent);
    } catch {
      /* trailing junk */
    }
  }
}

// --------------------------------------------------------------- run tracking

export const NODE_ORDER = ["discover", "findPerson", "assess", "doResearch", "personalize", "writeContent"] as const;

/** What the pipeline is doing *now* — indexed by the node that is running. */
const NODE_DOING: Record<string, string> = {
  discover: "Identifying the company",
  findPerson: "Finding the decision maker",
  assess: "Verifying company + contact data",
  doResearch: "Researching the company",
  personalize: "Building outreach angles",
  writeContent: "Writing email + LinkedIn DM",
};

export type LeadPhase = "queued" | "running" | "done" | "blocked" | "failed";

export interface RunLead {
  key: string;
  company: string | null;
  source: string | null;
  /** Nodes completed so far — drives the bar. */
  steps: number;
  phase: LeadPhase;
  trustScore?: number;
  error?: string;
}

export interface RunState {
  active: boolean;
  requested: number;
  discovering: boolean;
  leads: RunLead[];
  startedAt: number;
  finishedAt: number | null;
  found: number;
  error: string | null;
}

export function newRun(requested: number): RunState {
  return {
    active: true,
    requested,
    discovering: true,
    leads: [],
    startedAt: Date.now(),
    finishedAt: null,
    found: 0,
    error: null,
  };
}

/** Fold one stream event into the run state. */
export function reduceRun(s: RunState, e: RunEvent): RunState {
  switch (e.t) {
    case "start":
      return { ...s, requested: e.count };

    case "discovered":
      return {
        ...s,
        discovering: false,
        leads: e.companies.map((c) => ({
          key: c.key,
          company: c.name,
          source: c.source,
          steps: 0,
          phase: "queued" as LeadPhase,
        })),
      };

    case "step": {
      const idx = NODE_ORDER.indexOf(e.node as (typeof NODE_ORDER)[number]);
      const steps = idx >= 0 ? idx + 1 : 0;
      const exists = s.leads.some((l) => l.key === e.key);
      const leads = exists
        ? s.leads.map((l) =>
            l.key === e.key
              ? {
                  ...l,
                  company: e.company ?? l.company,
                  steps: Math.max(l.steps, steps),
                  phase: l.phase === "done" ? l.phase : ("running" as LeadPhase),
                }
              : l
          )
        : // Single-lead runs have no discovery event — the row is created here.
          [...s.leads, { key: e.key, company: e.company, source: null, steps, phase: "running" as LeadPhase }];
      return { ...s, discovering: false, leads };
    }

    case "lead": {
      const blocked = e.campaign.status === "blocked";
      const leads = s.leads.map((l) =>
        l.key === e.key
          ? {
              ...l,
              company: e.campaign.company?.name ?? l.company,
              steps: NODE_ORDER.length,
              phase: (blocked ? "blocked" : "done") as LeadPhase,
              trustScore: e.campaign.trustScore,
            }
          : l
      );
      return { ...s, leads, found: s.found + 1 };
    }

    case "lead_error":
      return {
        ...s,
        leads: s.leads.map((l) => (l.key === e.key ? { ...l, phase: "failed" as LeadPhase, error: e.message } : l)),
      };

    case "done":
      return { ...s, active: false, discovering: false, finishedAt: Date.now() };

    case "error":
      return { ...s, active: false, discovering: false, finishedAt: Date.now(), error: e.message };
  }
}

// ------------------------------------------------------------------ the panel

export function RunPanel({ run, onDismiss }: { run: RunState; onDismiss: () => void }) {
  const elapsed = useElapsed(run.startedAt, run.finishedAt);
  const totalSteps = run.leads.length * NODE_ORDER.length;
  const doneSteps = run.leads.reduce((a, l) => a + l.steps, 0);
  const pct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const built = run.leads.filter((l) => l.phase === "done" || l.phase === "blocked").length;

  return (
    <div className={`runpanel${run.active ? " is-active" : ""}`}>
      <div className="runpanel-head">
        <span className={`runpanel-ic${run.active ? " spin" : ""}`}>
          <Icon name={run.active ? "sparkle" : run.error ? "alert" : "check"} size={18} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="runpanel-title">
            {run.active
              ? run.discovering
                ? `Searching for ${run.requested} real compan${run.requested === 1 ? "y" : "ies"}…`
                : `Building ${run.leads.length} lead${run.leads.length === 1 ? "" : "s"} — ${built} of ${run.leads.length} ready`
              : run.error
              ? "Run failed"
              : `Done — ${run.found} lead${run.found === 1 ? "" : "s"} added`}
          </div>
          <div className="runpanel-sub">
            {run.error ?? `${fmtElapsed(elapsed)} elapsed${run.active && !run.discovering ? ` · ${pct}%` : ""}`}
          </div>
        </div>
        {!run.active && (
          <button className="btn btn-ghost btn-sm" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>

      <div className="runbar-track">
        <div
          className={`runbar-fill${run.discovering && run.active ? " indeterminate" : ""}`}
          style={run.discovering && run.active ? undefined : { width: `${run.active ? pct : 100}%` }}
        />
      </div>

      {run.discovering && run.active ? (
        <div className="run-skeletons">
          {Array.from({ length: Math.min(run.requested, 6) }, (_, i) => (
            <div className="skel-row" key={i}>
              <span className="skel skel-dot" />
              <span className="skel skel-line" style={{ width: `${52 - i * 4}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <div className="run-leads">
          {run.leads.map((l) => (
            <RunLeadRow key={l.key} lead={l} />
          ))}
        </div>
      )}
    </div>
  );
}

function RunLeadRow({ lead }: { lead: RunLead }) {
  const settled = lead.phase === "done" || lead.phase === "blocked" || lead.phase === "failed";
  const doing = NODE_DOING[NODE_ORDER[Math.min(lead.steps, NODE_ORDER.length - 1)]];

  return (
    <div className={`run-lead ${lead.phase}`}>
      <span className={`run-lead-ic${settled ? "" : " spin"}`}>
        {lead.phase === "done" ? (
          <Icon name="check" size={14} />
        ) : lead.phase === "blocked" ? (
          <Icon name="shield" size={14} />
        ) : lead.phase === "failed" ? (
          <Icon name="alert" size={14} />
        ) : (
          <Icon name="sparkle" size={14} />
        )}
      </span>

      <div className="run-lead-body">
        <div className="run-lead-name">
          {lead.company ?? "Searching…"}
          {lead.source && <span className="pill-tag">{lead.source}</span>}
        </div>
        <div className="run-lead-stage">
          {lead.phase === "done"
            ? `Ready for review${lead.trustScore !== undefined ? ` · trust ${lead.trustScore}` : ""}`
            : lead.phase === "blocked"
            ? `Blocked — missing critical data${lead.trustScore !== undefined ? ` · trust ${lead.trustScore}` : ""}`
            : lead.phase === "failed"
            ? lead.error ?? "Failed"
            : lead.phase === "queued"
            ? "Queued"
            : doing + "…"}
        </div>
      </div>

      <div className="run-steps" title={`${lead.steps} of ${NODE_ORDER.length} stages complete`}>
        {NODE_ORDER.map((n, i) => (
          <span key={n} className={`run-step${i < lead.steps ? " on" : ""}${i === lead.steps && !settled ? " now" : ""}`} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- small bits

/** Real wall-clock elapsed time for the run. */
function useElapsed(startedAt: number, finishedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (finishedAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [finishedAt]);
  return Math.max(0, (finishedAt ?? now) - startedAt);
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
