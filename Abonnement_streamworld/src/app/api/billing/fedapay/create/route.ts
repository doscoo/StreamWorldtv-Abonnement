import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { Transaction } from "@/lib/fedapay";
import { getCurrentUser } from "@/lib/session";
import { getAppUrl } from "@/lib/url";
import { addDays } from "date-fns";

const bodySchema = z.object({ planId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { planId } = bodySchema.parse(await req.json());

    const [user, plan] = await Promise.all([
      prisma.user.findUnique({ where: { id: caller.sub } }),
      prisma.plan.findUnique({ where: { id: planId } }),
    ]);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!plan || !plan.active) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    // XOF has no minor unit — Plan.priceCents holds the whole FCFA amount
    // for FedaPay-billed plans (see README "Amounts" note).
    //
    // callback_url: where FedaPay redirects the customer's browser after
    // they approve/cancel on the hosted Mobile Money page. Built from our
    // own stable app URL (src/lib/url.ts) — never a raw pasted Vercel
    // deployment URL, which is exactly how a customer can land on a
    // "DEPLOYMENT_NOT_FOUND" page after paying.
    const transaction = await Transaction.create({
      description: `Abonnement ${plan.name}`,
      amount: plan.priceCents,
      currency: { iso: plan.currency || "XOF" },
      callback_url: `${getAppUrl()}/payment/return`,
      customer: {
        firstname: user.firstName,
        lastname: user.lastName,
        email: user.email,
        ...(user.phone ? { phone_number: { number: user.phone, country: user.country ?? "BJ" } } : {}),
      },
    });

    // generateToken() returns a hosted payment-link URL the customer opens
    // and approves with their Mobile Money PIN. Check the installed fedapay
    // SDK's README if this method name has changed upstream.
    const { url } = await transaction.generateToken();

    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: "PENDING_PAYMENT",
        paymentProvider: "FEDAPAY",
        fedapayTransactionId: String(transaction.id),
        currentPeriodStart: new Date(),
        currentPeriodEnd: addDays(new Date(), plan.intervalDays),
      },
    });

    return NextResponse.json({ paymentUrl: url, subscriptionId: subscription.id });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("fedapay create error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
