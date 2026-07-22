"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRegister, setNeedsRegister] = useState(false);
  const [checking, setChecking] = useState(true);

  // Already signed in? Go straight to the dashboard.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          router.replace("/dashboard");
          return;
        }
      } catch {
        /* stay on login */
      }
      setChecking(false);
    })();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNeedsRegister(false);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNeedsRegister(!!data.needsRegister);
        throw new Error(data.error || "Sign in failed");
      }
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="auth-wrap">
        <div className="auth-loading">Checking your session…</div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">ARKA ALLIANCE</div>
            <div className="brand-sub">Outbound AI Agent</div>
          </div>
        </div>

        <h1 className="auth-title">Sign in</h1>
        <p className="auth-sub">Welcome back. Your workspace is private to your account.</p>

        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />

        <label className="auth-label">Password</label>
        <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" required />

        {error && (
          <div className="auth-error">
            {error}
            {needsRegister && (
              <>
                {" "}
                <span className="link" onClick={() => router.push("/register")}>
                  Register now
                </span>
              </>
            )}
          </div>
        )}

        <button className="btn btn-primary auth-submit" disabled={busy || !email.trim() || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="auth-alt">
          New here? <span className="link" onClick={() => router.push("/register")}>Create an account</span>
        </div>
      </form>
    </div>
  );
}
