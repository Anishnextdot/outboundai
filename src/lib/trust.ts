import type { Company, DecisionMaker, ResearchDossier, TrustBreakdown } from "../types";

/**
 * Trust scoring — a measurable read on how authentic a campaign's data is.
 * Four equally-weighted components (0-100 each); total is the floored mean.
 *
 * Worked example (a real, ungrounded lead):
 *   company 100, decisionMaker 95, verifiedEmail 100, research 0
 *   → floor((100 + 95 + 100 + 0) / 4) = 73
 */
export function computeTrust(args: {
  company: Company | null;
  decisionMaker: DecisionMaker | null;
  research: ResearchDossier | null;
}): TrustBreakdown {
  const companyData = scoreCompany(args.company);
  const decisionMaker = scoreDecisionMaker(args.decisionMaker);
  const verifiedEmail = args.decisionMaker?.emailVerified ? 100 : 0;
  const researchGrounding = args.research?.grounded ? 100 : 0;
  const total = Math.floor((companyData + decisionMaker + verifiedEmail + researchGrounding) / 4);
  return { companyData, decisionMaker, verifiedEmail, researchGrounding, total };
}

function scoreCompany(c: Company | null): number {
  if (!c) return 0;
  if (c.source === "mock") return 50; // fabricated → capped, only reachable in demo mode
  // Real Apollo record: full marks when identifiable + reachable, else partial.
  const complete = !!(c.name && c.website && c.externalId);
  return complete ? 100 : 60;
}

function scoreDecisionMaker(d: DecisionMaker | null): number {
  if (!d) return 0;
  if (d.source === "mock") return 40; // fabricated → capped, demo only
  return Math.max(0, Math.min(100, d.confidence));
}
