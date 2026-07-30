import { runPipeline, type PipelineOptions, type PipelineStep } from "../agents/graph";
import { discoverLeads } from "../agents/leadDiscovery";
import { persistCampaign } from "./repository";
import { computeTrust } from "./trust";
import type { Campaign, Company, Icp } from "../types";

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

/** Live callbacks so a batch can be streamed to the UI while it runs. */
export interface BatchProgress {
  /** Fires once, as soon as the target companies are known. */
  onDiscovered?: (companies: Company[]) => void;
  /** Fires per node, per company, as the pipeline advances. */
  onStep?: (companyKey: string, step: PipelineStep) => void;
  /** Fires the moment one lead is fully built and persisted. */
  onLead?: (campaign: Campaign, companyKey: string) => void;
  /** Fires if a single lead fails — the rest of the batch continues. */
  onLeadError?: (companyKey: string, message: string) => void;
}

/**
 * Batch discovery — find up to `count` real companies for the ICP and run each
 * through the full pipeline. Web search is OFF for batch (speed); a single run
 * (count=1) keeps the env web-search setting for deep research.
 *
 * With `progress` callbacks the caller receives each lead as it completes
 * instead of waiting for the whole batch.
 */
export async function createBatch(
  userId: string,
  icp: Icp,
  count: number,
  senderName?: string | null,
  progress?: BatchProgress
): Promise<Campaign[]> {
  const n = Math.max(1, Math.min(10, Math.floor(count)));
  const companies = await discoverLeads(icp, n);
  if (companies.length === 0) return [];
  progress?.onDiscovered?.(companies);

  // Bounded concurrency so we don't hammer Apollo/Claude rate limits.
  const failures: Error[] = [];
  const results = await mapLimit(companies, 3, async (company, idx) => {
    const key = `${idx}`;
    try {
      const campaign = await createCampaign(userId, icp, {
        company,
        webSearch: false,
        senderName,
        onStep: progress?.onStep ? (s) => progress.onStep!(key, s) : undefined,
      });
      progress?.onLead?.(campaign, key);
      return campaign;
    } catch (err) {
      // One bad lead must not sink the batch — report it and keep going.
      failures.push(err as Error);
      progress?.onLeadError?.(key, (err as Error).message);
      return null;
    }
  });

  const ok = results.filter((c): c is Campaign => c !== null);
  // Every lead failed — that's a run failure, not an empty result.
  if (ok.length === 0 && failures.length > 0) throw failures[0];
  return ok;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
