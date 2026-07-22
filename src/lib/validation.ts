import type { Company } from "../types";

// Hardening helpers. Nothing downstream trusts a value that hasn't passed here.

const MASK_MARKERS = ["email_not_unlocked", "not_unlocked", "@domain.com", "@example.com"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A real, deliverable-looking email — not masked, not a placeholder pattern. */
export function isValidEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const e = email.toLowerCase().trim();
  if (MASK_MARKERS.some((m) => e.includes(m))) return false;
  return EMAIL_RE.test(e);
}

/** A usable Apollo company must at least be identifiable and reachable. */
export function isCompleteCompany(c: Company | null): c is Company {
  return !!(c && c.name && c.website && c.externalId);
}

/** Raw Apollo org objects must have the fields we depend on before we trust them. */
export function validateApolloOrg(org: unknown): org is Record<string, unknown> {
  if (!org || typeof org !== "object") return false;
  const o = org as Record<string, unknown>;
  const hasName = typeof o.name === "string" && o.name.length > 0;
  const hasSite = typeof o.website_url === "string" || typeof o.domain === "string";
  const hasId = typeof o.id === "string" && o.id.length > 0;
  return hasName && hasSite && hasId;
}

/** Raw Apollo person objects must have a name + title before we score them. */
export function validateApolloPerson(p: unknown): p is Record<string, unknown> {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  const hasName =
    (typeof o.first_name === "string" && o.first_name.length > 0) ||
    (typeof o.name === "string" && o.name.length > 0);
  const hasTitle = typeof o.title === "string" && o.title.length > 0;
  return hasName && hasTitle;
}
