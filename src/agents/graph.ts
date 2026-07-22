import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { discoverLead } from "./leadDiscovery";
import { findDecisionMaker } from "./decisionMaker";
import { researchCompany } from "./research";
import { generateAngles } from "./personalization";
import { writeEmail, writeLinkedIn } from "./content";
import { evaluateGate } from "../lib/gate";
import type {
  Company,
  DecisionMaker,
  EmailDraft,
  Icp,
  OutreachAngle,
  ResearchDossier,
} from "../types";

// The state that flows through the pipeline. Each node writes its slice.
const PipelineState = Annotation.Root({
  icp: Annotation<Icp>(),
  company: Annotation<Company | null>({ reducer: (_, b) => b, default: () => null }),
  decisionMaker: Annotation<DecisionMaker | null>({ reducer: (_, b) => b, default: () => null }),
  research: Annotation<ResearchDossier | null>({ reducer: (_, b) => b, default: () => null }),
  angles: Annotation<OutreachAngle[]>({ reducer: (_, b) => b, default: () => [] }),
  email: Annotation<EmailDraft | null>({ reducer: (_, b) => b, default: () => null }),
  linkedin: Annotation<EmailDraft | null>({ reducer: (_, b) => b, default: () => null }),
  blocked: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  blockedReason: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  // Per-run web-search override (null = use env default).
  webSearch: Annotation<boolean | null>({ reducer: (_, b) => b, default: () => null }),
  // Name the outreach is signed with (the logged-in user).
  senderName: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  log: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

type State = typeof PipelineState.State;

// Node names must not collide with state-channel names, so they're verb-prefixed.
const graph = new StateGraph(PipelineState)
  .addNode("discover", async (s: State) => {
    // Batch runs pre-discover the company and pass it in — skip the search.
    if (s.company) return { log: [`Lead Discovery → ${s.company.name} (provided)`] };
    const company = await discoverLead(s.icp);
    return {
      company,
      log: [company ? `Lead Discovery → ${company.name} (${company.source})` : "Lead Discovery → no company found"],
    };
  })
  .addNode("findPerson", async (s: State) => {
    if (!s.company) return { decisionMaker: null, log: ["Decision Maker → skipped (no company)"] };
    const dm = await findDecisionMaker(s.company, s.icp);
    return {
      decisionMaker: dm,
      log: [
        dm
          ? `Decision Maker → ${dm.name}, ${dm.role} (confidence ${dm.confidence}, email verified: ${dm.emailVerified})`
          : "Decision Maker → none found",
      ],
    };
  })
  // The gate: decide whether we have enough authentic data to proceed.
  .addNode("assess", async (s: State) => {
    const { blocked, reason } = evaluateGate(s.company, s.decisionMaker);
    return {
      blocked,
      blockedReason: reason,
      log: [blocked ? `Gate → BLOCKED: ${reason}` : "Gate → passed, generating outreach"],
    };
  })
  .addNode("doResearch", async (s: State) => {
    const research = await researchCompany(s.company!, s.decisionMaker!, s.webSearch ?? undefined);
    return { research, log: [`Research → dossier ready (${research.source}, grounded: ${research.grounded})`] };
  })
  .addNode("personalize", async (s: State) => {
    const angles = await generateAngles(s.company!, s.research!);
    return { angles, log: [`Personalization → ${angles.length} angle(s)`] };
  })
  .addNode("writeContent", async (s: State) => {
    // Both channels are drafted in one pass so the operator can pick either.
    const [email, linkedin] = await Promise.all([
      writeEmail(s.company!, s.decisionMaker!, s.research!, s.angles, null, s.senderName),
      writeLinkedIn(s.company!, s.decisionMaker!, s.research!, s.angles, null, s.senderName),
    ]);
    return { email, linkedin, log: [`Content → email + LinkedIn drafted (${email.source})`] };
  })
  .addEdge(START, "discover")
  .addEdge("discover", "findPerson")
  .addEdge("findPerson", "assess")
  // Blocked campaigns skip all outreach generation and end immediately.
  .addConditionalEdges("assess", (s: State) => (s.blocked ? "blocked" : "proceed"), {
    blocked: END,
    proceed: "doResearch",
  })
  .addEdge("doResearch", "personalize")
  .addEdge("personalize", "writeContent")
  .addEdge("writeContent", END)
  .compile();

export interface PipelineResult {
  company: Company | null;
  decisionMaker: DecisionMaker | null;
  research: ResearchDossier | null;
  angles: OutreachAngle[];
  email: EmailDraft | null;
  linkedin: EmailDraft | null;
  blocked: boolean;
  blockedReason: string | null;
  log: string[];
}

export interface PipelineOptions {
  /** Pre-discovered company (batch mode skips the search). */
  company?: Company | null;
  /** Override web-search grounding for this run (batch turns it off). */
  webSearch?: boolean;
  /** Name to sign the email/DM with (the logged-in user).*/
  senderName?: string | null;
}

/** Run the full outbound pipeline for one ICP. */
export async function runPipeline(icp: Icp, opts?: PipelineOptions): Promise<PipelineResult> {
  const final = await graph.invoke({
    icp,
    company: opts?.company ?? null,
    webSearch: opts?.webSearch ?? null,
    senderName: opts?.senderName ?? null,
  });
  return {
    company: final.company,
    decisionMaker: final.decisionMaker,
    research: final.research,
    angles: final.angles,
    email: final.email,
    linkedin: final.linkedin,
    blocked: final.blocked,
    blockedReason: final.blockedReason,
    log: final.log,
  };
}
