/**
 * Resolves the public base URL of this app for redirect links: Stripe
 * Checkout success/cancel, FedaPay's post-payment callback, and the links
 * sent in renewal-reminder emails.
 *
 * WHY THIS FILE EXISTS (read before touching APP_URL):
 * -----------------------------------------------------------------------
 * Vercel gives every single deployment its own unique, permanent URL, e.g.
 *   subscriber-portal-git-a1b2c3d-yourteam.vercel.app        (a preview build)
 *   subscriber-portal-oiu29fj2k.vercel.app                    (another one)
 * These are NOT the same as your project's stable production domain
 *   subscriber-portal.vercel.app  /  app.yourdomain.com
 *
 * If `APP_URL` in your Vercel project's Environment Variables was ever set
 * by copy-pasting one of those deployment-specific URLs from the browser's
 * address bar, it will keep working for a while — until that particular
 * deployment is superseded (every `git push` creates a new one) or pruned.
 * At that point Vercel serves its platform-level
 *   404: NOT_FOUND — Code: DEPLOYMENT_NOT_FOUND
 * page for that stale URL. That is exactly the screenshot behind this fix:
 * Stripe/FedaPay redirected the customer back to an `APP_URL` that pointed
 * at a deployment which no longer exists.
 *
 * FIX: set `APP_URL` to your **stable** domain — either a custom domain
 * (https://app.yourdomain.com) or your project's permanent production
 * alias (https://your-project.vercel.app, found under Vercel → Project →
 * Settings → Domains — the one WITHOUT a git hash or random suffix).
 * Never paste a URL from a specific "Visit" button on a deployment/preview.
 *
 * As a safety net, if `APP_URL` is missing entirely we fall back to
 * Vercel's own `VERCEL_PROJECT_PRODUCTION_URL` — an env var Vercel sets
 * automatically and which always points at the current production
 * deployment, never a stale one.
 */
function looksLikeDeploymentSpecificUrl(url: string): boolean {
  // Matches Vercel's per-deployment hostnames, e.g. "foo-git-a1b2c3d-team.vercel.app"
  // or "foo-8f3k2j9d1.vercel.app" — a long random/hash segment before ".vercel.app".
  return /-([a-z0-9]{8,}|git-[a-f0-9]{6,})(-[a-z0-9-]+)?\.vercel\.app$/i.test(
    new URL(url).hostname
  );
}

let warned = false;

export function getAppUrl(): string {
  const explicit = process.env.APP_URL?.trim().replace(/\/+$/, "");

  if (explicit) {
    if (!warned && process.env.NODE_ENV === "production" && looksLikeDeploymentSpecificUrl(explicit)) {
      warned = true;
      console.warn(
        `[url] APP_URL ("${explicit}") looks like a deployment-specific Vercel URL, ` +
          "not your stable production domain. Every new deployment will make this " +
          "URL 404 (DEPLOYMENT_NOT_FOUND). Set APP_URL to your custom domain or your " +
          "project's permanent *.vercel.app alias in Vercel → Settings → Environment Variables."
      );
    }
    return explicit;
  }

  // Vercel-provided, always-current production domain (no scheme included).
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // Last resort for preview/dev deployments that never got APP_URL configured.
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}
