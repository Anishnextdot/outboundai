import { generateText, hasAnthropic } from "../lib/anthropic";
import { allowMock, env } from "../lib/env";
import type { Company, DecisionMaker, EmailDraft, OutreachAngle, ResearchDossier, Tone } from "../types";

/**
 * Tone system. Every tone still passes through HOUSE_STYLE — tone shifts the
 * register, it never licenses jargon, hype, or AI-sounding filler.
 */
export const TONES: Record<Tone, string> = {
  direct: "Tone: direct and plain — the default house style. State the observation, then the point. No hedging.",
  warm: "Tone: warm and conversational. Acknowledge their situation in a human way before making the point. Still concise, still no filler.",
  formal: "Tone: professional and buttoned-up. Complete sentences, no contractions, respectful distance. Never stiff or bureaucratic.",
  punchy: "Tone: punchy and high-energy. 60-90 words maximum. Short sentences. One sharp hook, one ask. Cut every optional word.",
  consultative: "Tone: advisory and insight-led, like a senior consultant's note. Lead with the observation, then its commercial implication, then the offer.",
};

function toneInstruction(tone?: Tone | null): string {
  return TONES[tone ?? "direct"];
}

/**
 * House writing principles — the voice every email must pass through.
 * This is the guardrail against AI-sounding, jargon-heavy outreach.
 */
export const HOUSE_STYLE = `Voice and principles (follow strictly):
- Research-first: open with something specific and true about THEM, not about us.
- Direct and short: 90-130 words. Every sentence earns its place.
- Clear and trustworthy: plain language. No hype, no superlatives, no "revolutionary/game-changing".
- No marketing jargon, no buzzwords, no AI-sounding phrasing ("I hope this email finds you well", "I wanted to reach out", "leverage", "synergy", "circle back").
- No exaggerated claims or fake urgency. No "quick call?" hard-close.
- Sound like a senior consultant who did their homework, wrote it by hand, and respects the reader's time.
- One soft, low-friction ask at the end (an idea worth 10 minutes, not a demand).`;

/**
 * Agent 5 — Content.
 * Writes the cold email from the research + angles, in the house voice, signed by the logged-in user.
 */
export async function writeEmail(
  company: Company,
  decisionMaker: DecisionMaker,
  research: ResearchDossier,
  angles: OutreachAngle[],
  tone?: Tone | null,
  senderName?: string | null
): Promise<EmailDraft> {
  if (!hasAnthropic()) {
    if (allowMock()) return { ...mockEmail(company, decisionMaker, angles, senderName), tone: tone ?? "direct" };
    throw new Error("Content generation requires ANTHROPIC_API_KEY in production");
  }

  try {
    const raw = await generateText({
      system: `You write cold outbound emails for Arka Alliance, a marketing consultancy.\n\n${HOUSE_STYLE}\n\n${toneInstruction(tone)}\n\nReturn ONLY the email in this exact format:\nSubject: <subject line>\n\n<email body>\n\nNo preamble, no notes, no signature block beyond the sender's name.`,
      prompt: buildPrompt(company, decisionMaker, research, angles, senderName),
      maxTokens: 1200,
      model: env.modelWriter, // the email copy is the value prop → writer tier
    });
    return { ...parseEmail(raw, company, decisionMaker, angles), tone: tone ?? "direct" };
  } catch (err) {
    if (allowMock()) {
      console.warn("[content] Claude call failed, using mock:", (err as Error).message);
      return { ...mockEmail(company, decisionMaker, angles, senderName), tone: tone ?? "direct" };
    }
    throw err;
  }
}

/**
 * Agent 5b — LinkedIn DM. Much shorter than email: no subject, no signature,
 * one observation and one soft ask. LinkedIn punishes anything that reads like
 * a pitch deck.
 */
