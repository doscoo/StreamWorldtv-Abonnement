import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdminRole } from "@/lib/session";

const updatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable(),
    priceCents: z.number().int().positive(),
    currency: z.string().trim().toUpperCase().length(3),
    intervalDays: z.number().int().positive(),
    stripePriceId: z.string().trim().min(1).nullable(),
    active: z.boolean(),
  })
  .partial();

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const data = updatePlanSchema.parse(await req.json());
    const plan = await prisma.plan.update({ where: { id: params.id }, data });

    await prisma.auditLog.create({
      data: { actorId: caller.sub, action: "plan.updated", target: plan.id, metadata: data },
    });

    return NextResponse.json({ plan });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.flatten() }, { status: 400 });
    }
    console.error("update plan error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Plans are never hard-deleted — existing subscriptions/invoices reference
// them by id (see prisma/schema.prisma), so deleting would either violate
// the FK constraint or orphan billing history. "Delete" here just
// deactivates the plan so it drops off the pricing page.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plan = await prisma.plan.update({ where: { id: params.id }, data: { active: false } });

  await prisma.auditLog.create({
    data: { actorId: caller.sub, action: "plan.deactivated", target: plan.id },
  });

  return NextResponse.json({ plan });
}
