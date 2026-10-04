import { NextRequest, NextResponse } from "next/server";
import { confirmItnWithPayfast, resolvePayfastCredentials, verifyItnSignature } from "@/lib/payfast";
import * as store from "@/lib/store";

// PayFast's ITN (Instant Transaction Notification) webhook. PayFast POSTs
// here the moment a payment's status changes — this is what makes slip
// confirmation automatic instead of the couple manually checking their bank.
// Needs a publicly reachable HTTPS URL, so this only actually fires once
// deployed (PayFast can't reach localhost).

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  const body: Record<string, string> = {};
  params.forEach((value, key) => {
    body[key] = value;
  });

  const settings = await store.getPayfastSettings();
  const creds = resolvePayfastCredentials(settings);

  // 1. Signature must match.
  if (!verifyItnSignature(body, creds.passphrase)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // 2. PayFast's recommended extra check — ask PayFast to confirm this ITN is genuine.
  const confirmed = await confirmItnWithPayfast(rawBody, creds.live);
  if (!confirmed) {
    return NextResponse.json({ error: "could not confirm with PayFast" }, { status: 400 });
  }

  // 3. Only mark paid on a completed payment, for the expected amount.
  const mPaymentId = body.m_payment_id;
  const amountGross = parseFloat(body.amount_gross || "0");
  if (body.payment_status === "COMPLETE" && mPaymentId && amountGross >= 50) {
    await store.markSlipPaid(mPaymentId, true);
  }

  return new NextResponse("OK", { status: 200 });
}
