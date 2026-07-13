import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Sample plans so /pricing has something to show and the checkout flow
 * (Stripe + FedaPay) can actually be exercised end-to-end. Run with
 * `npm run db:seed`. Safe to re-run — upserts by name.
 *
 * IMPORTANT: replace `stripePriceId` below with a real Price id from your
 * Stripe Dashboard (Product catalog → your product → pricing). Without a
 * valid stripePriceId, the "Payer par carte" button will 400 with
 * "Plan is not billable via Stripe." — FedaPay plans don't need one.
 */
async function main() {
  const plans = [
    {
      name: "Starter",
      description: "Pour démarrer — fonctionnalités essentielles.",
      priceCents: 500000, // 5 000 FCFA (whole francs, no minor unit)
      currency: "XOF",
      intervalDays: 30,
      stripePriceId: null,
      active: true,
    },
    {
      name: "Pro",
      description: "Pour les professionnels — support prioritaire.",
      priceCents: 1500000, // 15 000 FCFA
      currency: "XOF",
      intervalDays: 30,
      stripePriceId: process.env.SEED_STRIPE_PRICE_ID_PRO ?? null,
      active: true,
    },
    {
      name: "Business",
      description: "Pour les équipes — facturation annuelle.",
      priceCents: 15000000, // 150 000 FCFA / an
      currency: "XOF",
      intervalDays: 365,
      stripePriceId: process.env.SEED_STRIPE_PRICE_ID_BUSINESS ?? null,
      active: true,
    },
  ];

  for (const plan of plans) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    if (existing) {
      await prisma.plan.update({ where: { id: existing.id }, data: plan });
      console.log(`Updated plan: ${plan.name}`);
    } else {
      await prisma.plan.create({ data: plan });
      console.log(`Created plan: ${plan.name}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
