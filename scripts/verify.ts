// End-to-end verification of the trust + blocking logic WITHOUT a database.
// (DB wiring is verified separately with `npm run db:check` once Supabase is
// configured.) Runs in demo mode with defaults.
import assert from "node:assert";
import { computeTrust } from "../src/lib/trust";
import { evaluateGate } from "../src/lib/gate";
import { runPipeline } from "../src/agents/graph";
import type { Company, DecisionMaker } from "../src/types";

const realCompany: Company = {
  name: "Acme",
  website: "https://acme.com",
  industry: "Sports brands",
  employeeCount: 120,
  revenueEstimate: "$10M-$25M",
  location: "India",
  externalId: "apollo_1",
  source: "apollo",
};
const verifiedDM: DecisionMaker = {
  name: "Jane Doe",
  role: "CMO",
  linkedinUrl: null,
  email: "jane@acme.com",
  emailVerified: true,
  confidence: 95,
  reasoning: "",
  source: "apollo",
};

async function main() {
  let pass = 0;

  // 1. Trust math matches the spec's worked example (company 100, DM 95,
  //    verified email 100, research 0 → 73).
  const trust = computeTrust({ company: realCompany, decisionMaker: verifiedDM, research: null });
  assert.strictEqual(trust.total, 73, `expected trust 73, got ${trust.total}`);
  console.log(`✓ trust example → ${trust.total} (company ${trust.companyData}, dm ${trust.decisionMaker}, email ${trust.verifiedEmail}, research ${trust.researchGrounding})`);
  pass++;

  // 2. Gate blocks when critical data is missing.
  assert.strictEqual(evaluateGate(null, null).blocked, true);
  assert.strictEqual(evaluateGate(realCompany, null).blocked, true);
  assert.strictEqual(
    evaluateGate(realCompany, { ...verifiedDM, email: null, emailVerified: false }).blocked,
    true
  );
  console.log("✓ gate BLOCKS on missing company / decision-maker / verified email");
  pass++;

  // 3. Gate passes when all critical data is present.
  const ok = evaluateGate(realCompany, verifiedDM);
  assert.strictEqual(ok.blocked, false);
  console.log("✓ gate PASSES with company + decision-maker + verified email");
  pass++;

  // 4. End-to-end: a demo run with an unverified mock email must BLOCK and
  //    produce NO outreach.
  const r = await runPipeline({ industry: "Sports brands", employeeRange: "11-200" });
  assert.strictEqual(r.blocked, true, "expected demo run to block on unverified email");
  assert.strictEqual(r.email, null, "blocked campaign must not have an email");
  assert.strictEqual(r.research, null, "blocked campaign must not have research");
  console.log(`✓ e2e demo run BLOCKED → "${r.blockedReason}", no outreach generated`);
  pass++;

  console.log(`\nAll ${pass} checks passed.`);
}

main().catch((e) => {
  console.error("\n✗ VERIFICATION FAILED\n", e);
  process.exit(1);
});
