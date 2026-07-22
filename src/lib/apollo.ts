import { env, hasApollo, allowMock } from "./env";
import { validateApolloOrg, validateApolloPerson, isValidEmail } from "./validation";
import type { Company, Icp } from "../types";

export { hasApollo };

const BASE = "https://api.apollo.io/api/v1";

/** A decision-maker candidate before scoring/reveal. */
export interface Candidate {
  name: string;
  role: string;
  linkedinUrl: string | null;
  email: string | null;
  emailVerified: boolean;
  externalId: string | null;
  source: "apollo" | "mock";
}

function apolloHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "X-Api-Key": env.apolloApiKey,
  };
}

/** Map a coarse ICP employee range to Apollo's bucket strings. */
function employeeRanges(range?: string): string[] {
  if (!range) return ["11,50", "51,200"];
  return [range.replace("-", ",")];
}

// ---------------------------------------------------------------------------
// Agent 1 — company search. Real-or-null in production; mock only in demo.
// ---------------------------------------------------------------------------

/** Find up to `limit` real companies matching the ICP (for batch discovery). */
export async function searchCompanies(icp: Icp, limit = 1): Promise<Company[]> {
  const perPage = Math.max(1, Math.min(25, Math.floor(limit)));
  if (!hasApollo()) {
    return allowMock() ? [mockCompany(icp)] : [];
  }
  try {
    const res = await fetch(`${BASE}/mixed_companies/search`, {
      method: "POST",
      headers: apolloHeaders(),
      body: JSON.stringify({
        q_organization_keyword_tags: [icp.industry],
        organization_num_employees_ranges: employeeRanges(icp.employeeRange),
        organization_locations: icp.location ? [icp.location] : undefined,
        page: 1,
        per_page: perPage,
      }),
    });
    if (!res.ok) throw new Error(`Apollo companies HTTP ${res.status}`);
    const data = (await res.json()) as { organizations?: unknown[]; accounts?: unknown[] };
    const raw = data.organizations ?? data.accounts ?? [];
    // Schema validation: drop partial/garbage records.
    return raw.filter(validateApolloOrg).map((o) => mapOrg(o as Record<string, unknown>, icp));
  } catch (err) {
    console.warn("[apollo] company search failed:", (err as Error).message);
    return allowMock() ? [mockCompany(icp)] : [];
  }
}

export async function searchCompany(icp: Icp): Promise<Company | null> {
  const list = await searchCompanies(icp, 1);
  return list[0] ?? null;
}

function mapOrg(org: Record<string, unknown>, icp: Icp): Company {
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const loc = [str(org.city), str(org.state), str(org.country)].filter(Boolean).join(", ");
  return {
    name: String(org.name),
    website: str(org.website_url) || str(org.domain) || "",
    industry: str(org.industry) || icp.industry,
    employeeCount: typeof org.estimated_num_employees === "number" ? org.estimated_num_employees : null,
    revenueEstimate: str(org.annual_revenue_printed),
    location: loc || icp.location || null,
    description: str(org.short_description),
    externalId: String(org.id),
    source: "apollo",
  };
}

// ---------------------------------------------------------------------------
// Agent 2 — people search + email reveal.
// ---------------------------------------------------------------------------

