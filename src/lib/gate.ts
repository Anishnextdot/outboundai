import { isProduction, hasAnthropic } from "./env";
import { isValidEmail } from "./validation";
import type { Company, DecisionMaker } from "../types";

export interface GateResult {
  blocked: boolean;
  reason: string | null;
}

/**
 * The blocking gate. A campaign is BLOCKED — and no outreach is generated —
 * if any critical datum is missing. Order matters: report the first gap.
 */
export function evaluateGate(
  company: Company | null,
  decisionMaker: DecisionMaker | null
): GateResult {
  if (!company) return block("Company not found");
  if (!decisionMaker) return block("Decision-maker not found");
  if (!decisionMaker.emailVerified || !isValidEmail(decisionMaker.email))
    return block("No verified email for the decision-maker");
  // In production we never fabricate research/content, so a missing AI key is a
  // hard block rather than a silent mock.
  if (isProduction() && !hasAnthropic())
    return block("AI generation unavailable (ANTHROPIC_API_KEY not configured)");
  return { blocked: false, reason: null };
}

function block(reason: string): GateResult {
  return { blocked: true, reason };
}
