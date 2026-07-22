"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
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

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Your leads, drafts and analytics stay private to your account.</p>

        <label className="auth-label">Name</label>
        <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Sujatro Ghosh" autoComplete="name" required />

        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />

        <label className="auth-label">Password</label>
        <input className="auth-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" required minLength={8} />

        <label className="auth-label">Confirm password</label>
        <input className="auth-input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" autoComplete="new-password" required />

        {error && <div className="auth-error">{error}</div>}

        <button className="btn btn-primary auth-submit" disabled={busy || !name.trim() || !email.trim() || password.length < 8}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <div className="auth-alt">
          Already have an account? <span className="link" onClick={() => router.push("/login")}>Sign in</span>
        </div>
      </form>
    </div>
  );
}
