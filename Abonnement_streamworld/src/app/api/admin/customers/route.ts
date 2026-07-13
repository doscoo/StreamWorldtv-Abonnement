import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdminRole } from "@/lib/session";
import { toCsv, csvResponse } from "@/lib/csv";

const querySchema = z.object({
  q: z.string().trim().max(160).optional(),
  role: z.enum(["OWNER", "ADMIN", "SUPPORT", "CUSTOMER"]).optional(),
  status: z.enum(["TRIALING", "PENDING_PAYMENT", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "NONE"]).optional(),
  disabled: z.enum(["true", "false"]).optional(),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  format: z.enum(["json", "csv"]).default("json"),
});

/**
 * Admin customer directory: searchable by name/email, filterable by role,
 * disabled state, and current subscription status, paginated. Each row
 * includes the customer's single most relevant subscription (most recently
 * updated) so the table doesn't need a second round-trip per customer.
 */
export async function GET(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }
  const { q, role, status, disabled, sort, page, pageSize, format } = parsed.data;

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (role) where.role = role;
  if (disabled === "true") where.disabledAt = { not: null };
  if (disabled === "false") where.disabledAt = null;
  if (status === "NONE") where.subscriptions = { none: {} };
  else if (status) where.subscriptions = { some: { status } };

  const orderBy =
    sort === "oldest" ? { createdAt: "asc" as const } : sort === "name" ? { firstName: "asc" as const } : { createdAt: "desc" as const };

  // CSV export ignores pagination — admins expect a full export of the
  // filtered set, not just the current page.
  const take = format === "csv" ? undefined : pageSize;
  const skip = format === "csv" ? undefined : (page - 1) * pageSize;

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      take,
      skip,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        country: true,
        city: true,
        role: true,
        disabledAt: true,
        lastLoginAt: true,
        createdAt: true,
        subscriptions: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            status: true,
            paymentProvider: true,
            currentPeriodEnd: true,
            plan: { select: { name: true, priceCents: true, currency: true } },
          },
        },
      },
    }),
  ]);

  type UserRow = (typeof users)[number];
  const rows = users.map((u: UserRow) => ({
    ...u,
    subscription: u.subscriptions[0] ?? null,
    subscriptions: undefined,
  }));

  if (format === "csv") {
    const csv = toCsv(
      rows.map((r: (typeof rows)[number]) => ({
        id: r.id,
        prenom: r.firstName,
        nom: r.lastName,
        email: r.email,
        telephone: r.phone ?? "",
        pays: r.country ?? "",
        role: r.role,
        desactive: r.disabledAt ? "oui" : "non",
        statut_abonnement: r.subscription?.status ?? "aucun",
        plan: r.subscription?.plan?.name ?? "",
        derniere_connexion: r.lastLoginAt ?? "",
        inscrit_le: r.createdAt,
      })),
      [
        "id",
        "prenom",
        "nom",
        "email",
        "telephone",
        "pays",
        "role",
        "desactive",
        "statut_abonnement",
        "plan",
        "derniere_connexion",
        "inscrit_le",
      ]
    );
    return csvResponse(`clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return NextResponse.json({ users: rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
}
