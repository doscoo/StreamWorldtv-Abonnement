import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { Webhook } from "@/lib/fedapay";
import { sendPaymentConfirmationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-fedapay-signature");
  const secret = process.env.FEDAPAY_WEBHOOK_SECRET as string;

  let payload: any;
  try {
    // Verifies the "t=<timestamp>,v1=<signature>" header and parses the
    // JSON body in one step; throws on bad signature, expired timestamp, or
    // malformed JSON.
    payload = Webhook.constructEvent(rawBody, signatureHeader, secret);
  } catch (err) {
    console.error("FedaPay webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventName: string = payload.name ?? payload.event;
  const transaction = payload.entity ?? payload.data?.object;
  const transactionId: string | undefined = transaction?.id ? String(transaction.id) : undefined;

  if (eventName === "transaction.approved" && transactionId) {
    const subscription = await prisma.subscription.findUnique({
      where: { fedapayTransactionId: transactionId },
      include: { plan: true },
    });

    if (subscription) {
      const now = new Date();
      const wasRenewal = subscription.status !== "PENDING_PAYMENT" || subscription.currentPeriodEnd > now;
      const newPeriodEnd = addDays(
        wasRenewal ? subscription.currentPeriodEnd : now,
        subscription.plan.intervalDays
      );

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: newPeriodEnd,
        },
      });

      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          amountCents: subscription.plan.priceCents,
          currency: subscription.plan.currency,
          status: "paid",
          provider: "FEDAPAY",
          fedapayTransactionId: transactionId,
          paidAt: now,
        },
      });

      await prisma.auditLog.create({
        data: { actorId: subscription.userId, action: "subscription.activated", target: transactionId },
      });

      // Best-effort: an email failure must never fail the webhook (FedaPay
      // would just keep retrying the same already-handled event).
      try {
        const user = await prisma.user.findUnique({ where: { id: subscription.userId } });
        if (user) {
          await sendPaymentConfirmationEmail(user, subscription.plan, newPeriodEnd);
        }
      } catch (emailErr) {
        console.error("FedaPay payment confirmation email failed:", emailErr);
      }
    }
  }

  // Other events (transaction.declined, transaction.canceled, ...) are
  // acknowledged but not acted on yet — the subscription simply stays
  // PENDING_PAYMENT until the customer completes or a new link is sent.

  return NextResponse.json({ received: true });
}
