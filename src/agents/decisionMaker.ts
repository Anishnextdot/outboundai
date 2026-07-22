import { searchPeople, revealEmail, DEFAULT_ROLES, type Candidate } from "../lib/apollo";
import type { Company, DecisionMaker, Icp } from "../types";

/**
 * Agent 2 — Decision Maker Finder.
 * Scores candidates by how likely they are to own the buying decision, picks
 * the strongest, then reveals + verifies their email. Returns null when no
 * candidate exists (in production that becomes a BLOCKED campaign).
 */
export async function findDecisionMaker(company: Company, icp: Icp): Promise<DecisionMaker | null> {
  const roles = icp.targetRoles ?? DEFAULT_ROLES;
  const candidates = await searchPeople(company, icp);
  if (candidates.length === 0) return null;

  const best = candidates
    .map((c) => ({ candidate: c, ...scoreTitle(c.role, roles) }))
    .sort((a, b) => b.score - a.score)[0];

  // Email reveal happens only for the chosen candidate (credit-efficient).
  // The match response also enriches name/title/LinkedIn that search masks.
  const revealed = await revealEmail(best.candidate, company);
  const confidence = Math.min(100, best.score + (revealed.verified ? 10 : 0));

  return {
    name: revealed.name || best.candidate.name,
    role: revealed.role || best.candidate.role,
    linkedinUrl: revealed.linkedinUrl ?? best.candidate.linkedinUrl,
    email: revealed.email,
    emailVerified: revealed.verified,
    confidence,
    reasoning: best.reason,
    source: best.candidate.source,
  };
}

/**
 * Rank a title against the ordered target roles. Earlier roles are
 * higher-authority buyers, so an exact hit on role[0] scores highest.
 */
function scoreTitle(title: string, roles: string[]): { score: number; reason: string } {
  const t = title.toLowerCase();
  for (let i = 0; i < roles.length; i++) {
    const r = roles[i].toLowerCase();
    if (t.includes(r) || sharesKeyword(t, r)) {
      const score = Math.round(90 - i * (60 / Math.max(1, roles.length)));
      return {
        score: Math.max(40, score),
        reason: `Title "${title}" matches target buyer role "${roles[i]}" (priority ${i + 1}).`,
      };
    }
  }
  if (/(chief|founder|owner|president)/.test(t))
    return { score: 55, reason: `Senior title "${title}" — likely influences the decision.` };
  if (/(head|vp|vice president|director)/.test(t))
    return { score: 45, reason: `Leadership title "${title}" — probable stakeholder, verify ownership.` };
  return { score: 30, reason: `Title "${title}" doesn't clearly own the decision — treat as a soft lead.` };
}

function sharesKeyword(title: string, role: string): boolean {
  const keywords = ["marketing", "growth", "brand", "partnership", "founder", "ceo"];
  return keywords.some((k) => title.includes(k) && role.includes(k));
}

// Re-exported so callers can type candidate lists if needed.
export type { Candidate };
