import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Public: list active plans for the pricing page. No auth required — a
 * visitor has to be able to see prices before creating an account.
 */
export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { priceCents: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      priceCents: true,
      currency: true,
      intervalDays: true,
      stripePriceId: true,
    },
  });

  // Tell the client which payment providers are actually usable for each
  // plan — Stripe requires a configured stripePriceId, FedaPay never does
  // (it creates the transaction on the fly with just the amount).
  const withProviders = plans.map((plan: (typeof plans)[number]) => ({
    ...plan,
    providers: {
      stripe: Boolean(plan.stripePriceId),
      fedapay: true,
    },
  }));

  return NextResponse.json({ plans: withProviders });
}
