import { Resend } from "resend";
import { VENUE } from "./content";

// Guest-notification email. Needs a free Resend account + API key — see
// README. Until RESEND_API_KEY is set, this is a safe no-op (returns
// "unconfigured" instead of throwing), so the rest of the admin dashboard
// works fine without it.

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function client() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

// resend.dev works with zero setup for testing; once you verify your own
// domain with Resend, set EMAIL_FROM to send from your own address instead.
function fromAddress() {
  return process.env.EMAIL_FROM || "Robin & Annami <onboarding@resend.dev>";
}

export async function sendBrooksWayLaunchEmail(
  recipientEmails: string[],
  baseUrl?: string
): Promise<{ sent: string[]; failed: string[]; error?: string }> {
  const resend = client();
  if (!resend) {
    return { sent: [], failed: recipientEmails, error: "Email is not configured yet — set RESEND_API_KEY. See README." };
  }
  if (recipientEmails.length === 0) return { sent: [], failed: [] };

  // Each guest gets their own individually-addressed email (via Resend's
  // batch endpoint) rather than one email with everyone hidden in BCC —
  // BCC-with-a-fake-"to" is a strong spam signal and hurts deliverability.
  // Resend's batch API accepts up to 100 emails per call.
  const BATCH = 100;
  const sent: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < recipientEmails.length; i += BATCH) {
    const batch = recipientEmails.slice(i, i + BATCH);
    try {
      const { data, error } = await resend.batch.send(
        batch.map((email) => ({
          from: fromAddress(),
          to: [email],
          subject: "BrooksWay is open — get your predictions in! 🎉",
          html: brooksWayLaunchHtml(baseUrl),
        }))
      );
      if (error || !data) {
        failed.push(...batch);
      } else {
        sent.push(...batch);
      }
    } catch {
      failed.push(...batch);
    }
  }

  return { sent, failed, error: failed.length > 0 ? "Some emails failed to send." : undefined };
}

export async function sendRsvpConfirmationEmail(
  email: string,
  familyName: string,
  memberNames: string[],
  baseUrl?: string
): Promise<{ sent: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { sent: false, error: "Email is not configured yet — set RESEND_API_KEY. See README." };

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: [email],
      subject: "We've got your RSVP! 💌",
      html: rsvpConfirmationHtml(familyName, memberNames, baseUrl),
    });
    if (error || !data) return { sent: false, error: error?.message || "Unknown error" };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// The live URL is taken from the request the email was triggered by, so links
// always point at the real site. NEXT_PUBLIC_SITE_URL is only a manual
// override — an unset/placeholder env var used to silently produce dead links.
function siteUrl(baseUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const candidate = baseUrl?.trim() || configured;
  if (!candidate || candidate.includes("your-site-url.example") || candidate.includes("localhost")) {
    return configured && !configured.includes("your-site-url.example") ? configured : "https://site-lac-gamma-48.vercel.app";
  }
  return candidate.replace(/\/+$/, "");
}

function rsvpConfirmationHtml(familyName: string, memberNames: string[], baseUrl?: string) {
  const guestList = memberNames.map((n) => `<li style="padding:4px 0;">${n}</li>`).join("");
  return `
  <div style="font-family:Arial,Helvetica,sans-serif; background:#2e2019; padding:32px; color:#f8f3ec;">
    <div style="max-width:480px; margin:0 auto;">
      <div style="font-family:Georgia,serif; font-style:italic; font-size:28px; color:#f8f3ec; text-align:center;">Robin &amp; Annami</div>
      <p style="font-size:15px; line-height:1.7; color:#cbb190; text-align:center; margin-top:24px;">
        Thank you, ${familyName} — we've got your RSVP! We can't wait to celebrate with you at ${VENUE}
        on 5 December 2026.
      </p>
      ${guestList ? `<ul style="list-style:none; padding:0; margin:20px 0; font-size:14px; color:#f8f3ec; text-align:center;">${guestList}</ul>` : ""}
      <div style="text-align:center; margin-top:28px;">
        <a href="${siteUrl(baseUrl)}" style="display:inline-block; background:#b3884e; color:#fff; padding:14px 32px; border-radius:4px; text-decoration:none; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">Visit the site</a>
      </div>
      <p style="font-size:12px; color:rgba(248,243,236,0.5); text-align:center; margin-top:32px;">Need to change your RSVP? Just resubmit — your latest response always replaces the last one.</p>
    </div>
  </div>`;
}

function brooksWayLaunchHtml(baseUrl?: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif; background:#2e2019; padding:32px; color:#f8f3ec;">
    <div style="max-width:480px; margin:0 auto;">
      <div style="font-family:Georgia,serif; font-style:italic; font-size:28px; color:#f8f3ec; text-align:center;">Robin &amp; Annami</div>
      <div style="text-align:center; margin-top:24px; font-size:34px; font-weight:800;">
        <span style="color:#fff;">brooks</span><span style="color:#00B83F;">way</span>
      </div>
      <p style="font-size:15px; line-height:1.7; color:#cbb190; text-align:center; margin-top:24px;">
        The wedding prediction game is officially open! Make your calls on the ceremony and reception,
        pay your R50 a slip, and follow your predictions live on the day at ${VENUE}.
      </p>
      <div style="text-align:center; margin-top:28px;">
        <a href="${siteUrl(baseUrl)}/games" style="display:inline-block; background:#b3884e; color:#fff; padding:14px 32px; border-radius:4px; text-decoration:none; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">Play BrooksWay</a>
      </div>
      <p style="font-size:12px; color:rgba(248,243,236,0.55); text-align:center; margin-top:14px;">
        Or open this link: <a href="${siteUrl(baseUrl)}/games" style="color:#cbb190;">${siteUrl(baseUrl)}/games</a>
      </p>
      <p style="font-size:12px; color:rgba(248,243,236,0.5); text-align:center; margin-top:32px;">For entertainment only · No real gambling · 18+</p>
    </div>
  </div>`;
}
