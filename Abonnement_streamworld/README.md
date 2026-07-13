# Subscriber & Billing Portal

A production-shaped starting point for a **legitimate SaaS subscriber management platform**:
customer accounts, plan subscriptions billed through Stripe, an admin dashboard, 2FA,
session/security auditing, and role-based access.

## Stack

- Next.js 14 (App Router) + TypeScript
- Prisma + PostgreSQL
- Stripe (Checkout + webhooks) for billing
- JWT access/refresh tokens, bcrypt, TOTP 2FA (otplib)
- Tailwind CSS, Recharts for the dashboard

## What was fixed in this pass

The previous export only contained loose helper files (`auth.ts`, `stripe.ts`, `prisma.ts`,
one page) sitting at the project root — none of the API routes or the dashboard described
below actually existed yet, and `docker-compose.yml` referenced `build: .` with no
`Dockerfile` in the repo, so `docker compose up` could never have worked.

This pass:

- Moved everything into a real Next.js App Router layout (`src/app`, `src/lib`,
  `prisma/schema.prisma`) matching the `@/*` → `./src/*` path alias already in `tsconfig.json`.
- Implemented every route the README described but the repo was missing: register, login
  (+ 2FA), refresh/logout, 2FA enroll/confirm/disable, subscriptions (Stripe Checkout),
  Stripe webhook, all three FedaPay endpoints, admin stats.
- Added the missing `Dockerfile` (multi-stage, Next.js `standalone` output).
- Fixed `docker-compose.yml`: the app container was pointed at `DATABASE_URL=...@localhost...`,
  which doesn't resolve from inside a container — it now overrides it to `@db:5432` and waits
  for Postgres's healthcheck before starting.
- Added a basic in-memory rate limiter on `/api/auth/*` (see the note in
  `src/lib/rate-limit.ts` about upgrading it before running more than one instance).

## What's included

- `prisma/schema.prisma` — Users, Plans, Subscriptions, Invoices, Sessions, AuditLog, Notifications
- `POST /api/auth/register`, `POST /api/auth/login` — account creation & sign-in (with optional 2FA step)
- `POST /api/auth/refresh`, `POST /api/auth/logout` — token rotation and session revocation
- `POST/PUT/DELETE /api/auth/2fa` — TOTP enrollment (QR code), confirmation, disable
- `POST/GET /api/subscriptions` — start a Stripe Checkout session / list a user's subscriptions
- `POST /api/billing/webhook` — Stripe webhook that is the *source of truth* for subscription status
- `GET /api/admin/stats` — role-gated aggregate stats for the dashboard
- `/dashboard` — admin overview for staff (subscriber counts, status breakdown, recent signups),
  or "my subscription" view for customers
- `Dockerfile`, `docker-compose.yml`, `.env.example` — local dev with Postgres, or containerized

## Mobile Money via FedaPay

