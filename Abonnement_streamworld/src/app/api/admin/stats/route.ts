import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdminRole } from "@/lib/session";

type MonthlyRevenueRow = { month: Date; provider: string; total_cents: bigint | number };

export async function GET(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const [
    totalUsers,
    statusBreakdown,
    newSignups30d,
    recentSignups,
    revenue30d,
    revenueAllTime,
    revenueByProvider30d,
    activeSubscriptions,
    canceledLast30d,
    expiringSoon,
    planPopularity,
    monthlyRevenueRaw,
    disabledUsersCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count({ where: { createdAt: { gte: since30d } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, firstName: true, lastName: true, email: true, createdAt: true, role: true },
    }),
    prisma.invoice.aggregate({
      where: { status: "paid", paidAt: { gte: since30d } },
      _sum: { amountCents: true },
    }),
    prisma.invoice.aggregate({
      where: { status: "paid" },
      _sum: { amountCents: true },
    }),
    prisma.invoice.groupBy({
      by: ["provider"],
      where: { status: "paid", paidAt: { gte: since30d } },
      _sum: { amountCents: true },
    }),
    // Active/trialing subscriptions with their plan, to compute MRR — normalizing
    // every plan's price to a 30-day period regardless of its own billing interval.
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      select: { plan: { select: { priceCents: true, intervalDays: true, currency: true } } },
    }),
    prisma.subscription.count({
      where: { status: { in: ["CANCELED", "EXPIRED"] }, updatedAt: { gte: since30d } },
    }),
    prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: { gte: now, lte: in7d },
      },
      orderBy: { currentPeriodEnd: "asc" },
      take: 20,
      select: {
        id: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        paymentProvider: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        plan: { select: { name: true, priceCents: true, currency: true } },
      },
    }),
    prisma.subscription.groupBy({
      by: ["planId"],
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      _count: { _all: true },
    }),
    // Monthly paid revenue for the last 12 months, split by provider — driving
    // the trend chart. Raw SQL because Prisma's groupBy can't bucket by month.
    prisma.$queryRaw<MonthlyRevenueRow[]>`
      SELECT date_trunc('month', "paidAt") AS month, provider, SUM("amountCents") AS total_cents
      FROM "Invoice"
      WHERE status = 'paid' AND "paidAt" >= ${twelveMonthsAgo}
      GROUP BY month, provider
      ORDER BY month ASC
    `,
    prisma.user.count({ where: { disabledAt: { not: null } } }),
  ]);

  const mrrCents = activeSubscriptions.reduce((sum: number, s: { plan: { priceCents: number; intervalDays: number } }) => {
    const normalized = (s.plan.priceCents / s.plan.intervalDays) * 30;
    return sum + normalized;
  }, 0);

  const activeCount = statusBreakdown
    .filter((r: { status: string }) => r.status === "ACTIVE" || r.status === "TRIALING")
    .reduce((sum: number, r: { _count: { _all: number } }) => sum + r._count._all, 0);
  const churnRate30d =
    activeCount + canceledLast30d > 0 ? (canceledLast30d / (activeCount + canceledLast30d)) * 100 : 0;

  const planIds = planPopularity.map((p: { planId: string }) => p.planId);
  const plans = planIds.length
    ? await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } })
    : [];
  const planNameById = new Map(plans.map((p: { id: string; name: string }) => [p.id, p.name]));

  // Reshape the raw monthly rows into one entry per month with a column per
  // provider, so the chart can just read `.stripe` / `.fedapay` directly.
  const monthlyBuckets = new Map<string, { month: string; stripe: number; fedapay: number }>();
  for (const row of monthlyRevenueRaw) {
    const key = new Date(row.month).toISOString().slice(0, 7); // "YYYY-MM"
    const bucket = monthlyBuckets.get(key) ?? { month: key, stripe: 0, fedapay: 0 };
    const cents = Number(row.total_cents);
    if (row.provider === "STRIPE") bucket.stripe += cents;
    else bucket.fedapay += cents;
    monthlyBuckets.set(key, bucket);
  }
  const revenueTrend12m = Array.from(monthlyBuckets.values()).sort((a, b) => a.month.localeCompare(b.month));

  return NextResponse.json({
    totalUsers,
    newSignups30d,
    disabledUsersCount,
    revenueCents30d: revenue30d._sum.amountCents ?? 0,
    revenueCentsAllTime: revenueAllTime._sum.amountCents ?? 0,
    mrrCents: Math.round(mrrCents),
    churnRate30d: Math.round(churnRate30d * 10) / 10,
    canceledLast30d,
    revenueByProvider30d: revenueByProvider30d.map((r: { provider: string; _sum: { amountCents: number | null } }) => ({
      provider: r.provider,
      amountCents: r._sum.amountCents ?? 0,
    })),
    revenueTrend12m,
    subscriptionsByStatus: statusBreakdown.map((row: { status: string; _count: { _all: number } }) => ({
      status: row.status,
      count: row._count._all,
    })),
    planPopularity: planPopularity.map((p: { planId: string; _count: { _all: number } }) => ({
      planId: p.planId,
      planName: planNameById.get(p.planId) ?? "—",
      count: p._count._all,
    })),
    expiringSoon: expiringSoon.map((s: (typeof expiringSoon)[number]) => ({
      id: s.id,
      currentPeriodEnd: s.currentPeriodEnd,
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      paymentProvider: s.paymentProvider,
      user: s.user,
      plan: s.plan,
    })),
    recentSignups,
  });
}
