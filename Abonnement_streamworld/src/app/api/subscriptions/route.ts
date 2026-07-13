import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { getCurrentUser } from "@/lib/session";
import { getAppUrl } from "@/lib/url";

const bodySchema = z.object({ planId: z.string().uuid() });

// Starts a Stripe Checkout session for a plan. Actual Subscription row is
// created by the webhook (checkout.session.completed) — never here — so a
// client can't spoof "I paid" without Stripe confirming it first.
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
    if (!plan.stripePriceId) {
      return NextResponse.json({ error: "Plan is not billable via Stripe." }, { status: 400 });
    }

    const appUrl = getAppUrl();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/dashboard?checkout=canceled`,
      metadata: { userId: user.id, planId: plan.id },
      subscription_data: { metadata: { userId: user.id, planId: plan.id } },
    });

    return NextResponse.json({ checkoutUrl: checkoutSession.url });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("create subscription error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const subscriptions = await prisma.subscription.findMany({
    where: { userId: caller.sub },
    include: { plan: true, invoices: { orderBy: { issuedAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ subscriptions });
}