Alongside Stripe, subscriptions can be billed through
[FedaPay](https://www.fedapay.com) — Mobile Money (MTN, Moov, etc.) and card
payments across the UEMOA zone, settled to your own Mobile Money or bank
account a few business days later.

- `POST /api/billing/fedapay/create` — creates a FedaPay transaction + payment
  link for a plan, and a `Subscription` row in `PENDING_PAYMENT` status.
- `POST /api/billing/fedapay/renew` — generates the next period's payment link
  for an existing FedaPay subscription.
- `POST /api/billing/fedapay/webhook` — verifies `X-FEDAPAY-SIGNATURE` and, on
  `transaction.approved`, activates the subscription and (for renewals)
  extends `currentPeriodEnd`.

**Why there's a separate `/renew` endpoint:** unlike a card on file, Mobile
Money has no silent auto-debit — the customer approves each charge on their
phone with their Mobile Money PIN. So FedaPay-billed subscriptions aren't
"fire and forget" like Stripe's: you (or a cron job / reminder email) need to
call `/renew` before `currentPeriodEnd` and send the customer the resulting
payment link, e.g. via the `trial_ending_3d` / `expiration in 3 days`
notification templates already in the schema.

**Amounts:** FedaPay's `XOF` currency has no minor unit — store the whole
FCFA amount in `Plan.priceCents` for FedaPay-billed plans (e.g. `5000` = 5 000 F CFA),
not fractional cents like you would for Stripe/USD.

**Signature verification:** `src/app/api/billing/fedapay/webhook/route.ts` uses the
`fedapay` package's own `Webhook.constructEvent(rawBody, header, secret)` — confirmed against
that package's test suite to expect the `t=<timestamp>,v1=<signature>` header format `fedapay`
actually sends, rather than a hand-rolled guess at the signing scheme.

## What was added in this pass

Purely additive — no existing route, schema, or business logic was changed, only extended:

- **Transactional emails (Resend)** — `src/lib/email.ts` adds payment-confirmation,
  payment-failed, and renewal-reminder templates. Hooked in with a single import + call at
  the point each event is already handled: Stripe's `invoice.paid` / new `invoice.payment_failed`
  case in `src/app/api/billing/webhook/route.ts`, and FedaPay's `transaction.approved` in
  `src/app/api/billing/fedapay/webhook/route.ts`. Email failures are always caught and logged,
  never allowed to fail the webhook itself (so Stripe/FedaPay don't get stuck retrying an
  already-handled event).
- **Cancel / reactivate a subscription** — `POST` and `DELETE`
  `/api/subscriptions/[id]/cancel`. Always schedules cancellation at period end, never an
  immediate cutoff. For Stripe it only flips `cancel_at_period_end` on Stripe's side — the
  existing `customer.subscription.updated` webhook handler remains the sole source of truth
  for the DB row, matching the app's existing pattern. For FedaPay (no live subscription
  object to update) it sets the flag directly.
- **Customer account page** — `/account` (`src/app/account/page.tsx`) lists subscriptions
  and invoices, lets the customer cancel/reactivate, and enroll/confirm/disable 2FA using the
  *existing* `/api/auth/2fa` endpoints. Backed by one new minimal read-only endpoint,
  `GET /api/auth/me`. A "Gérer mon compte" link was added to `/dashboard`.
- **Renewal-reminder cron** — `GET /api/cron/renewal-reminders` finds subscriptions due
  within 3 days, emails the customer once per billing period (deduped via the existing
  `Notification` model), and is wired up in `vercel.json` to run daily via Vercel Cron.
  Protected by `CRON_SECRET` (see `.env.example`).
