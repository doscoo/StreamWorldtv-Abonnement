import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { sendPaymentConfirmationEmail, sendPaymentFailedEmail } from "@/lib/email";

// Stripe needs the exact raw request bytes to verify the signature — do not
// run this through req.json() first, and do not add any body-parsing config
// that could alter it (App Router route handlers don't auto-parse, so
// req.text() below already gives us the untouched raw payload).
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET as string);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        const stripeSubscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        if (!userId || !planId || !stripeSubscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);

        await prisma.subscription.upsert({
          where: { stripeSubscriptionId },
          create: {
            userId,
            planId,
            status: "ACTIVE",
            paymentProvider: "STRIPE",
            stripeSubscriptionId,
            stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
          update: { status: "ACTIVE" },
        });

        await prisma.auditLog.create({
          data: { actorId: userId, action: "subscription.activated", target: stripeSubscriptionId },
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const status = mapStripeStatus(sub.status, event.type);

        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: {
            status,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (!stripeSubscriptionId) break;

        const subscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId },
          include: { plan: true },
        });
        if (!subscription) break;

        await prisma.invoice.upsert({
          where: { stripeInvoiceId: invoice.id },
          create: {
            subscriptionId: subscription.id,
            amountCents: invoice.amount_paid,
            currency: invoice.currency.toUpperCase(),
            status: "paid",
            provider: "STRIPE",
            stripeInvoiceId: invoice.id,
            paidAt: new Date(),
          },
          update: { status: "paid", paidAt: new Date() },
        });

        // Best-effort: an email failure must never fail the webhook (Stripe
        // would just keep retrying the same already-handled event).
        try {
          const user = await prisma.user.findUnique({ where: { id: subscription.userId } });
          if (user) {
            await sendPaymentConfirmationEmail(user, subscription.plan, subscription.currentPeriodEnd);
          }
        } catch (emailErr) {
          console.error("Stripe payment confirmation email failed:", emailErr);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeSubscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
        if (!stripeSubscriptionId) break;

        const subscription = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId },
          include: { plan: true },
        });
        if (!subscription) break;

        try {
          const user = await prisma.user.findUnique({ where: { id: subscription.userId } });
          if (user) {
            await sendPaymentFailedEmail(user, subscription.plan);
          }
        } catch (emailErr) {
          console.error("Stripe payment failure email failed:", emailErr);
        }
        break;
      }

      default:
        break; // Unhandled event types are ignored, not errors.
    }
  } catch (err) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, err);
    // Return 500 so Stripe retries — don't swallow a DB hiccup as "handled".
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status,
  eventType: string
): "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" {
  if (eventType === "customer.subscription.deleted") return "CANCELED";
  switch (stripeStatus) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    default:
      return "EXPIRED";
  }
}
