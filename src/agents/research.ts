import { generateJSON, researchWithWebSearch, hasAnthropic } from "../lib/anthropic";
import { env, allowMock } from "../lib/env";
import type { Company, DecisionMaker, ResearchDossier } from "../types";

/**
 * Agent 3 — Company Research.
 * Produces a structured dossier before any outreach. With ENABLE_WEB_SEARCH it
 * first gathers live notes via Claude's web_search tool (grounded), then
 * structures them; otherwise it reasons from the company data we hold. In
 * production a missing/failing AI never mocks — it throws.
 */
export async function researchCompany(
  company: Company,
  _decisionMaker: DecisionMaker,
  webSearch?: boolean
): Promise<ResearchDossier> {
  if (!hasAnthropic()) {
    if (allowMock()) return mockDossier(company);
    throw new Error("Research requires ANTHROPIC_API_KEY in production");
  }

  // Per-run override (batch turns it off for speed); default to the env setting.
  const useWebSearch = webSearch ?? env.enableWebSearch;
  try {
    let notes = "";
    let grounded = false;
    let source: ResearchDossier["source"] = "claude";
    if (useWebSearch) {
      notes = await researchWithWebSearch({
        system:
          "You are a diligent B2B researcher. Gather concrete, current facts about the company: services, products, recent campaigns or launches, market positioning, competitors, and hiring signals. Cite what you find plainly.",
        prompt: `Research ${company.name} (${company.website}). Return organised notes.`,
        model: env.modelWriter, // web_search needs an Opus/Sonnet-tier model
      });
      grounded = notes.length > 0;
      source = "claude+websearch";
    }

    const dossier = await generateJSON<Omit<ResearchDossier, "source" | "grounded">>({
      system:
        "You are a senior B2B researcher producing a dossier for an outbound consultant. Be specific and grounded — no filler. If a fact is unknown, infer conservatively from the industry and mark uncertainty in wording. Each opportunity must be a concrete gap or moment Arka Alliance (a marketing consultancy) could help with.",
      prompt: buildResearchPrompt(company, notes),
      schema: RESEARCH_SCHEMA,
      model: env.modelFast, // structuring is mechanical → cheap tier
    });

    return { ...dossier, grounded, source };
  } catch (err) {
    if (allowMock()) {
      console.warn("[research] Claude call failed, using mock:", (err as Error).message);
      return mockDossier(company);
    }
    throw err;
  }
}

function buildResearchPrompt(company: Company, notes: string): string {
  const known = [
    `Name: ${company.name}`,
    `Website: ${company.website}`,
    `Industry: ${company.industry}`,
    company.employeeCount ? `Employees: ${company.employeeCount}` : "",
    company.revenueEstimate ? `Revenue: ${company.revenueEstimate}` : "",
    company.location ? `Location: ${company.location}` : "",
    company.description ? `Description: ${company.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    "Build a research dossier for this company.",
    "",
    "KNOWN DATA:",
    known,
    notes ? "\nLIVE RESEARCH NOTES:\n" + notes : "",
  ].join("\n");
}

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    services: { type: "array", items: { type: "string" } },
    products: { type: "array", items: { type: "string" } },
    recentActivity: { type: "array", items: { type: "string" } },
    marketPositioning: { type: "string" },
    competitors: { type: "array", items: { type: "string" } },
    hiringSignals: { type: "array", items: { type: "string" } },
    opportunities: { type: "array", items: { type: "string" } },
  },
  required: [
    "summary",
    "services",
    "products",
    "recentActivity",
    "marketPositioning",
    "competitors",
    "hiringSignals",
    "opportunities",
  ],
} as const;

function mockDossier(company: Company): ResearchDossier {
  return {
    summary: `${company.name} is a ${company.industry.toLowerCase()} company building a direct relationship with its audience. Growth appears driven by product and brand, with room to deepen post-purchase engagement.`,
    services: ["Direct-to-consumer sales", "Brand storytelling", "Community building"],
    products: ["Flagship product line", "Seasonal collections"],
    recentActivity: [
      "Recent brand campaign focused on visibility and reach",
      "Expanded into a new product category",
    ],
    marketPositioning: `Positions as a premium, values-led ${company.industry.toLowerCase()} brand competing on identity rather than price.`,
    competitors: ["Established category incumbents", "Newer D2C challengers"],
    hiringSignals: ["Hiring in growth and performance marketing"],
    opportunities: [
      "Sponsorship/campaign activations drive reach but little post-event engagement",
      "Owned audience is under-monetised relative to acquisition spend",
      "No visible thought-leadership content despite a distinctive point of view",
    ],
    grounded: false,
    source: "mock",
  };
}
