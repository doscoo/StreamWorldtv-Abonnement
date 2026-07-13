import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, verifyTwoFactorToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { issueSession, setAuthCookies } from "@/lib/session";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // 10 attempts per IP per 10 minutes — slows down credential stuffing without
  // locking out a user who just fat-fingered their password twice.
  const limited = rateLimit(`login:${clientIp(req)}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!limited.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  try {
    const body = loginSchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    const genericError = () => NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

    // Always run bcrypt.compare even when the user doesn't exist, against a
    // dummy hash, so responses take the same time either way (timing attack).
    const hashToCheck = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const passwordOk = await verifyPassword(body.password, hashToCheck);
    if (!user || !passwordOk) return genericError();

    if (user.disabledAt) {
      return NextResponse.json(
        { error: "Ce compte a été désactivé. Contactez le support." },
        { status: 403 }
      );
    }

    if (user.twoFactorEnabled) {
      if (!body.totpToken) {
        return NextResponse.json({ error: "totp_required" }, { status: 401 });
      }
      const validTotp = verifyTwoFactorToken(body.totpToken, user.twoFactorSecret ?? "");
      if (!validTotp) return NextResponse.json({ error: "Invalid authentication code." }, { status: 401 });
    }

    const { accessToken, refreshToken } = await issueSession(user.id, user.role, req);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      },
    });
    await prisma.auditLog.create({ data: { actorId: user.id, action: "user.login" } });

    const res = NextResponse.json({
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
    });
    return setAuthCookies(res, accessToken, refreshToken);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input", details: err.flatten() }, { status: 400 });
    }
    console.error("login error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
