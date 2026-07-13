import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyRefreshToken } from "@/lib/auth";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/session";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(REFRESH_COOKIE)?.value;

  if (token) {
    try {
      const { sessionId } = verifyRefreshToken(token);
      await prisma.session.update({
        where: { id: sessionId },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Expired/invalid token — nothing to revoke, just clear cookies below.
    }
  }

  return clearAuthCookies(NextResponse.json({ ok: true }));
}
