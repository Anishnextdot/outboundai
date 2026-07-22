// CLI harness to exercise the pipeline (no DB write).
//   npm run pipeline -- "Sports brands" "11-200" "India"
import { runPipeline } from "../src/agents/graph";
import { computeTrust } from "../src/lib/trust";

async function main() {
  const [industry = "Sports brands", employeeRange, location] = process.argv.slice(2);
  console.log(`\nRunning pipeline for ICP: ${industry}\n`);
  const r = await runPipeline({ industry, employeeRange, location });
  const trust = computeTrust({ company: r.company, decisionMaker: r.decisionMaker, research: r.research });

  for (const line of r.log) console.log("  •", line);

  console.log(`\n— Trust score: ${trust.total} —`);
  console.log(
    `  company ${trust.companyData} · decisionMaker ${trust.decisionMaker} · verifiedEmail ${trust.verifiedEmail} · research ${trust.researchGrounding}`
  );

  if (r.blocked) {
    console.log(`\n🚫 BLOCKED: ${r.blockedReason}`);
    console.log("   No outreach generated (as designed).\n");
    return;
  }

  console.log("\n— Company —");
  console.log(`  ${r.company?.name} · ${r.company?.website} · ${r.company?.location ?? ""}`);
  console.log("\n— Decision Maker —");
  console.log(
    `  ${r.decisionMaker?.name}, ${r.decisionMaker?.role} (confidence ${r.decisionMaker?.confidence}, verified ${r.decisionMaker?.emailVerified})`
  );
  console.log(`  email: ${r.decisionMaker?.email ?? "—"}`);
  console.log(`  linkedin: ${r.decisionMaker?.linkedinUrl ?? "—"}`);
  console.log("\n— Email —");
  console.log(`  Subject: ${r.email?.subject}\n`);
  console.log(
    (r.email?.body ?? "")
      .split("\n")
      .map((l) => "  " + l)
      .join("\n")
  );
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