export async function writeLinkedIn(
  company: Company,
  decisionMaker: DecisionMaker,
  research: ResearchDossier,
  angles: OutreachAngle[],
  tone?: Tone | null,
  senderName?: string | null
): Promise<EmailDraft> {
  if (!hasAnthropic()) {
    if (allowMock()) return { ...mockLinkedIn(company, decisionMaker, angles, senderName), tone: tone ?? "direct" };
    throw new Error("Content generation requires ANTHROPIC_API_KEY in production");
  }

  try {
    const body = await generateText({
      system: `You write LinkedIn connection/DM messages for Arka Alliance, a marketing consultancy.\n\n${HOUSE_STYLE}\n\n${toneInstruction(tone)}\n\nLinkedIn-specific rules:\n- 40-70 words. Hard limit.\n- No subject line, no greeting block.\n- Open with the specific observation about THEM, not an introduction of us.\n- One soft ask at the end. Never "let's hop on a call".\n- Plain text only. No emoji, no hashtags, no links.\n${senderName ? `- End with the sender's first name on its own line: ${senderName.split(" ")[0]}` : "- No signature."}\n\nReturn ONLY the message text.`,
      prompt: buildPrompt(company, decisionMaker, research, angles, senderName),
      maxTokens: 500,
      model: env.modelWriter,
    });
    return { subject: "", body: body.trim(), source: "claude", tone: tone ?? "direct" };
  } catch (err) {
    if (allowMock()) {
      console.warn("[content] LinkedIn call failed, using mock:", (err as Error).message);
      return { ...mockLinkedIn(company, decisionMaker, angles, senderName), tone: tone ?? "direct" };
    }
    throw err;
  }
}

function buildPrompt(
  company: Company,
  dm: DecisionMaker,
  research: ResearchDossier,
  angles: OutreachAngle[],
  senderName?: string | null
): string {
  const primary = angles[0];
  return [
    `Recipient: ${dm.name}, ${dm.role} at ${company.name}.`,
    `What we know: ${research.summary}`,
    "",
    "Lead with this angle (make it feel observed, not templated):",
    primary
      ? `- Observation: ${primary.observation}\n- Opportunity: ${primary.opportunity}\n- Why Arka: ${primary.relevanceToArka}`
      : research.opportunities.join("; "),
    "",
    senderName
      ? `Write the email. Address them by first name. Sign off with exactly: ${senderName}`
      : "Write the email. Address them by first name. Do not add a signature.",
  ].join("\n");
}

function parseEmail(
  raw: string,
  company: Company,
  dm: DecisionMaker,
  angles: OutreachAngle[]
): EmailDraft {
  const match = raw.match(/^\s*subject:\s*(.+?)\s*\n([\s\S]*)$/i);
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim(), source: "claude" };
  }
  // Fallback if the model didn't use the Subject: prefix.
  return { subject: `A thought on ${company.name}'s next chapter`, body: raw.trim(), source: "claude" };
}

function mockLinkedIn(company: Company, dm: DecisionMaker, angles: OutreachAngle[], senderName?: string | null): EmailDraft {
  const first = dm.name.split(" ")[0];
  const obs = angles[0]?.observation ?? `${company.name}'s recent campaign leaned hard into reach.`;
  return {
    subject: "",
    body: `Hi ${first} — ${obs.charAt(0).toLowerCase() + obs.slice(1)} The reach was clearly there; what's less clear is what happens to that audience afterwards. We help brands turn that spike into a base. Happy to share one specific idea for ${company.name} if useful.`,
    source: "mock",
  };
}

function mockEmail(company: Company, dm: DecisionMaker, angles: OutreachAngle[], senderName?: string | null): EmailDraft {
  const first = dm.name.split(" ")[0];
  const obs = angles[0]?.observation ?? `${company.name}'s recent campaign leaned hard into reach.`;
  return {
    subject: `${company.name}'s audience after the campaign`,
    body: `Hi ${first},\n\n${obs} The reach was clearly there. What's less clear from the outside is what happens to that audience once the campaign winds down.\n\nMost brands we work with in your space find the same gap: strong acquisition, thin follow-through. The attention arrives and then quietly leaks away.\n\nWe've helped brands in your position build the layer that keeps it — owned-channel content and nurture that turns a spike into a base. Happy to share one specific idea for ${company.name} if it's useful; no pitch, just the idea.\n\nWorth ten minutes?\n\n${senderName ?? ""}`,
    source: "mock",
  };
}
