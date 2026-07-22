import { runPipeline, type PipelineOptions } from "../agents/graph";
import { discoverLeads } from "../agents/leadDiscovery";
import { persistCampaign } from "./repository";
import { computeTrust } from "./trust";
import type { Campaign, Icp } from "../types";

/** Run the pipeline for an ICP, score trust, and persist it for `userId`. */
export async function createCampaign(userId: string, icp: Icp, opts?: PipelineOptions): Promise<Campaign> {
  const result = await runPipeline(icp, opts);

  const trust = computeTrust({
    company: result.company,
    decisionMaker: result.decisionMaker,
    research: result.research,
  });

  return persistCampaign({
    userId,
    icp,
    company: result.company,
    decisionMaker: result.decisionMaker,
    research: result.research,
    angles: result.angles,
    email: result.email,
    linkedin: result.linkedin,
    status: result.blocked ? "blocked" : "pending_review",
    blockedReason: result.blockedReason,
    trust,
    trustScore: trust.total,
    log: result.log,
  });
}

/**
 * Batch discovery — find up to `count` real companies for the ICP and run each
 * through the full pipeline. Web search is OFF for batch (speed); a single run
 * (count=1) keeps the env web-search setting for deep research.
 */
export async function createBatch(userId: string, icp: Icp, count: number, senderName?: string | null): Promise<Campaign[]> {
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  const companies = await discoverLeads(icp, n);
  if (companies.length === 0) return [];

  // Bounded concurrency so we don't hammer Apollo/Claude rate limits.
  return mapLimit(companies, 3, (company) => createCampaign(userId, icp, { company, webSearch: false, senderName }));
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
