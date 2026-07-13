import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdminRole } from "@/lib/session";
import { toCsv, csvResponse } from "@/lib/csv";

/**
 * Standalone CSV exports for subscriptions and invoices/revenue.
 * (The customer list export lives on /api/admin/customers?format=csv since
 * it needs to share that endpoint's search/filter logic.)
 */
export async function GET(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type");
  const today = new Date().toISOString().slice(0, 10);

  if (type === "subscriptions") {
    const subs = await prisma.subscription.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        plan: { select: { name: true, priceCents: true, currency: true } },
      },
    });
    const csv = toCsv(
      subs.map((s: (typeof subs)[number]) => ({
        id: s.id,
        client: `${s.user.firstName} ${s.user.lastName}`,
        email: s.user.email,
        plan: s.plan.name,
        montant: (s.plan.priceCents / 100).toFixed(2),
        devise: s.plan.currency,
        statut: s.status,
        fournisseur: s.paymentProvider,
        annulation_prevue: s.cancelAtPeriodEnd ? "oui" : "non",
        periode_debut: s.currentPeriodStart,
        periode_fin: s.currentPeriodEnd,
        cree_le: s.createdAt,
      })),
      [
        "id",
        "client",
        "email",
        "plan",
        "montant",
        "devise",
        "statut",
        "fournisseur",
        "annulation_prevue",
        "periode_debut",
        "periode_fin",
        "cree_le",
      ]
    );
    await prisma.auditLog.create({ data: { actorId: caller.sub, action: "admin.export", target: "subscriptions" } });
    return csvResponse(`abonnements-${today}.csv`, csv);
  }

  if (type === "invoices") {
    const invoices = await prisma.invoice.findMany({
      orderBy: { issuedAt: "desc" },
      include: {
        subscription: {
          select: {
            user: { select: { firstName: true, lastName: true, email: true } },
            plan: { select: { name: true } },
          },
        },
      },
    });
    const csv = toCsv(
      invoices.map((i: (typeof invoices)[number]) => ({
        id: i.id,
        client: `${i.subscription.user.firstName} ${i.subscription.user.lastName}`,
        email: i.subscription.user.email,
        plan: i.subscription.plan.name,
        montant: (i.amountCents / 100).toFixed(2),
        devise: i.currency,
        statut: i.status,
        fournisseur: i.provider,
        emise_le: i.issuedAt,
        payee_le: i.paidAt ?? "",
      })),
      ["id", "client", "email", "plan", "montant", "devise", "statut", "fournisseur", "emise_le", "payee_le"]
    );
    await prisma.auditLog.create({ data: { actorId: caller.sub, action: "admin.export", target: "invoices" } });
    return csvResponse(`factures-${today}.csv`, csv);
  }

  return NextResponse.json({ error: "type must be 'subscriptions' or 'invoices' (use /api/admin/customers?format=csv for clients)" }, { status: 400 });
}
