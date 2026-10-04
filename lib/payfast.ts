import crypto from "crypto";
import type { PayfastSettings } from "./types";

// PayFast checkout — a real "Pay Now" hosted checkout (card, Instant EFT,
// etc.) with automatic payment confirmation via ITN webhook, for an
// Individual (non-company) PayFast account. Credentials are admin-editable
// (see /admin -> BrooksWay -> PayFast Settings, backed by the shared store)
// rather than environment variables, so Robin & Annami can add their real
// Merchant ID/Key themselves the moment their account is verified, with no
// redeploy needed. Falls back to PayFast's public sandbox test credentials
// until real ones are set, so the whole flow is testable end-to-end before
// going live.
//
// Note: PayFast's ITN webhook needs a publicly reachable HTTPS URL — it
// can't reach localhost, so automatic confirmation only works once deployed.
// Locally you can still test the checkout redirect itself with PayFast's
// sandbox test cards.

// PayFast's sandbox now requires a passphrase-enabled test account — their
// older passphrase-less demo credentials (10000100 / 46f0cd694581a) return
// a generic "signature does not match" error, since the passphrase config
// on their end no longer matches a request with no passphrase at all.
// This is PayFast's other published default sandbox account, which does
// have one and is verified to work end-to-end.
const SANDBOX_MERCHANT_ID = "10004002";
const SANDBOX_MERCHANT_KEY = "q1cd2rdny4a53";
const SANDBOX_PASSPHRASE = "payfast";

export type ResolvedPayfastCredentials = { merchantId: string; merchantKey: string; passphrase: string; live: boolean };

/** True once real (non-sandbox) Merchant ID + Key have been entered in admin. */
export function isPayfastConfigured(settings: PayfastSettings): boolean {
  return !!(settings.merchantId && settings.merchantKey);
}

export function resolvePayfastCredentials(settings: PayfastSettings): ResolvedPayfastCredentials {
  if (isPayfastConfigured(settings)) {
    return { merchantId: settings.merchantId, merchantKey: settings.merchantKey, passphrase: settings.passphrase, live: settings.live };
  }
  return { merchantId: SANDBOX_MERCHANT_ID, merchantKey: SANDBOX_MERCHANT_KEY, passphrase: SANDBOX_PASSPHRASE, live: false };
}

export function payfastProcessUrl(live: boolean): string {
  return live ? "https://www.payfast.co.za/eng/process" : "https://sandbox.payfast.co.za/eng/process";
}

export function payfastValidateUrl(live: boolean): string {
  return live ? "https://www.payfast.co.za/eng/query/validate" : "https://sandbox.payfast.co.za/eng/query/validate";
}

// PayFast expects PHP-style urlencoding: spaces as "+", and !'()* percent-escaped
// too (encodeURIComponent leaves those literal, unlike PHP's urlencode).
function pfEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

// Field order matters for the signature — must match the order fields are
// submitted in the form. Empty/undefined values are omitted entirely.
function buildSignatureBase(fields: [string, string | undefined][], passphrase: string): string {
  const parts = fields.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${pfEncode(v!)}`);
  let base = parts.join("&");
  if (passphrase) base += `&passphrase=${pfEncode(passphrase)}`;
  return base;
}

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

export type PayfastCheckout = {
  processUrl: string;
  fields: Record<string, string>;
};

/**
 * Builds the full, signed field set for PayFast's hosted checkout. The
 * result is meant to be rendered as a plain HTML form (method="post") that
 * auto-submits to `processUrl` — that's how PayFast's redirect flow works.
 */
export function buildPayfastCheckout(
  creds: ResolvedPayfastCredentials,
  input: {
    mPaymentId: string;
    amount: number;
    itemName: string;
    itemDescription?: string;
    nameFirst?: string;
    emailAddress?: string;
    returnUrl: string;
    cancelUrl: string;
    notifyUrl: string;
  }
): PayfastCheckout {
  const orderedFields: [string, string | undefined][] = [
    ["merchant_id", creds.merchantId],
    ["merchant_key", creds.merchantKey],
    ["return_url", input.returnUrl],
    ["cancel_url", input.cancelUrl],
    ["notify_url", input.notifyUrl],
    ["name_first", input.nameFirst],
    ["email_address", input.emailAddress],
    ["m_payment_id", input.mPaymentId],
    ["amount", input.amount.toFixed(2)],
    ["item_name", input.itemName],
    ["item_description", input.itemDescription],
  ];

  const signatureBase = buildSignatureBase(orderedFields, creds.passphrase);
  const signature = md5(signatureBase);

  const fields: Record<string, string> = {};
  for (const [k, v] of orderedFields) {
    if (v !== undefined && v !== "") fields[k] = v;
  }
  fields.signature = signature;

  return { processUrl: payfastProcessUrl(creds.live), fields };
}

/** Recomputes the signature from a received ITN POST body and compares. */
export function verifyItnSignature(body: Record<string, string>, passphrase: string): boolean {
  const received = body.signature;
  if (!received) return false;
  const fields: [string, string | undefined][] = Object.keys(body)
    .filter((k) => k !== "signature")
    .map((k) => [k, body[k]]);
  const base = buildSignatureBase(fields, passphrase);
  return md5(base) === received;
}

/** PayFast's recommended extra check: post the ITN back to PayFast to confirm it's genuine. */
export async function confirmItnWithPayfast(rawBody: string, live: boolean): Promise<boolean> {
  try {
    const res = await fetch(payfastValidateUrl(live), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: rawBody,
    });
    const text = await res.text();
    return text.trim() === "VALID";
  } catch {
    return false;
  }
}
