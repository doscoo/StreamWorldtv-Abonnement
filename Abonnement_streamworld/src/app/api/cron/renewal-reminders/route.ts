import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { sendRenewalReminderEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/url";

// How many days before currentPeriodEnd to warn the customer. Mainly useful
// for FedaPay subscriptions (see README — Mobile Money needs a manual
// renewal approval), but harmless as a heads-up for Stripe subs too.
const REMINDER_WINDOW_DAYS = 3;

/**
 * Meant to be called once a day by Vercel Cron (see vercel.json). Protected
 * by CRON_SECRET so it can't be triggered by anyone who finds the URL —
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const windowEnd = addDays(now, REMINDER_WINDOW_DAYS);

  const dueSoon = await prisma.subscription.findMany({
    where: {
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gte: now, lte: windowEnd },
    },
    include: { plan: true, user: true },
  });

  let sent = 0;
  let skipped = 0;

  for (const sub of dueSoon) {
    // Dedupe: don't re-send a reminder for the same billing period if the
    // cron runs more than once before currentPeriodEnd changes.
    const alreadySent = await prisma.notification.findFirst({
      where: {
        userId: sub.userId,
        template: "renewal_reminder",
        createdAt: { gte: sub.currentPeriodStart },
      },
    });
    if (alreadySent) {
      skipped += 1;
      continue;
    }

    try {
      const appUrl = getAppUrl();
      await sendRenewalReminderEmail(sub.user, sub.plan, sub.currentPeriodEnd, `${appUrl}/account`);

      await prisma.notification.create({
        data: {
          userId: sub.userId,
          channel: "EMAIL",
          template: "renewal_reminder",
          sentAt: new Date(),
        },
      });
      sent += 1;
    } catch (err) {
      console.error(`Renewal reminder failed for subscription ${sub.id}:`, err);
    }
  }

  return NextResponse.json({ checked: dueSoon.length, sent, skipped });
}
