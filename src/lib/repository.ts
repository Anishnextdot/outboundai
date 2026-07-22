import { getSupabase } from "./db/client";
import type {
  Campaign,
  CampaignStatus,
  Channel,
  Company,
  DecisionMaker,
  EmailDraft,
  Icp,
  OutreachAngle,
  OutreachResponse,
  ResearchDossier,
  Sentiment,
  TrustBreakdown,
} from "../types";

// Durable persistence on Supabase — the sole system of record. Replaces the
// former in-memory store. The `companies / contacts / research / campaigns /
// emails / responses` tables map onto the normalized shape below.

export interface PersistInput {
  /** Owner — every campaign is scoped to the user who created it. */
  userId: string;
  icp: Icp;
  company: Company | null;
  decisionMaker: DecisionMaker | null;
  research: ResearchDossier | null;
  angles: OutreachAngle[];
  email: EmailDraft | null;
  linkedin: EmailDraft | null;
  status: CampaignStatus;
  blockedReason: string | null;
  trust: TrustBreakdown;
  trustScore: number;
  log: string[];
}

const SELECT =
  "*, company:companies(*), contact:contacts(*), research:research(*), emails(*)";

/** Persist a completed pipeline run as a campaign (+ its normalized rows). */
export async function persistCampaign(input: PersistInput): Promise<Campaign> {
  const db = getSupabase();

  const companyId = input.company ? await upsertCompany(input.company) : null;
  const contactId =
    input.decisionMaker && companyId ? await insertContact(input.decisionMaker, companyId) : null;
  const researchId =
    input.research && companyId ? await insertResearch(input.research, companyId) : null;

  const { data, error } = await db
    .from("campaigns")
    .insert({
      user_id: input.userId,
      company_id: companyId,
      contact_id: contactId,
      research_id: researchId,
      icp: input.icp,
      status: input.status,
      blocked_reason: input.blockedReason,
      trust_score: input.trustScore,
      trust_breakdown: input.trust,
      angles: input.angles,
      log: input.log,
    })
    .select("id")
    .single();
  if (error) throw new Error(`persist campaign: ${error.message}`);
  const campaignId = data.id as string;

  const draftRows = [
    input.email && { channel: "email", draft: input.email },
    input.linkedin && { channel: "linkedin", draft: input.linkedin },
  ].filter(Boolean) as { channel: string; draft: EmailDraft }[];

  if (draftRows.length) {
    const { error: emailErr } = await db.from("emails").insert(
      draftRows.map(({ channel, draft }) => ({
        campaign_id: campaignId,
        kind: "draft",
        channel,
        subject: draft.subject,
        body: draft.body,
        source: draft.source,
        tone: draft.tone ?? null,
      }))
    );
    if (emailErr) throw new Error(`persist drafts: ${emailErr.message}`);
  }

  const campaign = await getCampaign(campaignId, input.userId);
  if (!campaign) throw new Error("persist campaign: reload failed");
  return campaign;
}

export async function getCampaign(id: string, userId: string): Promise<Campaign | undefined> {
  const db = getSupabase();
  const { data, error } = await db
    .from("campaigns")
    .select(SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`get campaign: ${error.message}`);
  return data ? mapCampaign(data) : undefined;
}

export async function listCampaigns(userId: string): Promise<Campaign[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("campaigns")
    .select(SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`list campaigns: ${error.message}`);
  return (data ?? []).map(mapCampaign);
}

