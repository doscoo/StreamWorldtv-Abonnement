import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdminRole } from "@/lib/session";

/** Full detail view for one customer: profile, subscriptions, invoices, login sessions, audit trail. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
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
      twoFactorEnabled: true,
      lastLoginAt: true,
      lastLoginIp: true,
      createdAt: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        include: {
          plan: { select: { name: true, priceCents: true, currency: true, intervalDays: true } },
          invoices: { orderBy: { issuedAt: "desc" }, take: 20 },
        },
      },
      sessions: {
        orderBy: { lastSeenAt: "desc" },
        take: 10,
        select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true, revokedAt: true },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const auditLogs = await prisma.auditLog.findMany({
    where: { OR: [{ actorId: user.id }, { target: user.id }] },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return NextResponse.json({ user, auditLogs });
}

const updateSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "SUPPORT", "CUSTOMER"]).optional(),
  disabled: z.boolean().optional(),
});

/**
 * Admin actions on a customer: change role, disable/enable the account.
 * Deliberately narrow — this is account administration, not a way to touch
 * billing state directly (that always flows through the payment-provider
 * webhooks or the existing /api/subscriptions/[id]/cancel endpoint).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (params.id === caller.sub) {
    return NextResponse.json(
      { error: "Vous ne pouvez pas modifier votre propre rôle ou vous désactiver vous-même." },
      { status: 400 }
    );
  }

  try {
    const body = updateSchema.parse(await req.json());

    // Only an OWNER can promote/demote to or from OWNER — prevents an ADMIN
    // from escalating themselves or another account to the top role.
    if (body.role === "OWNER" && caller.role !== "OWNER") {
      return NextResponse.json({ error: "Seul un propriétaire peut attribuer ce rôle." }, { status: 403 });
    }
    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { role: true } });
    if (target?.role === "OWNER" && caller.role !== "OWNER") {
      return NextResponse.json({ error: "Seul un propriétaire peut modifier ce compte." }, { status: 403 });
    }

    const data: { role?: typeof body.role; disabledAt?: Date | null } = {};
    if (body.role) data.role = body.role;
    if (body.disabled !== undefined) data.disabledAt = body.disabled ? new Date() : null;

    const user = await prisma.user.update({ where: { id: params.id }, data });

    // Disabling an account also revokes every active login session immediately,
    // instead of just blocking future logins while leaving existing ones live.
    if (body.disabled === true) {
      await prisma.session.updateMany({
        where: { userId: params.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        actorId: caller.sub,
        action: body.disabled !== undefined ? (body.disabled ? "user.disabled" : "user.enabled") : "user.role_changed",
        target: params.id,
        metadata: body,
      },
    });

    return NextResponse.json({
      user: { id: user.id, role: user.role, disabledAt: user.disabledAt },
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.flatten() }, { status: 400 });
    }
    console.error("update customer error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
