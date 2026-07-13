import { afterEach, describe, expect, it, vi } from "vitest";

describe("getAppUrl", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("uses APP_URL when explicitly set, stripping trailing slashes", async () => {
    process.env.APP_URL = "https://app.example.com/";
    const { getAppUrl } = await import("../../src/lib/url");
    expect(getAppUrl()).toBe("https://app.example.com");
  });

  it("falls back to VERCEL_PROJECT_PRODUCTION_URL when APP_URL is unset", async () => {
    delete process.env.APP_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "subscriber-portal.vercel.app";
    const { getAppUrl } = await import("../../src/lib/url");
    expect(getAppUrl()).toBe("https://subscriber-portal.vercel.app");
  });

  it("falls back to VERCEL_URL as a last resort", async () => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = "subscriber-portal-git-abc123-team.vercel.app";
    const { getAppUrl } = await import("../../src/lib/url");
    expect(getAppUrl()).toBe("https://subscriber-portal-git-abc123-team.vercel.app");
  });

  it("defaults to localhost when nothing is set", async () => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    const { getAppUrl } = await import("../../src/lib/url");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("warns (but still returns it) when APP_URL looks like a stale deployment-specific URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_URL = "https://subscriber-portal-git-a1b2c3d-team.vercel.app";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getAppUrl } = await import("../../src/lib/url");
    const url = getAppUrl();
    expect(url).toBe("https://subscriber-portal-git-a1b2c3d-team.vercel.app");
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
