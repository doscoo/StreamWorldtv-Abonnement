import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { Transaction } from "@/lib/fedapay";
import { getCurrentUser } from "@/lib/session";
import { getAppUrl } from "@/lib/url";

const bodySchema = z.object({ subscriptionId: z.string().uuid() });

// Mobile Money has no silent auto-debit, so unlike Stripe this has to be
// called explicitly — by a cron job / reminder flow — before currentPeriodEnd,
// then the resulting link gets sent to the customer (e.g. via the
// "trial_ending_3d" notification template in the schema).
export async function POST(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { subscriptionId } = bodySchema.parse(await req.json());

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true, user: true },
    });

    if (!subscription || subscription.paymentProvider !== "FEDAPAY") {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
    // Owner or an admin/support role may trigger a renewal link.
    if (subscription.userId !== caller.sub && !["OWNER", "ADMIN", "SUPPORT"].includes(caller.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const transaction = await Transaction.create({
      description: `Renouvellement — ${subscription.plan.name}`,
      amount: subscription.plan.priceCents,
      currency: { iso: subscription.plan.currency || "XOF" },
      callback_url: `${getAppUrl()}/payment/return`,
      customer: {
        firstname: subscription.user.firstName,
        lastname: subscription.user.lastName,
        email: subscription.user.email,
      },
    });
    const { url } = await transaction.generateToken();

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "PENDING_PAYMENT", fedapayTransactionId: String(transaction.id) },
    });

    return NextResponse.json({ paymentUrl: url });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("fedapay renew error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
