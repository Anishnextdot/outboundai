import { NextResponse } from "next/server";
import { listResponses, recordResponse, getCampaign } from "@/src/lib/repository";
import { getSessionUser } from "@/src/lib/auth";
import type { Sentiment } from "@/src/types";

/** GET /api/responses — this user's tracked responses (newest first). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    return NextResponse.json({ responses: await listResponses(user.id) });
  } catch (err) {
    console.error("[/api/responses GET]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

interface Body {
  campaignId: string;
  type?: "reply" | "meeting" | "bounce";
  sentiment?: Sentiment;
  content?: string;
}

/**
 * POST /api/responses — log an inbound response. Until real inbox webhooks are
 * wired, this is how a reply/meeting gets recorded (from the Sent screen).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    const body = (await req.json()) as Body;
    if (!body.campaignId) return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    // Ownership check.
    const campaign = await getCampaign(body.campaignId, user.id);
    if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });

    const response = await recordResponse({
      campaignId: body.campaignId,
      type: body.type ?? "reply",
      sentiment: body.sentiment ?? null,
      content: body.content ?? null,
    });
    return NextResponse.json({ response });
  } catch (err) {
    console.error("[/api/responses POST]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