- **Vitest tests** — `tests/lib/auth.test.ts` (password hashing, JWT sign/verify, TOTP
  enrollment/verification) and `tests/api/*-webhook.test.ts` (Stripe + FedaPay webhooks:
  signature rejection, successful activation + email, and "an email failure doesn't fail the
  webhook"). Run with `npm test`. Stripe/FedaPay/Prisma/Resend are mocked — no network or DB
  needed.
- **CI/CD** — `.github/workflows/ci.yml` runs lint → tests → build on every push/PR, then
  deploys to Vercel on `main` (needs `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
  repo secrets). Added the missing `eslint` + `eslint-config-next` devDependencies and
  `.eslintrc.json` so `npm run lint` actually runs.
- **Installable app (PWA)** — the portal can now be installed to a phone's home screen /
  desktop like a native app, for faster access without opening a browser each time:
  - `public/manifest.json` + `public/icons/*` (192/512/maskable/apple-touch) describe the
    app, its icons, and its `/dashboard` start URL.
  - `public/sw.js` is a minimal service worker: it caches only the static app shell (icons,
    manifest, `_next/static/*`) and **never** anything under `/api/*` — auth, billing, and
    account data always go straight to the network, so nothing sensitive or stale is ever
    served from cache. `public/offline.html` is shown if a page navigation fails with no
    network.
  - `src/components/ServiceWorkerRegister.tsx` registers that service worker on load.
  - `src/components/InstallPrompt.tsx` shows a small "Installer l'application" banner: a
    real install button on Chrome/Edge/Android (via `beforeinstallprompt`), or a "Partager →
    Sur l'écran d'accueil" hint on iOS Safari (which has no install-prompt API). Dismissable
    for 14 days, and hidden entirely once the app is already running standalone.
  - `src/app/layout.tsx` gained a `manifest` link, theme color, and Apple web-app metadata —
    the two new components are mounted there so every page can be installed, not just one.

**Setup:**
1. Create a FedaPay account (sandbox first) and grab your secret/public keys
   from the dashboard.
2. In the dashboard's Webhooks section, add an endpoint pointing at
   `/api/billing/fedapay/webhook` and copy its signing secret into
   `FEDAPAY_WEBHOOK_SECRET`.
3. Fill in `FEDAPAY_SECRET_KEY`, `FEDAPAY_PUBLIC_KEY`, `FEDAPAY_ENV` in `.env`.

**Receiving directly to your own Mobile Money number, without an API:**
if you'd rather skip the integration entirely for now, FedaPay also supports
plain shareable payment links you generate by hand in the dashboard and send
to customers — no code required, same underlying settlement to your Mobile
Money account. The API above is only needed once you want it wired into your
subscription/renewal flow automatically.

## Getting started (local, no Docker)

```bash
cp .env.example .env        # fill in DB + Stripe/FedaPay + JWT secrets
npm install
npm run db:push             # create tables
npm run dev
```

Point your Stripe webhook at the webhook route while developing:

```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

## Getting started (Docker)

```bash
cp .env.example .env         # fill in Stripe/FedaPay + JWT secrets (DATABASE_URL is
                              # overridden by docker-compose.yml, no need to edit it)
docker compose up --build
docker compose exec app npx prisma db push   # first run only: create tables
```

The app is then reachable at `http://localhost:3000`.

## Design decisions worth knowing

- **Subscription status is never set from the client.** Only the Stripe webhook
  (`checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.paid`)
  or the verified FedaPay webhook writes `Subscription.status`. This avoids the classic
  bug/exploit of a client claiming "I paid" without the provider having actually confirmed it.
- **`Session` is a login-session record** (browser/device the user signed into *this app*
  with), shown to the user as "where you're signed in" and revocable — a standard account-
  security feature, not a content-access gate.
- **Passwords** are hashed with bcrypt (cost 12); **2FA** is standard TOTP compatible with
  any authenticator app (Google Authenticator, 1Password, Authy, etc.), and only becomes
  active after the user confirms a code from their app (`PUT /api/auth/2fa`) — not the
  moment a secret is generated — so a dropped request during setup can't half-lock an account.
- **Access/refresh tokens are httpOnly cookies**, not `localStorage`, to reduce XSS exposure;
  the access token is short-lived (15 min) and `/api/auth/refresh` rotates it using the
  refresh token, which is itself tied to a revocable `Session` row.

## Scope note

This starter deliberately does **not** include a "digital license key" system, per-content
device-fingerprint locking, or link/token generation gating access to third-party streamed
media — that combination of features is the standard architecture of pirate IPTV reseller
panels, and I won't build that regardless of framing. Everything above is aimed at a normal
SaaS product: sign up, pick a plan, pay, manage your account, admins see subscriber health.

## Next steps you'd likely want

- Email notifications (Resend is wired into `.env.example`; add the actual send calls in the
  webhook handlers for "subscription created", "payment failed", etc.)
- A dedicated account page (view/cancel subscription, invoice history, manage 2FA) — the
  2FA and subscription *APIs* exist now, but there's no UI for them yet beyond `/dashboard`
- Swap `src/lib/rate-limit.ts` for a Redis-backed limiter (Upstash Ratelimit) before running
  more than one server instance
- CI (GitHub Actions: lint, typecheck, `prisma migrate deploy`, deploy to Vercel)
- Tests for the auth and webhook routes (Vitest is already a devDependency)

## Fixed in this pass — Vercel "404 DEPLOYMENT_NOT_FOUND" after subscribing

**Root cause:** Stripe's `success_url`/`cancel_url` and FedaPay's `callback_url` were built
from `process.env.APP_URL` with no validation. Vercel gives *every* deployment (each preview,
each production push) its own unique `*.vercel.app` hostname — if `APP_URL` was ever set by
copy-pasting one of those from the browser's address bar instead of the project's stable
domain, it worked at first, then 404'd with Vercel's own `DEPLOYMENT_NOT_FOUND` page the
moment a newer deployment replaced that one. There was also no page actually able to
*start* a subscription from the UI, so testing meant hitting the API directly, landing on
whatever `APP_URL` happened to be after "payment".

**What changed:**

- `src/lib/url.ts` — new `getAppUrl()`: honors `APP_URL` if set, otherwise falls back to
  Vercel's own `VERCEL_PROJECT_PRODUCTION_URL` (always current, never stale), then
  `VERCEL_URL`, then `localhost`. In production, it also `console.warn`s if `APP_URL` matches
  the shape of a per-deployment Vercel hostname, so this class of bug surfaces in logs instead
  of silently breaking checkout redirects again later.
- Stripe checkout (`/api/subscriptions`) and the renewal-reminder cron now use `getAppUrl()`.
- FedaPay transactions (`/api/billing/fedapay/create` and `/renew`) now pass an explicit
  `callback_url` built from `getAppUrl()` at `Transaction.create()` time, instead of relying on
  whatever default redirect happens to be configured in the FedaPay dashboard.
- New `src/app/payment/return/page.tsx` — a real landing page for that FedaPay callback,
  polling `GET /api/subscriptions` (the actual source of truth) rather than trusting anything
  in the return URL's query string.
- **The pricing/checkout UI didn't exist at all** — `GET /api/subscriptions` (Stripe) and
  `POST /api/billing/fedapay/create` had no caller anywhere in the frontend. Added:
  - `GET /api/plans` (public) and `src/app/pricing/page.tsx` — an actual "pick a plan, pay by
    card or Mobile Money" page, wired from the homepage and the dashboard's empty state.
  - `GET/POST /api/admin/plans` and `PATCH/DELETE /api/admin/plans/[id]` (admin-only) to manage
    plans without touching Prisma Studio by hand.
  - `prisma/seed.ts` + `npm run db:seed` — sample plans so the flow is testable immediately.
    Set `SEED_STRIPE_PRICE_ID_PRO`/`SEED_STRIPE_PRICE_ID_BUSINESS` env vars to real Stripe
    Price ids to make the "Payer par carte" button work for those plans.

### Deployment checklist (Vercel)

1. Project → Settings → Environment Variables: set `APP_URL` to your **custom domain** or your
   project's **permanent** `*.vercel.app` alias — find it under Settings → Domains, it's the
   one with no git hash/random suffix. Do this for both Production and Preview if you use both.
2. Set every var from `.env.example` (DB, JWT secrets, Stripe, FedaPay, Resend, `CRON_SECRET`).
3. Stripe Dashboard → Webhooks: add an endpoint at `${APP_URL}/api/billing/webhook`, subscribed
   to `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`, `invoice.payment_failed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. FedaPay Dashboard → Webhooks: add an endpoint at `${APP_URL}/api/billing/fedapay/webhook`,
   copy the signing secret into `FEDAPAY_WEBHOOK_SECRET`.
5. `npx prisma migrate deploy` (or `db push` for a quick start) against the production
   `DATABASE_URL`, then `npm run db:seed` to create at least one plan.
6. Visit `/pricing` while logged in and actually run a test payment (Stripe test card
   `4242 4242 4242 4242`, or FedaPay sandbox mode) before trusting the flow end to end.