export async function searchPeople(company: Company, icp: Icp): Promise<Candidate[]> {
  const titles = icp.targetRoles ?? DEFAULT_ROLES;

  // Mock company (demo) → mock candidate.
  if (company.source === "mock") return allowMock() ? [mockPerson(company)] : [];

  if (!hasApollo() || !company.externalId) return allowMock() ? [mockPerson(company)] : [];

  try {
    // Note: /mixed_people/search is deprecated for API callers — Apollo now
    // requires /mixed_people/api_search. Search results never include emails;
    // the email is retrieved separately via revealEmail() (people/match).
    const res = await fetch(`${BASE}/mixed_people/api_search`, {
      method: "POST",
      headers: apolloHeaders(),
      body: JSON.stringify({
        person_titles: titles,
        organization_ids: [company.externalId],
        page: 1,
        per_page: 5,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Apollo people HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { people?: unknown[]; contacts?: unknown[] };
    const people = (data.people ?? data.contacts ?? []).filter(validateApolloPerson) as Record<string, unknown>[];
    if (people.length === 0) return allowMock() ? [mockPerson(company)] : [];
    return people.map(mapPerson);
  } catch (err) {
    console.warn("[apollo] people search failed:", (err as Error).message);
    return allowMock() ? [mockPerson(company)] : [];
  }
}

function mapPerson(p: Record<string, unknown>): Candidate {
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  const name = [str(p.first_name), str(p.last_name)].filter(Boolean).join(" ") || String(p.name ?? "Unknown");
  // Search-tier emails are usually masked; treat only validated ones as real.
  const rawEmail = str(p.email);
  const valid = isValidEmail(rawEmail);
  return {
    name,
    role: str(p.title) || "Unknown",
    linkedinUrl: str(p.linkedin_url),
    email: valid ? rawEmail : null,
    emailVerified: valid,
    externalId: str(p.id),
    source: "apollo",
  };
}

export interface RevealResult {
  email: string | null;
  verified: boolean;
  /** Enriched fields from the match response — search results mask these. */
  name: string | null;
  role: string | null;
  linkedinUrl: string | null;
}

/**
 * Reveal + verify a professional email for a chosen candidate, and enrich the
 * record (full name, title, LinkedIn) — search-tier results mask these. This is
 * the credit-costing step Apollo gates behind /people/match. Real data only —
 * demo candidates already carry their (mock) verification state.
 */
export async function revealEmail(candidate: Candidate, company: Company): Promise<RevealResult> {
  if (candidate.source === "mock" || !hasApollo()) {
    return {
      email: candidate.email,
      verified: candidate.emailVerified,
      name: null,
      role: null,
      linkedinUrl: null,
    };
  }
  try {
    const [first, ...rest] = candidate.name.split(" ");
    const domain = company.website.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const res = await fetch(`${BASE}/people/match?reveal_professional_emails=true`, {
      method: "POST",
      headers: apolloHeaders(),
      body: JSON.stringify({
        id: candidate.externalId || undefined,
        first_name: first,
        last_name: rest.join(" "),
        organization_name: company.name,
        domain: domain || undefined,
      }),
    });
    if (!res.ok) throw new Error(`Apollo match HTTP ${res.status}`);
    const data = (await res.json()) as {
      person?: { email?: string; first_name?: string; last_name?: string; name?: string; title?: string; linkedin_url?: string };
    };
    const p = data.person;
    const email = p?.email ?? null;
    const valid = isValidEmail(email);
    const fullName = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || p.name || null : null;
    return {
      email: valid ? email : null,
      verified: valid,
      name: fullName,
      role: p?.title ?? null,
      linkedinUrl: p?.linkedin_url ?? null,
    };
  } catch (err) {
    console.warn("[apollo] email reveal failed:", (err as Error).message);
    return { email: null, verified: false, name: null, role: null, linkedinUrl: null };
  }
}

export const DEFAULT_ROLES = [
  "Founder",
  "CEO",
  "Chief Marketing Officer",
  "VP Marketing",
  "Marketing Director",
  "Head of Partnerships",
  "Brand Manager",
  "Growth Lead",
];

// ---------------------------------------------------------------------------
// Mock fallbacks — demo mode only (allowMock() === false in production).
// ---------------------------------------------------------------------------

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mockCompany(icp: Icp): Company {
  const name = `${titleCase(icp.industry)} ${pick(["Labs", "Collective", "Works", "Co", "Studio"], icp.industry)}`;
  const domain = `${slug(name)}.com`;
  return {
    name,
    website: `https://${domain}`,
    industry: icp.industry,
    employeeCount: 85,
    revenueEstimate: "$10M-$25M",
    location: icp.location ?? "Bengaluru, India",
    description: `A fast-growing ${icp.industry.toLowerCase()} brand focused on building a loyal, engaged audience.`,
    externalId: null,
    source: "mock",
  };
}

function mockPerson(company: Company): Candidate {
  const first = pick(["Ananya", "Rahul", "Meera", "Arjun", "Priya"], company.name);
  const last = pick(["Sharma", "Nair", "Kapoor", "Iyer", "Menon"], company.website);
  const domain = company.website.replace(/^https?:\/\//, "").replace(/\/$/, "") || "example.com";
  return {
    name: `${first} ${last}`,
    role: "Head of Marketing",
    linkedinUrl: `https://www.linkedin.com/in/${slug(first + last)}`,
    email: `${first.toLowerCase()}@${domain}`,
    // Verified only when the demo escape hatch is on — otherwise this lead
    // correctly BLOCKS on "no verified email", demonstrating the trust gate.
    emailVerified: env.demoForceVerified,
    externalId: null,
    source: "mock",
  };
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

// Deterministic "random" pick so the same input always yields the same mock.
function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return arr[h % arr.length];
}
