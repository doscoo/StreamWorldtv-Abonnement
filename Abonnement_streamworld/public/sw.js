// Minimal service worker — just enough for "Add to Home Screen" / install
// prompts to qualify the app as a PWA, plus a small offline fallback.
//
// Deliberately does NOT cache anything under /api/* (auth, billing,
// webhooks, account data): that content is per-user, sensitive, and often
// mutates server-side, so serving a stale cached copy would be actively
// wrong. Only the static app shell is cached.

const CACHE_NAME = "subscriber-portal-shell-v1";
const OFFLINE_URL = "/offline.html";

const APP_SHELL = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept API calls or non-GET requests — always go straight to
  // the network so auth/billing/account data is never served from cache.
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) {
    return;
  }

  // Navigations (page loads): network first, offline fallback page if the
  // network is unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets (icons, manifest, _next/static/*): cache first, then
  // network, and stash a copy for next time.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
