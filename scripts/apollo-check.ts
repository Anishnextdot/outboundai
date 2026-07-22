// Exercises ONLY the Apollo-backed stages (lead discovery + decision maker).
// These need no Anthropic key, so they prove the real-data layer on its own.
//   npm run apollo:check -- "Sports brands" "11-200" "India"
import { discoverLead } from "../src/agents/leadDiscovery";
import { findDecisionMaker } from "../src/agents/decisionMaker";

async function main() {
  const [industry = "Sports brands", employeeRange = "11-200", location = "India"] = process.argv.slice(2);
  const icp = { industry, employeeRange, location };
  console.log("ICP:", JSON.stringify(icp));

  const company = await discoverLead(icp);
  if (!company) {
    console.log("BLOCKED: no company found for this ICP");
    return;
  }
  console.log(`\nCOMPANY: ${company.name} · ${company.website} · ${company.location ?? "—"} · source=${company.source}`);

  const dm = await findDecisionMaker(company, icp);
  if (!dm) {
    console.log("BLOCKED: no decision maker found");
    return;
  }
  console.log(`\nDECISION MAKER: ${dm.name} — ${dm.role}`);
  console.log(`  email: ${dm.email ?? "—"} · verified: ${dm.emailVerified} · confidence: ${dm.confidence}`);
  console.log(`  linkedin: ${dm.linkedinUrl ?? "—"}`);
}

main().catch((e) => console.error("ERR", e.message));
