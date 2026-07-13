"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * FedaPay redirects the customer's browser here after they approve (or
 * cancel) the Mobile Money payment on FedaPay's hosted page. The actual
 * activation happens server-to-server via /api/billing/fedapay/webhook —
 * this page never trusts its own query string, it just re-fetches the
 * subscription list so the customer sees the real, confirmed state instead
 * of us guessing from a redirect parameter that could be spoofed.
 */
export default function PaymentReturnPage() {
  const [status, setStatus] = useState<"checking" | "active" | "pending">("checking");

  useEffect(() => {
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const res = await fetch("/api/subscriptions");
        if (res.ok) {
          const data = await res.json();
          const hasActive = data.subscriptions?.some(
            (s: { status: string }) => s.status === "ACTIVE" || s.status === "TRIALING"
          );
          if (hasActive) {
            setStatus("active");
            return;
          }
        }
      } catch {
        // ignore and retry
      }
      if (attempts < 5) {
        setTimeout(poll, 2000);
      } else {
        setStatus("pending");
      }
    };
    poll();
  }, []);

  return (
    <div className="min-h-screen bg-ink text-white font-sans flex items-center justify-center p-8">
      <div className="max-w-md text-center bg-panel border border-line rounded-lg p-8">
        {status === "checking" && (
          <>
            <h1 className="font-display text-2xl mb-3">Vérification du paiement…</h1>
            <p className="text-muted">
              Nous confirmons votre paiement Mobile Money avec FedaPay. Cela prend
              généralement quelques secondes.
            </p>
          </>
        )}
        {status === "active" && (
          <>
            <h1 className="font-display text-2xl mb-3 text-accent2">Paiement confirmé 🎉</h1>
            <p className="text-muted mb-6">Votre abonnement est actif.</p>
            <Link href="/dashboard" className="bg-accent text-white rounded-md px-5 py-2.5 font-semibold inline-block">
              Aller au tableau de bord
            </Link>
          </>
        )}
        {status === "pending" && (
          <>
            <h1 className="font-display text-2xl mb-3">Paiement en attente</h1>
            <p className="text-muted mb-6">
              Si vous avez approuvé le paiement sur votre téléphone, il sera confirmé dans
              quelques instants. Sinon, vous pouvez réessayer depuis votre compte.
            </p>
            <Link href="/account" className="bg-accent text-white rounded-md px-5 py-2.5 font-semibold inline-block">
              Voir mon compte
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
