import { generateJSON, hasAnthropic } from "../lib/anthropic";
import { allowMock, env } from "../lib/env";
import type { Company, OutreachAngle, ResearchDossier } from "../types";

/**
 * Agent 4 — Personalization.
 * Turns the research dossier into concrete outreach angles. The bar: each angle
 * must reference something specific about the company (not "we help brands with
 * marketing") and connect it to a real opportunity Arka can act on.
 */
export async function generateAngles(
  company: Company,
  research: ResearchDossier
): Promise<OutreachAngle[]> {
  if (!hasAnthropic()) {
    if (allowMock()) return mockAngles(company, research);
    throw new Error("Personalization requires ANTHROPIC_API_KEY in production");
  }

  try {
    const out = await generateJSON<{ angles: OutreachAngle[] }>({
      system:
        "You convert company research into outbound angles for Arka Alliance, a marketing consultancy. Rules: every angle must cite a SPECIFIC observation from the research (a campaign, a gap, a hire, a positioning choice) — never generic. The opportunity must be concrete and plausibly valuable. Keep each field to one or two sentences. No hype, no jargon.",
      prompt: buildPrompt(company, research),
      schema: ANGLES_SCHEMA,
      maxTokens: 2500,
      model: env.modelFast, // angle extraction is mechanical → cheap tier
    });
    return (out.angles ?? []).slice(0, 3);
  } catch (err) {
    if (allowMock()) {
      console.warn("[personalization] Claude call failed, using mock:", (err as Error).message);
      return mockAngles(company, research);
    }
    throw err;
  }
}

function buildPrompt(company: Company, r: ResearchDossier): string {
  return [
    `Company: ${company.name} (${company.industry})`,
    `Positioning: ${r.marketPositioning}`,
    `Recent activity: ${r.recentActivity.join("; ")}`,
    `Opportunities we noticed: ${r.opportunities.join("; ")}`,
    `Hiring signals: ${r.hiringSignals.join("; ")}`,
    "",
    "Produce 2-3 outreach angles. Each is an observation, the opportunity it implies, and why Arka Alliance is relevant.",
  ].join("\n");
}

const ANGLES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    angles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          observation: { type: "string" },
          opportunity: { type: "string" },
          relevanceToArka: { type: "string" },
        },
        required: ["observation", "opportunity", "relevanceToArka"],
      },
    },
  },
  required: ["angles"],
} as const;

function mockAngles(company: Company, r: ResearchDossier): OutreachAngle[] {
  return [
    {
      observation: `${company.name}'s recent campaign focused heavily on visibility and reach.`,
      opportunity:
        "There's an opening to convert that one-time attention into ongoing audience engagement after the campaign ends.",
      relevanceToArka:
        "Arka builds the post-campaign engagement layer — retention content and owned-audience nurture — that keeps acquired attention from leaking away.",
    },
    {
      observation:
        r.opportunities[1] ?? "Acquisition spend appears to outweigh owned-audience monetisation.",
      opportunity: "Shifting a portion of spend toward the owned audience could lift margin on existing demand.",
      relevanceToArka: "Arka specialises in turning owned channels into a compounding growth asset, not a cost centre.",
    },
  ];
}
