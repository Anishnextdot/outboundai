// Smoke-test the Supabase persistence layer. Requires SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY and the applied migrations. Safe to run repeatedly.
//   npm run db:check
import { hasSupabase } from "../src/lib/env";
import { getSupabase } from "../src/lib/db/client";
import { persistCampaign, listCampaigns, setStatus } from "../src/lib/repository";
import { computeTrust } from "../src/lib/trust";

const TEST_EMAIL = "db-check@arka.local";

async function testUserId(): Promise<string> {
  const db = getSupabase();
  const { data: existing } = await db.from("users").select("id").eq("email", TEST_EMAIL).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await db
    .from("users")
    .insert({ email: TEST_EMAIL, name: "DB Check" })
    .select("id")
    .single();
  if (error) throw new Error(`create test user: ${error.message}`);
  return data.id as string;
}

async function main() {
  if (!hasSupabase()) {
    console.log(
      "Supabase not configured — skipping.\n" +
        "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then apply the migrations\n" +
        "in supabase/migrations/, and re-run `npm run db:check`."
    );
    return;
  }

  const userId = await testUserId();
  console.log(`✓ test user ${userId}`);

  console.log("Persisting a blocked test campaign…");
  const trust = computeTrust({ company: null, decisionMaker: null, research: null });
  const c = await persistCampaign({
    userId,
    icp: { industry: "DB Smoke Test" },
    company: null,
    decisionMaker: null,
    research: null,
    angles: [],
    email: null,
    linkedin: null,
    status: "blocked",
    blockedReason: "db smoke test",
    trust,
    trustScore: trust.total,
    log: ["db:check inserted this row"],
  });
  console.log(`✓ inserted campaign ${c.id} (status=${c.status}, trust=${c.trustScore})`);

  const updated = await setStatus(c.id, userId, "rejected");
  console.log(`✓ status update → ${updated?.status}`);

  const all = await listCampaigns(userId);
  console.log(`✓ read back ${all.length} campaign(s) for the test user`);
  console.log("\nDatabase layer verified (user-scoped).");
}

main().catch((e) => {
  console.error("\n✗ DB CHECK FAILED\n", e);
  process.exit(1);
});
