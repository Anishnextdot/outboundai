// Central place to read configuration. Nothing else touches process.env directly.

type AppMode = "production" | "demo";

function parseMode(v: string | undefined): AppMode {
  return (v || "demo").trim().toLowerCase() === "production" ? "production" : "demo";
}

export const env = {
  appMode: parseMode(process.env.APP_MODE),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || "",
  apolloApiKey: process.env.APOLLO_API_KEY?.trim() || "",
  model: process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-8",
  // Cost tiering: cheap model for mechanical stages (research, personalization),
  // stronger writer model for the email copy that carries the value prop.
  modelFast: process.env.CLAUDE_MODEL_FAST?.trim() || "claude-haiku-4-5",
  modelWriter: process.env.CLAUDE_MODEL_WRITER?.trim() || "claude-sonnet-5",
  enableWebSearch: process.env.ENABLE_WEB_SEARCH?.trim() === "true",
  supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
  trustThreshold: clampInt(process.env.TRUST_THRESHOLD, 70, 0, 100),
  // Phase 3 — SMTP sending. Without a provider (Resend or SMTP) sends are
  // SIMULATED: recorded, not delivered. With one configured, sending is LIVE —
  // set SIMULATE_SEND=true to keep recording without delivering.
  smtpHost: process.env.SMTP_HOST?.trim() || "",
  smtpPort: clampInt(process.env.SMTP_PORT, 587, 1, 65535),
  smtpUser: process.env.SMTP_USER?.trim() || "",
  smtpPass: process.env.SMTP_PASS?.trim() || "",
  smtpSecure: process.env.SMTP_SECURE?.trim() === "true",
  fromEmail: process.env.FROM_EMAIL?.trim() || "",
  fromName: process.env.FROM_NAME?.trim() || "",
  // Resend — the simplest real mail tool (API key only, no SMTP setup).
  resendApiKey: process.env.RESEND_API_KEY?.trim() || "",
  // Force simulation even when a provider is configured (safe testing).
  simulateSend: process.env.SIMULATE_SEND?.trim() === "true",
  // Signs the session cookie. Falls back to the service key so it works out of
  // the box; set SESSION_SECRET explicitly for production.
  sessionSecret: process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "arka-dev-secret",
  // Demo-only escape hatch: lets the mock decision-maker present a "verified"
  // email so you can see the full happy path without a real Apollo key.
  // Ignored entirely in production mode.
  demoForceVerified: process.env.DEMO_FORCE_VERIFIED?.trim() === "true",
};

export const isProduction = () => env.appMode === "production";

/** Mock/fabricated data is permitted ONLY outside production. */
export const allowMock = () => !isProduction();

export const hasAnthropic = () => env.anthropicApiKey.length > 0;
export const hasApollo = () => env.apolloApiKey.length > 0;
export const hasSupabase = () => env.supabaseUrl.length > 0 && env.supabaseServiceKey.length > 0;
export const hasSmtp = () =>
  env.smtpHost.length > 0 && env.smtpUser.length > 0 && env.smtpPass.length > 0;
export const hasResend = () => env.resendApiKey.length > 0;

function clampInt(v: string | undefined, dflt: number, min: number, max: number): number {
  const n = v === undefined ? dflt : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, Math.round(n)));
}
