"use client";

import { useEffect } from "react";

/**
 * Registers the service worker so the browser can qualify this app as
 * installable (PWA). Renders nothing — purely a side-effect component.
 * Safe no-op in browsers without Service Worker support (e.g. some
 * in-app browsers) and during server-side rendering.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    });
  }, []);

  return null;
}
