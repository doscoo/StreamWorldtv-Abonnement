import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
});

import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTwoFactorSecret,
  verifyTwoFactorToken,
} from "@/lib/auth";
import { authenticator } from "otplib";

describe("passwords", () => {
  it("hashes a password and verifies it correctly", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});

describe("access/refresh tokens", () => {
  it("round-trips an access token payload", () => {
    const token = signAccessToken({ sub: "user_1", role: "CUSTOMER" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user_1");
    expect(payload.role).toBe("CUSTOMER");
  });

  it("round-trips a refresh token payload", () => {
    const token = signRefreshToken({ sub: "user_1", sessionId: "session_1" });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe("user_1");
    expect(payload.sessionId).toBe("session_1");
  });

  it("throws on a tampered token", () => {
    const token = signAccessToken({ sub: "user_1", role: "CUSTOMER" });
    expect(() => verifyAccessToken(token + "tampered")).toThrow();
  });

  it("does not verify an access token as a refresh token (different secrets)", () => {
    const token = signAccessToken({ sub: "user_1", role: "CUSTOMER" });
    expect(() => verifyRefreshToken(token)).toThrow();
  });
});

describe("two-factor authentication", () => {
  it("generates a secret and a matching otpauth URL", () => {
    const { secret, otpauthUrl } = generateTwoFactorSecret("alice@example.com");
    expect(secret).toBeTruthy();
    expect(otpauthUrl).toContain(encodeURIComponent("alice@example.com"));
    expect(otpauthUrl.startsWith("otpauth://")).toBe(true);
  });

  it("accepts a currently valid TOTP code", () => {
    const { secret } = generateTwoFactorSecret("alice@example.com");
    const validToken = authenticator.generate(secret);
    expect(verifyTwoFactorToken(validToken, secret)).toBe(true);
  });

  it("rejects an invalid TOTP code", () => {
    const { secret } = generateTwoFactorSecret("alice@example.com");
    expect(verifyTwoFactorToken("000000", secret)).toBe(false);
  });

  it("rejects malformed input instead of throwing", () => {
    const { secret } = generateTwoFactorSecret("alice@example.com");
    expect(verifyTwoFactorToken("not-a-code", secret)).toBe(false);
  });
});