export async function setStatus(
  id: string,
  userId: string,
  status: CampaignStatus,
  blockedReason: string | null = null
): Promise<Campaign | undefined> {
  const db = getSupabase();
  const { error } = await db
    .from("campaigns")
    .update({ status, blocked_reason: blockedReason, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`set status: ${error.message}`);
  return getCampaign(id, userId);
}

/** Phase 3 — record the outcome of a send attempt on a campaign. */
export async function markSent(
  id: string,
  userId: string,
  result: { status: string; messageId: string | null; error: string | null }
): Promise<Campaign | undefined> {
  const db = getSupabase();
  const { error } = await db
    .from("campaigns")
    .update({
      send_status: result.status,
      sent_at: result.status === "failed" ? null : new Date().toISOString(),
      send_error: result.error,
      send_message_id: result.messageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`mark sent: ${error.message}`);
  return getCampaign(id, userId);
}

/** LinkedIn is sent by the operator in LinkedIn itself — we just track it. */
export async function markLinkedInSent(id: string, userId: string): Promise<Campaign | undefined> {
  const db = getSupabase();
  const { error } = await db
    .from("campaigns")
    .update({ linkedin_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`mark linkedin sent: ${error.message}`);
  return getCampaign(id, userId);
}

/** Phase 4 — record an inbound response to a campaign. */
export async function recordResponse(input: {
  campaignId: string;
  type: string;
  sentiment: Sentiment | null;
  content: string | null;
  channel?: string;
}): Promise<OutreachResponse> {
  const db = getSupabase();
  const { data, error } = await db
    .from("responses")
    .insert({
      campaign_id: input.campaignId,
      channel: input.channel ?? "email",
      type: input.type,
      sentiment: input.sentiment,
      content: input.content,
      received_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(`record response: ${error.message}`);
  return mapResponse(data);
}

/** Phase 4 — list this user's responses, joined with company/contact names. */
export async function listResponses(userId: string): Promise<OutreachResponse[]> {
  const db = getSupabase();
  const { data, error } = await db.from("responses").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(`list responses: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  const campaigns = await listCampaigns(userId);
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  // Only responses belonging to this user's campaigns.
  return rows
    .filter((r) => byId.has(r.campaign_id as string))
    .map((r) => {
      const c = byId.get(r.campaign_id as string);
      return { ...mapResponse(r), company: c?.company?.name ?? null, contact: c?.decisionMaker?.name ?? null };
    });
}

export async function saveEditedEmail(
  id: string,
  userId: string,
  email: EmailDraft,
  channel: Channel = "email"
): Promise<Campaign | undefined> {
  return upsertDraft(id, userId, email, channel, "edited");
}

/** Regeneration overwrites the draft (not the edited copy) for a channel. */
export async function saveDraft(
  id: string,
  userId: string,
  draft: EmailDraft,
  channel: Channel = "email"
): Promise<Campaign | undefined> {
  return upsertDraft(id, userId, draft, channel, "draft");
}

async function upsertDraft(
  id: string,
  userId: string,
  draft: EmailDraft,
  channel: Channel,
  kind: "draft" | "edited"
): Promise<Campaign | undefined> {
  const db = getSupabase();
  const { error } = await db.from("emails").upsert(
    {
      campaign_id: id,
      kind,
      channel,
      subject: draft.subject,
      body: draft.body,
      source: draft.source,
      tone: draft.tone ?? null,
    },
    { onConflict: "campaign_id,kind,channel" }
  );
  if (error) throw new Error(`save ${kind} ${channel}: ${error.message}`);
  await db.from("campaigns").update({ updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  return getCampaign(id, userId);
}

// --- row builders (domain → DB) ---

async function upsertCompany(c: Company): Promise<string> {
  const db = getSupabase();
  const row = {
    external_id: c.externalId ?? null,
    name: c.name,
    website: c.website,
    industry: c.industry,
    employee_count: c.employeeCount,
    revenue_estimate: c.revenueEstimate,
    location: c.location,
    description: c.description ?? null,
    source: c.source,
  };
  if (c.externalId) {
    const { data: existing } = await db
      .from("companies")
      .select("id")
      .eq("external_id", c.externalId)
      .maybeSingle();
    if (existing) {
      await db.from("companies").update(row).eq("id", existing.id);
      return existing.id as string;
    }
  }
  const { data, error } = await db.from("companies").insert(row).select("id").single();
  if (error) throw new Error(`upsert company: ${error.message}`);
  return data.id as string;
}

async function insertContact(dm: DecisionMaker, companyId: string): Promise<string> {
  const db = getSupabase();
  const { data, error } = await db
    .from("contacts")
    .insert({
      company_id: companyId,
      name: dm.name,
      role: dm.role,
      linkedin_url: dm.linkedinUrl,
      email: dm.email,
      email_verified: dm.emailVerified,
      confidence: dm.confidence,
      reasoning: dm.reasoning,
      source: dm.source,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert contact: ${error.message}`);
  return data.id as string;
}

async function insertResearch(r: ResearchDossier, companyId: string): Promise<string> {
  const db = getSupabase();
  const { data, error } = await db
    .from("research")
    .insert({
      company_id: companyId,
      summary: r.summary,
      services: r.services,
      products: r.products,
      recent_activity: r.recentActivity,
      market_positioning: r.marketPositioning,
      competitors: r.competitors,
      hiring_signals: r.hiringSignals,
      opportunities: r.opportunities,
      grounded: r.grounded,
      source: r.source,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert research: ${error.message}`);
  return data.id as string;
}

// --- mappers (DB → domain) ---

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapCampaign(row: any): Campaign {
  const emails: any[] = row.emails ?? [];
  // Rows written before the channel column default to 'email'.
  const pick = (kind: string, channel: string) =>
    emails.find((e) => e.kind === kind && (e.channel ?? "email") === channel);
  const draft = pick("draft", "email");
  const edited = pick("edited", "email");
  const liDraft = pick("draft", "linkedin");
  const liEdited = pick("edited", "linkedin");
  return {
    id: row.id,
    createdAt: row.created_at,
    status: row.status as CampaignStatus,
    blockedReason: row.blocked_reason ?? null,
    trustScore: row.trust_score ?? 0,
    trust: (row.trust_breakdown ?? {}) as TrustBreakdown,
    icp: row.icp as Icp,
    company: row.company ? mapCompany(row.company) : null,
    decisionMaker: row.contact ? mapContact(row.contact) : null,
    research: row.research ? mapResearch(row.research) : null,
    angles: (row.angles ?? []) as OutreachAngle[],
    email: draft ? mapEmail(draft) : null,
    editedEmail: edited ? mapEmail(edited) : null,
    linkedin: liDraft ? mapEmail(liDraft) : null,
    editedLinkedin: liEdited ? mapEmail(liEdited) : null,
    sendStatus: (row.send_status ?? "not_sent") as Campaign["sendStatus"],
    sentAt: row.sent_at ?? null,
    linkedinSentAt: row.linkedin_sent_at ?? null,
    log: (row.log ?? []) as string[],
  };
}

function mapCompany(r: any): Company {
  return {
    name: r.name,
    website: r.website ?? "",
    industry: r.industry ?? "",
    employeeCount: r.employee_count ?? null,
    revenueEstimate: r.revenue_estimate ?? null,
    location: r.location ?? null,
    description: r.description ?? null,
    externalId: r.external_id ?? null,
    source: r.source,
  };
}

function mapContact(r: any): DecisionMaker {
  return {
    name: r.name,
    role: r.role ?? "",
    linkedinUrl: r.linkedin_url ?? null,
    email: r.email ?? null,
    emailVerified: !!r.email_verified,
    confidence: r.confidence ?? 0,
    reasoning: r.reasoning ?? "",
    source: r.source,
  };
}

function mapResearch(r: any): ResearchDossier {
  return {
    summary: r.summary ?? "",
    services: r.services ?? [],
    products: r.products ?? [],
    recentActivity: r.recent_activity ?? [],
    marketPositioning: r.market_positioning ?? "",
    competitors: r.competitors ?? [],
    hiringSignals: r.hiring_signals ?? [],
    opportunities: r.opportunities ?? [],
    grounded: !!r.grounded,
    source: r.source,
  };
}

function mapEmail(r: any): EmailDraft {
  return { subject: r.subject ?? "", body: r.body ?? "", source: r.source, tone: r.tone ?? null };
}

function mapResponse(r: any): OutreachResponse {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    channel: r.channel ?? "email",
    type: r.type ?? "reply",
    sentiment: r.sentiment ?? null,
    content: r.content ?? null,
    receivedAt: r.received_at ?? null,
    createdAt: r.created_at,
  };
}
