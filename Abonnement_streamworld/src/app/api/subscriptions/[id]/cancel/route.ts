import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getCurrentUser, isAdminRole } from "@/lib/session";

/**
 * Schedules cancellation at the end of the current billing period (never an
 * immediate cutoff, so the customer keeps what they already paid for).
 *
 * - STRIPE: we only ask Stripe to flip `cancel_at_period_end`. The DB row is
 *   NOT updated here — `customer.subscription.updated` (already handled in
 *   /api/billing/webhook) is the source of truth and will set
 *   `cancelAtPeriodEnd` once Stripe confirms it, same pattern as every other
 *   Stripe-driven state change in this app.
 * - FEDAPAY: there is no live "subscription" object on FedaPay's side to
 *   update (see README — each period is its own approved transaction), so
 *   cancelling just means "don't send another /renew link"; we set the flag
 *   directly.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const subscription = await prisma.subscription.findUnique({ where: { id: params.id } });
  const isAdminActingForCustomer = subscription && subscription.userId !== caller.sub && isAdminRole(caller.role);
  if (!subscription || (subscription.userId !== caller.sub && !isAdminRole(caller.role))) {
    return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });
  }
  if (subscription.status === "CANCELED" || subscription.status === "EXPIRED") {
    return NextResponse.json({ error: "Cet abonnement est déjà terminé." }, { status: 400 });
  }

  try {
    if (subscription.paymentProvider === "STRIPE") {
      if (!subscription.stripeSubscriptionId) {
        return NextResponse.json({ error: "Abonnement Stripe invalide." }, { status: 400 });
      }
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: true },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: caller.sub,
        action: isAdminActingForCustomer ? "subscription.cancel_requested_by_admin" : "subscription.cancel_requested",
        target: subscription.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("cancel subscription error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** Undo a scheduled cancellation, as long as the period hasn't ended yet. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const subscription = await prisma.subscription.findUnique({ where: { id: params.id } });
  const isAdminActingForCustomer = subscription && subscription.userId !== caller.sub && isAdminRole(caller.role);
  if (!subscription || (subscription.userId !== caller.sub && !isAdminRole(caller.role))) {
    return NextResponse.json({ error: "Abonnement introuvable" }, { status: 404 });
  }
  if (subscription.status !== "ACTIVE" && subscription.status !== "TRIALING") {
    return NextResponse.json({ error: "Cet abonnement ne peut pas être réactivé." }, { status: 400 });
  }

  try {
    if (subscription.paymentProvider === "STRIPE") {
      if (!subscription.stripeSubscriptionId) {
        return NextResponse.json({ error: "Abonnement Stripe invalide." }, { status: 400 });
      }
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });
    } else {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: caller.sub,
        action: isAdminActingForCustomer ? "subscription.cancel_undone_by_admin" : "subscription.cancel_undone",
        target: subscription.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("undo cancel subscription error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
