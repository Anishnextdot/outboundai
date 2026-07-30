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

/** A node that has just finished, reported as the run happens. */
export interface PipelineStep {
  /** Graph node name — one of PIPELINE_NODES. */
  node: string;
  /** Company known at this point, once discovery has resolved one. */
  company: string | null;
  /** Log lines the node emitted. */
  log: string[];
  /** True once the gate has blocked this lead (the run ends here). */
  blocked: boolean;
}

/** Every node, in execution order. The UI turns this into a progress list. */
export const PIPELINE_NODES = [
  "discover",
  "findPerson",
  "assess",
  "doResearch",
  "personalize",
  "writeContent",
] as const;

export interface PipelineOptions {
  /** Pre-discovered company (batch mode skips the search). */
  company?: Company | null;
  /** Override web-search grounding for this run (batch turns it off). */
  webSearch?: boolean;
  /** Name to sign the email/DM with (the logged-in user).*/
  senderName?: string | null;
  /** Called after each node completes — real progress, not a timer. */
  onStep?: (step: PipelineStep) => void;
}

/** Run the full outbound pipeline for one ICP. */
export async function runPipeline(icp: Icp, opts?: PipelineOptions): Promise<PipelineResult> {
  const input = {
    icp,
    company: opts?.company ?? null,
    webSearch: opts?.webSearch ?? null,
    senderName: opts?.senderName ?? null,
  };

  if (!opts?.onStep) return shape(await graph.invoke(input));

  // Streaming mode: each node's update is reported the moment it lands, so the
  // operator watches the real pipeline rather than a fake progress bar.
  const acc: Partial<State> = { ...input, angles: [], log: [] };
  const stream = await graph.stream(input, { streamMode: "updates" });
  for await (const chunk of stream) {
    for (const [node, raw] of Object.entries(chunk as Record<string, Partial<State>>)) {
      const { log, ...rest } = raw ?? {};
      Object.assign(acc, rest);
      if (log?.length) acc.log = (acc.log ?? []).concat(log);
      opts.onStep({
        node,
        company: acc.company?.name ?? null,
        log: log ?? [],
        blocked: acc.blocked ?? false,
      });
    }
  }
  return shape(acc);
}

function shape(s: Partial<State>): PipelineResult {
  return {
    company: s.company ?? null,
    decisionMaker: s.decisionMaker ?? null,
    research: s.research ?? null,
    angles: s.angles ?? [],
    email: s.email ?? null,
    linkedin: s.linkedin ?? null,
    blocked: s.blocked ?? false,
    blockedReason: s.blockedReason ?? null,
    log: s.log ?? [],
  };
}
