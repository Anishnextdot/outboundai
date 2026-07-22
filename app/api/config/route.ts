import { NextResponse } from "next/server";
import { env, hasAnthropic, hasApollo, hasSupabase } from "@/src/lib/env";
import { getSessionUser } from "@/src/lib/auth";

/**
 * GET /api/config — non-secret runtime config for the Settings page.
 * Exposes only booleans + non-sensitive values; never the keys themselves.
 * Still sign-in gated: model IDs and which integrations are live are not
 * something an anonymous caller needs.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  return NextResponse.json({
    appMode: env.appMode,
    model: env.model,
    trustThreshold: env.trustThreshold,
    enableWebSearch: env.enableWebSearch,
    demoForceVerified: env.demoForceVerified,
    integrations: {
      supabase: hasSupabase(),
      apollo: hasApollo(),
      anthropic: hasAnthropic(),
    },
  });
}
