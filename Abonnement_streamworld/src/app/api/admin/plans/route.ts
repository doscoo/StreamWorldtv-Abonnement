import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdminRole } from "@/lib/session";

const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  priceCents: z.number().int().positive(),
  currency: z.string().trim().toUpperCase().length(3).default("USD"),
  intervalDays: z.number().int().positive(),
  stripePriceId: z.string().trim().min(1).optional(),
  active: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plans = await prisma.plan.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ plans });
}

export async function POST(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller || !isAdminRole(caller.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = createPlanSchema.parse(await req.json());
    const plan = await prisma.plan.create({ data: body });

    await prisma.auditLog.create({
      data: { actorId: caller.sub, action: "plan.created", target: plan.id },
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.flatten() }, { status: 400 });
    }
    console.error("create plan error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
