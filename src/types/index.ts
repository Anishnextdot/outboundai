// Shared contracts for the outbound pipeline. Every agent speaks in these types.

/** The Ideal Customer Profile the operator wants to target. */
export interface Icp {
  industry: string;
  employeeRange?: string; // e.g. "11-50", "51-200"
  location?: string;
  /** Roles that typically own the buying decision, most-preferred first. */
  targetRoles?: string[];
}

export type DataSource = "apollo" | "mock";

/** Agent 1 output — a company matching the ICP. */
export interface Company {
  name: string;
  website: string;
  industry: string;
  employeeCount: number | null;
  revenueEstimate: string | null;
  location: string | null;
  /** Short description from the data source, if available. */
  description?: string | null;
  /** Apollo (or other) organization id, used to find people. */
  externalId?: string | null;
  source: DataSource;
}

/** Agent 2 output — the person who actually owns the decision. */
export interface DecisionMaker {
  name: string;
  role: string;
  linkedinUrl: string | null;
  email: string | null;
  /** True only when the email was retrieved AND passed validation. */
  emailVerified: boolean;
  /** 0-100 — how confident we are this is the right buyer. */
  confidence: number;
  reasoning: string;
  source: DataSource;
}

/** Agent 3 output — the structured research dossier. */
export interface ResearchDossier {
  summary: string;
  services: string[];
  products: string[];
  recentActivity: string[];
  marketPositioning: string;
  competitors: string[];
  hiringSignals: string[];
  opportunities: string[];
  /** True when facts were gathered from live web search, not model memory. */
  grounded: boolean;
  source: "claude" | "claude+websearch" | "mock";
}

/** Agent 4 output — one concrete, research-grounded angle. */
export interface OutreachAngle {
  observation: string;
  opportunity: string;
  relevanceToArka: string;
}

/** Writing tone for generated outreach. `direct` is the house style. */
export type Tone = "direct" | "warm" | "formal" | "punchy" | "consultative";

export const TONE_OPTIONS: Tone[] = ["direct", "warm", "formal", "punchy", "consultative"];

export type Channel = "email" | "linkedin";

/** Agent 5 output — a ready-to-review draft (email or LinkedIn DM). */
export interface EmailDraft {
  /** Empty for LinkedIn DMs. */
  subject: string;
  body: string;
  source: "claude" | "mock";
  tone?: Tone | null;
}

/**
 * The trust system. Each component is 0-100; total is their floored mean.
 * Data authenticity is measurable and stored per campaign.
 */
export interface TrustBreakdown {
  companyData: number;
  decisionMaker: number;
  verifiedEmail: number;
  researchGrounding: number;
  total: number;
}

export type CampaignStatus = "pending_review" | "approved" | "rejected" | "blocked";

export type SendStatus = "not_sent" | "sent" | "simulated" | "failed";

export type Sentiment = "positive" | "neutral" | "negative";

/** Agent 8 — a tracked response to an outreach email. */
export interface OutreachResponse {
  id: string;
  campaignId: string;
  channel: string; // "email"
  type: string; // "reply" | "meeting" | "bounce"
  sentiment: Sentiment | null;
  content: string | null;
  receivedAt: string | null;
  createdAt: string;
  // joined for display
  company?: string | null;
  contact?: string | null;
}

/** The unit a human reviews and approves — the whole pipeline result for one lead. */
export interface Campaign {
  id: string;
  createdAt: string;
  status: CampaignStatus;
  /** Why a campaign is blocked (missing company / decision-maker / verified email). */
  blockedReason: string | null;
  trustScore: number;
  trust: TrustBreakdown;
  icp: Icp;
  // Nullable: a blocked campaign may be missing exactly the data that blocked it.
  company: Company | null;
  decisionMaker: DecisionMaker | null;
  research: ResearchDossier | null;
  angles: OutreachAngle[];
  email: EmailDraft | null;
  /** Human edits to the email, if any. */
  editedEmail?: EmailDraft | null;
  /** LinkedIn DM draft + its human edits. */
  linkedin: EmailDraft | null;
  editedLinkedin?: EmailDraft | null;
  /** Phase 3 — sending state. */
  sendStatus: SendStatus;
  sentAt: string | null;
  /** LinkedIn is sent manually in LinkedIn; we track when it was done. */
  linkedinSentAt: string | null;
  /** Per-stage trace, useful for debugging and transparency. */
  log: string[];
}
