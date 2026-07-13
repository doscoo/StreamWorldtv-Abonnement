import { NextRequest, NextResponse } from "next/server";
import {
  verifyAccessToken,
  signAccessToken,
  signRefreshToken,
  type AccessTokenPayload,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const ACCESS_COOKIE = "sp_access";
export const REFRESH_COOKIE = "sp_refresh";

/**
 * Extracts and verifies the caller's identity from the access-token cookie.
 * Returns null if there's no valid session — callers decide whether that's
 * a 401 (protected route) or just "render as logged-out" (public page).
 */
export function getCurrentUser(req: NextRequest): AccessTokenPayload | null {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    return verifyAccessToken(token);
  } catch {
    return null; // expired or tampered — treat like "not logged in"
  }
}

const ADMIN_ROLES = new Set(["OWNER", "ADMIN", "SUPPORT"]);

export function isAdminRole(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

/**
 * Creates a Session row (the "where you're signed in" record) and mints a
 * matching access/refresh token pair. Used by both /register and /login so
 * the two flows can't drift out of sync.
 */
export async function issueSession(userId: string, role: string, req: NextRequest) {
  const session = await prisma.session.create({
    data: {
      userId,
      userAgent: req.headers.get("user-agent") ?? undefined,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    },
  });

  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, sessionId: session.id });

  return { session, accessToken, refreshToken };
}

/** Attaches httpOnly session cookies to an outgoing response. */
export function setAuthCookies(res: NextResponse, accessToken: string, refreshToken: string) {
  const secure = process.env.NODE_ENV === "production";

  res.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60, // 15 minutes, matches access-token expiry
  });

  res.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60, // 30 days, matches refresh-token expiry
  });

  return res;
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
