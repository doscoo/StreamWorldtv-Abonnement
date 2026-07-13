import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRefreshToken, signAccessToken } from "@/lib/auth";
import { REFRESH_COOKIE, setAuthCookies, clearAuthCookies } from "@/lib/session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const payload = verifyRefreshToken(token);

    const session = await prisma.session.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revokedAt) {
      return clearAuthCookies(NextResponse.json({ error: "Session revoked" }, { status: 401 }));
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return clearAuthCookies(NextResponse.json({ error: "Not authenticated" }, { status: 401 }));
    }

    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    // Refresh token itself is left untouched (still 30-day sliding window
    // from original login) — only the short-lived access token is renewed.
    const res = NextResponse.json({ ok: true });
    return setAuthCookies(res, accessToken, token);
  } catch {
    return clearAuthCookies(NextResponse.json({ error: "Invalid or expired session" }, { status: 401 }));
  }
}
