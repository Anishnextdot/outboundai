import { searchCompany, searchCompanies } from "../lib/apollo";
import type { Company, Icp } from "../types";

/**
 * Agent 1 — Lead Discovery.
 * Finds one company matching the ICP, or null when none can be found (in
 * production that becomes a BLOCKED campaign — no fabricated leads).
 */
export async function discoverLead(icp: Icp): Promise<Company | null> {
  return searchCompany(icp);
}

/** Batch discovery — up to `count` real companies for the ICP. */
export async function discoverLeads(icp: Icp, count: number): Promise<Company[]> {
  return searchCompanies(icp, count);
}
