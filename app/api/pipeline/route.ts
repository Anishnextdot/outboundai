import { NextResponse } from "next/server";
import { createCampaign, createBatch } from "@/src/lib/campaigns";
import { getSessionUser } from "@/src/lib/auth";
import type { Icp } from "@/src/types";

// Batch runs can take a few minutes (Apollo + Claude per lead).
export const maxDuration = 300;

interface Body extends Partial<Icp> {
  count?: number;
}

/** POST /api/pipeline — run the pipeline for one ICP (or a batch of `count`). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  try {
    const body = (await req.json()) as Body;
    if (!body.industry || !body.industry.trim()) {
      return NextResponse.json({ error: "industry is required" }, { status: 400 });
    }
    const icp: Icp = {
      industry: body.industry.trim(),
      employeeRange: body.employeeRange?.trim() || undefined,
      location: body.location?.trim() || undefined,
      targetRoles: body.targetRoles?.length ? body.targetRoles : undefined,
    };

    const count = Math.max(1, Math.min(10, Math.floor(body.count ?? 1)));
    if (count > 1) {
      const senderName = user.name || user.email.split("@")[0];
      const campaigns = await createBatch(user.id, icp, count, senderName);
      return NextResponse.json({ campaigns, count: campaigns.length });
    }
    const campaign = await createCampaign(user.id, icp, { senderName: user.name || user.email.split("@")[0] });
    return NextResponse.json({ campaign, campaigns: [campaign], count: 1 });
  } catch (err) {
    console.error("[/api/pipeline]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
