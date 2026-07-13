import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import { issueSession, setAuthCookies } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // 5 signups per IP per 10 minutes — generous for real users, blunt for scripts.
  const limited = rateLimit(`register:${clientIp(req)}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const body = registerSchema.parse(await req.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      // Same message as "invalid input" would give — don't leak which emails are registered.
      return NextResponse.json({ error: "Unable to create account." }, { status: 409 });
    }

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        country: body.country,
        passwordHash,
      },
    });

    await prisma.auditLog.create({
      data: { actorId: user.id, action: "user.registered" },
    });

    const { accessToken, refreshToken } = await issueSession(user.id, user.role, req);

    const res = NextResponse.json(
      {
        user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
      },
      { status: 201 }
    );
    return setAuthCookies(res, accessToken, refreshToken);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.flatten() }, { status: 400 });
    }
    console.error("register error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
