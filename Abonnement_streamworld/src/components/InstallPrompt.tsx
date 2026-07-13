"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "sp_install_prompt_dismissed_until";
const DISMISS_DAYS = 14;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Small "Installer l'application" banner.
 * - Chrome/Edge/Android: listens for `beforeinstallprompt`, shows a real
 *   install button.
 * - iOS Safari (no `beforeinstallprompt` support): shows a short "Partager
 *   → Sur l'écran d'accueil" hint instead, since that's the only way to
 *   install a PWA there.
 * - Hidden entirely once the app is already running standalone (installed),
 *   or for `DISMISS_DAYS` days after the person dismisses it.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"none" | "installable" | "ios">("none");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    if (isStandalone) return;

    const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() < dismissedUntil) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setPlatform("installable");
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // iOS never fires beforeinstallprompt — show the manual hint instead,
    // but only in Safari itself (in-app browsers can't add to home screen).
    if (isIos && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent)) {
      setPlatform("ios");
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  }

  if (!visible || platform === "none") return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-panel border border-line rounded-lg p-4 shadow-lg flex items-start gap-3">
        <div className="flex-1">
          <p className="text-white text-sm font-semibold mb-1">Installer l&apos;application</p>
          {platform === "installable" ? (
            <p className="text-muted text-xs">
              Ajoutez le portail à votre écran d&apos;accueil pour une gestion plus rapide de vos abonnements.
            </p>
          ) : (
            <p className="text-muted text-xs">
              Sur iPhone : appuyez sur <strong>Partager</strong> puis <strong>Sur l&apos;écran d&apos;accueil</strong>.
            </p>
          )}
          {platform === "installable" && (
            <button
              onClick={install}
              className="mt-3 text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20"
            >
              Installer
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Fermer"
          className="text-muted hover:text-white text-sm leading-none px-1"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
