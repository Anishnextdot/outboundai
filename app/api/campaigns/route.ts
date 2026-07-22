import { NextResponse } from "next/server";
import {
  listCampaigns,
  getCampaign,
  setStatus,
  saveEditedEmail,
  saveDraft,
  markSent,
  markLinkedInSent,
} from "@/src/lib/repository";
import { sendEmail } from "@/src/lib/mailer";
import { writeEmail, writeLinkedIn } from "@/src/agents/content";
import { getSessionUser, saveSender } from "@/src/lib/auth";
import { env } from "@/src/lib/env";
import { isValidEmail } from "@/src/lib/validation";
import type { Channel, EmailDraft, Tone } from "@/src/types";

/** GET /api/campaigns — this user's campaigns (newest first) + trust threshold. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  try {
    const campaigns = await listCampaigns(user.id);
    return NextResponse.json({ campaigns, trustThreshold: env.trustThreshold });
  } catch (err) {
    console.error("[/api/campaigns GET]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

interface ActionBody {
  id: string;
  action: "approve" | "reject" | "edit" | "send" | "send_manual" | "regenerate" | "send_linkedin";
  email?: EmailDraft; // required for "edit"
  channel?: Channel; // "email" (default) | "linkedin"
  tone?: Tone; // for "regenerate"
  from?: string; // sender address for "send"
  fromName?: string;
}

/**
 * POST /api/campaigns — the Human Approval checkpoint. Server-side gating:
 * blocked or low-trust campaigns cannot be approved, regardless of the UI.
 * Every action is scoped to the signed-in user's own campaigns.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  try {
    const body = (await req.json()) as ActionBody;
    if (!body.id || !body.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    // Ownership check — getCampaign is scoped to this user.
    const existing = await getCampaign(body.id, user.id);
    if (!existing) return NextResponse.json({ error: "campaign not found" }, { status: 404 });

    switch (body.action) {
      case "approve": {
        if (existing.status === "blocked")
          return NextResponse.json({ error: "cannot approve a blocked campaign" }, { status: 409 });
        if (existing.trustScore < env.trustThreshold)
          return NextResponse.json(
            { error: `trust score ${existing.trustScore} is below threshold ${env.trustThreshold}` },
            { status: 409 }
          );
        return NextResponse.json({ campaign: await setStatus(body.id, user.id, "approved") });
      }
      case "reject":
        return NextResponse.json({ campaign: await setStatus(body.id, user.id, "rejected") });
      case "edit": {
        if (existing.status === "blocked")
          return NextResponse.json({ error: "cannot edit a blocked campaign" }, { status: 409 });
        if (!body.email) return NextResponse.json({ error: "email required for edit" }, { status: 400 });
        return NextResponse.json({
          campaign: await saveEditedEmail(body.id, user.id, body.email, body.channel ?? "email"),
        });
      }
      case "regenerate": {
        // Re-write the draft for one channel in a chosen tone.
        if (existing.status === "blocked")
          return NextResponse.json({ error: "cannot generate for a blocked campaign" }, { status: 409 });
        if (!existing.company || !existing.decisionMaker || !existing.research)
          return NextResponse.json({ error: "missing research/company data to regenerate" }, { status: 400 });
        const channel: Channel = body.channel ?? "email";
        const senderName = user.name || user.email.split("@")[0];
        const draft =
          channel === "linkedin"
            ? await writeLinkedIn(existing.company, existing.decisionMaker, existing.research, existing.angles, body.tone, senderName)
            : await writeEmail(existing.company, existing.decisionMaker, existing.research, existing.angles, body.tone, senderName);
        return NextResponse.json({ campaign: await saveDraft(body.id, user.id, draft, channel) });
      }
      case "send": {
        // Phase 3 — only approved campaigns with a verified recipient can send.
        if (existing.status !== "approved")
          return NextResponse.json({ error: "only approved campaigns can be sent" }, { status: 409 });
        if (existing.sendStatus === "sent" || existing.sendStatus === "simulated")
          return NextResponse.json({ error: "already sent" }, { status: 409 });
        const to = existing.decisionMaker?.email;
        if (!to || !isValidEmail(to))
          return NextResponse.json({ error: "no valid recipient email" }, { status: 400 });
        const email = existing.editedEmail ?? existing.email;
        if (!email) return NextResponse.json({ error: "no email draft to send" }, { status: 400 });

        // Sender: what the operator entered → their saved sender → env default.
        const from = (body.from || user.fromEmail || env.fromEmail || "").trim();
        if (!from || !isValidEmail(from))
          return NextResponse.json({ error: "A valid sender email is required" }, { status: 400 });
        const fromName = body.fromName ?? user.fromName ?? user.name ?? env.fromName;

        const result = await sendEmail({ from, fromName, to, subject: email.subject, body: email.body });
        // Remember the sender for next time.
        if (from !== user.fromEmail || fromName !== user.fromName) await saveSender(user.id, from, fromName);

        const updated = await markSent(existing.id, user.id, result);
        return NextResponse.json({ campaign: updated, send: result });
      }
      case "send_manual": {
        // Hand the email off to the operator's own mail app (Gmail/Outlook/…)
        // instead of delivering it ourselves. Useful before a sending domain is
        // verified, and it sends from their real inbox so replies land there.
        if (existing.status !== "approved")
          return NextResponse.json({ error: "only approved campaigns can be sent" }, { status: 409 });
        if (existing.sendStatus === "sent" || existing.sendStatus === "simulated")
          return NextResponse.json({ error: "already sent" }, { status: 409 });
        const to = existing.decisionMaker?.email;
        if (!to || !isValidEmail(to))
          return NextResponse.json({ error: "no valid recipient email" }, { status: 400 });
        const draft = existing.editedEmail ?? existing.email;
        if (!draft) return NextResponse.json({ error: "no email draft to send" }, { status: 400 });

        // Recorded as sent — the operator is about to send it from their client.
        const updated = await markSent(existing.id, user.id, {
          status: "sent",
          messageId: null,
          error: null,
        });
        return NextResponse.json({
          campaign: updated,
          manual: { to, subject: draft.subject, body: draft.body },
        });
      }
      case "send_linkedin": {
        // LinkedIn has no send API (and automating it breaks their ToS), so the
        // operator sends it in LinkedIn — we hand over the text + profile URL
        // and record that it went out so it shows in Sent/Analytics.
        if (existing.status !== "approved")
          return NextResponse.json({ error: "approve the campaign before sending" }, { status: 409 });
        const dm = existing.editedLinkedin ?? existing.linkedin;
        if (!dm) return NextResponse.json({ error: "no LinkedIn draft — generate one first" }, { status: 400 });
        const profileUrl = existing.decisionMaker?.linkedinUrl ?? null;
        const updated = await markLinkedInSent(existing.id, user.id);
        return NextResponse.json({
          campaign: updated,
          linkedin: { message: dm.body, profileUrl, composeUrl: linkedinComposeUrl(profileUrl) },
        });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    console.error("[/api/campaigns POST]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Best-effort deep link to a LinkedIn compose window for this person.
 *
 * LinkedIn has no supported public "message person X" URL — this uses the
 * public identifier from their profile URL, which usually opens messaging with
 * the thread selected. It can also land on the messaging home if LinkedIn
 * doesn't resolve the handle, which is why the profile link stays available as
 * a fallback and the message is always copied to the clipboard first.
 */
function linkedinComposeUrl(profileUrl: string | null): string | null {
  if (!profileUrl) return null;
  const m = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m) return null;
  return `https://www.linkedin.com/messaging/compose/?recipient=${encodeURIComponent(m[1])}`;
}
