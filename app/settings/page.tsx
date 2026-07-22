"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { PageError, PageEmpty } from "../components/data";

interface Config {
  appMode: string;
  model: string;
  trustThreshold: number;
  enableWebSearch: boolean;
  demoForceVerified: boolean;
  integrations: { supabase: boolean; apollo: boolean; anthropic: boolean };
}

export default function SettingsPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load config");
        setCfg(data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1>Settings</h1>
          <div className="sub">Runtime configuration. Values are set in .env.local (server-side).</div>
        </div>
      </div>

      {error && <PageError text={error} />}
      {!cfg && !error && <div className="card"><PageEmpty text="Loading…" /></div>}

      {cfg && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <span className="card-title">Integrations</span>
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-name">Supabase</div>
                <div className="setting-sub">Persistence (companies, contacts, campaigns…)</div>
              </div>
              <ConnBadge ok={cfg.integrations.supabase} />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-name">Apollo.io</div>
                <div className="setting-sub">Company + decision-maker + verified email data</div>
              </div>
              <ConnBadge ok={cfg.integrations.apollo} />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-name">Claude (Anthropic)</div>
                <div className="setting-sub">Research, personalization, and email drafting</div>
              </div>
              <ConnBadge ok={cfg.integrations.anthropic} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Pipeline configuration</span>
            </div>
            <SettingItem label="Run mode" value={cfg.appMode} hint={cfg.appMode === "production" ? "No fabricated data — missing data blocks the lead." : "Mock fallback allowed and labelled."} />
            <SettingItem label="Model" value={cfg.model} />
            <SettingItem label="Trust threshold" value={String(cfg.trustThreshold)} hint="Minimum trust score required to approve a campaign." />
            <SettingItem label="Web-search grounding" value={cfg.enableWebSearch ? "On" : "Off"} hint="When on, research is grounded in live web results (raises trust)." />
            <SettingItem label="Demo force-verified email" value={cfg.demoForceVerified ? "On" : "Off"} hint="Demo only — presents a verified mock email so the happy path shows offline." />
          </div>
        </>
      )}
    </AppShell>
  );
}

function ConnBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="agent-status">
      <span className="live" /> Connected
    </span>
  ) : (
    <span className="status-tag blocked">Not configured</span>
  );
}

function SettingItem({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="setting-row">
      <div>
        <div className="setting-name">{label}</div>
        {hint && <div className="setting-sub">{hint}</div>}
      </div>
      <span className="setting-val">{value}</span>
    </div>
  );
}
