import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/** Minimal "who am I" endpoint for account-page UI (name, email, 2FA status). */
export async function GET(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: caller.sub },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      twoFactorEnabled: true,
      createdAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json({ user });
}
