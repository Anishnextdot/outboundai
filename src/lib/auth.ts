import { cookies } from "next/headers";
import crypto from "crypto";
import { env, isProduction } from "./env";
import { getSupabase } from "./db/client";

export const SESSION_COOKIE = "arka_session";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
}

// ---------------------------------------------------------------------------
// Session cookie: `<userId>.<hmac>` — the HMAC prevents forging another user's id.
// ---------------------------------------------------------------------------

// The last-resort literal in env.ts is public knowledge — signing real sessions
// with it means anyone can forge a cookie for any user id. Never in production.
const DEV_SECRET = "arka-dev-secret";

function sign(value: string): string {
  if (isProduction() && env.sessionSecret === DEV_SECRET) {
    throw new Error("SESSION_SECRET must be set in production (refusing to sign sessions with the public dev secret)");
  }
  return crypto.createHmac("sha256", env.sessionSecret).update(value).digest("hex");
}

export function makeToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function parseToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const id = token.slice(0, i);
  const sig = token.slice(i + 1);
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(id));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

// ---------------------------------------------------------------------------
// Passwords — scrypt (built into Node, no extra dependency).
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const USER_COLS = "id,email,name,from_email,from_name";

function toSessionUser(row: Record<string, unknown>): SessionUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: (row.name as string) ?? null,
    fromEmail: (row.from_email as string) ?? null,
    fromName: (row.from_name as string) ?? null,
  };
}

/** Current user from the session cookie, or null when signed out. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const id = parseToken(store.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  try {
    const db = getSupabase();
    const { data, error } = await db.from("users").select(USER_COLS).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return toSessionUser(data);
  } catch {
    return null;
  }
}

export type RegisterResult = { ok: true; user: SessionUser } | { ok: false; error: string };

/**
 * Register a new account. If the email exists but has no password yet (created
 * before password auth existed), the registration claims it by setting one.
 */
export async function registerUser(name: string, email: string, password: string): Promise<RegisterResult> {
  const db = getSupabase();
  const normalized = email.trim().toLowerCase();

  const { data: existing } = await db
    .from("users")
    .select("id,email,name,password_hash,from_email,from_name")
    .eq("email", normalized)
    .maybeSingle();

  if (existing?.password_hash) {
    return { ok: false, error: "That email is already registered — please sign in instead." };
  }

  const password_hash = hashPassword(password);

  if (existing) {
    // Legacy account with no password — claim it.
    const { data, error } = await db
      .from("users")
      .update({ password_hash, name: name.trim(), last_login: new Date().toISOString() })
      .eq("id", existing.id)
      .select(USER_COLS)
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: toSessionUser(data) };
  }

  const { data, error } = await db
    .from("users")
    .insert({ email: normalized, name: name.trim(), password_hash, last_login: new Date().toISOString() })
    .select(USER_COLS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: toSessionUser(data) };
}

export type LoginResult = { ok: true; user: SessionUser } | { ok: false; error: string; needsRegister?: boolean };

/** Sign in with email + password. */
export async function loginUser(email: string, password: string): Promise<LoginResult> {
  const db = getSupabase();
  const normalized = email.trim().toLowerCase();

  const { data: user } = await db
    .from("users")
    .select("id,email,name,password_hash,from_email,from_name")
    .eq("email", normalized)
    .maybeSingle();

  if (!user) return { ok: false, error: "No account with that email. Please register first.", needsRegister: true };
  if (!user.password_hash)
    return { ok: false, error: "This account has no password yet — please register to set one.", needsRegister: true };
  if (!verifyPassword(password, user.password_hash as string))
    return { ok: false, error: "Incorrect email or password." };

  await db.from("users").update({ last_login: new Date().toISOString() }).eq("id", user.id);
  return { ok: true, user: toSessionUser(user) };
}

/** Remember the address this user sends outreach from. */
export async function saveSender(userId: string, fromEmail: string, fromName?: string | null): Promise<void> {
  const db = getSupabase();
  await db
    .from("users")
    .update({ from_email: fromEmail.trim().toLowerCase(), from_name: fromName?.trim() || null })
    .eq("id", userId);
}
