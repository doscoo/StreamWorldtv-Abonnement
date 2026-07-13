import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Read lazily (not at module load) so a missing var only breaks the request
// that actually needs it, instead of crashing the whole server on boot.
const getAccessSecret = () => requireEnv("JWT_ACCESS_SECRET");
const getRefreshSecret = () => requireEnv("JWT_REFRESH_SECRET");

export type AccessTokenPayload = { sub: string; role: string };
export type RefreshTokenPayload = { sub: string; sessionId: string };

// --- Passwords ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// --- JWT access/refresh tokens ---
// Access token: short-lived, sent on every request (Authorization header or cookie).
// Refresh token: long-lived, tied to a specific Session row so it can be revoked.

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getAccessSecret(), { expiresIn: "15m" });
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, getRefreshSecret()) as RefreshTokenPayload;
}

// --- Two-factor authentication (TOTP, e.g. Google Authenticator, Authy) ---

export function generateTwoFactorSecret(email: string) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(email, "Subscriber Portal", secret);
  return { secret, otpauthUrl };
}

export function verifyTwoFactorToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    // otplib throws on malformed input (e.g. non-numeric token) — treat as invalid.
    return false;
  }
}
