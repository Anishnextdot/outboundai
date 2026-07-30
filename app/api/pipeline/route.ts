import { NextResponse } from "next/server";
import { createCampaign, createBatch } from "@/src/lib/campaigns";
import { getSessionUser } from "@/src/lib/auth";
import type { Campaign, Company, Icp } from "@/src/types";

// Batch runs can take a few minutes (Apollo + Claude per lead).
export const maxDuration = 300;

interface Body extends Partial<Icp> {
  count?: number;
}

/**
 * One line of the NDJSON progress stream. Every event is emitted from a real
 * pipeline callback — nothing here is on a timer.
 */
type RunEvent =
  | { t: "start"; count: number; icp: Icp }
  | { t: "discovered"; companies: { key: string; name: string; source: string | null }[] }
  | { t: "step"; key: string; node: string; company: string | null; blocked: boolean }
  | { t: "lead"; key: string; campaign: Campaign }
  | { t: "lead_error"; key: string; message: string }
  | { t: "done"; count: number }
  | { t: "error"; message: string };

/**
 * POST /api/pipeline — run the pipeline for one ICP (or a batch of `count`).
 *
 * Streams NDJSON progress when the client sends `Accept: application/x-ndjson`,
 * so leads render the moment each one is persisted. Otherwise it behaves as
 * before and returns a single JSON payload at the end.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let icp: Icp;
  let count: number;
  try {
    const body = (await req.json()) as Body;
    if (!body.industry || !body.industry.trim()) {
      return NextResponse.json({ error: "industry is required" }, { status: 400 });
    }
    icp = {
      industry: body.industry.trim(),
      employeeRange: body.employeeRange?.trim() || undefined,
      location: body.location?.trim() || undefined,
      targetRoles: body.targetRoles?.length ? body.targetRoles : undefined,
    };
    count = Math.max(1, Math.min(10, Math.floor(body.count ?? 1)));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const senderName = user.name || user.email.split("@")[0];
  const wantsStream = (req.headers.get("accept") ?? "").includes("application/x-ndjson");

  if (!wantsStream) {
    try {
      if (count > 1) {
        const campaigns = await createBatch(user.id, icp, count, senderName);
        return NextResponse.json({ campaigns, count: campaigns.length });
      }
      const campaign = await createCampaign(user.id, icp, { senderName });
      return NextResponse.json({ campaign, campaigns: [campaign], count: 1 });
    } catch (err) {
      console.error("[/api/pipeline]", err);
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (e: RunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          // Client hung up mid-run; the pipeline finishes but stops reporting.
          closed = true;
        }
      };

      send({ t: "start", count, icp });
      try {
        if (count > 1) {
          const campaigns = await createBatch(user.id, icp, count, senderName, {
            onDiscovered: (companies: Company[]) =>
              send({
                t: "discovered",
                companies: companies.map((c, i) => ({ key: `${i}`, name: c.name, source: c.source ?? null })),
              }),
            onStep: (key, s) => send({ t: "step", key, node: s.node, company: s.company, blocked: s.blocked }),
            onLead: (campaign, key) => send({ t: "lead", key, campaign }),
            onLeadError: (key, message) => send({ t: "lead_error", key, message }),
          });
          send({ t: "done", count: campaigns.length });
        } else {
          const campaign = await createCampaign(user.id, icp, {
            senderName,
            onStep: (s) => send({ t: "step", key: "0", node: s.node, company: s.company, blocked: s.blocked }),
          });
          send({ t: "lead", key: "0", campaign });
          send({ t: "done", count: 1 });
        }
      } catch (err) {
        console.error("[/api/pipeline]", err);
        send({ t: "error", message: (err as Error).message });
      } finally {
        if (!closed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Streaming responses must not be buffered by an intermediate proxy.
      "X-Accel-Buffering": "no",
    },
  });
}
