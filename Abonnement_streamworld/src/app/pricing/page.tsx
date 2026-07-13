"use client";

import { useEffect, useState } from "react";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  intervalDays: number;
  providers: { stripe: boolean; fedapay: boolean };
};

function formatPrice(priceCents: number, currency: string): string {
  // XOF (FedaPay/UEMOA) has no minor unit — priceCents already holds whole francs.
  const amount = currency.toUpperCase() === "XOF" ? priceCents : priceCents / 100;
  return `${amount.toLocaleString("fr-FR")} ${currency.toUpperCase()}`;
}

function intervalLabel(days: number): string {
  if (days % 365 === 0) return days === 365 ? "/ an" : `/ ${days / 365} ans`;
  if (days % 30 === 0) return days === 30 ? "/ mois" : `/ ${days / 30} mois`;
  return `/ ${days} jours`;
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/plans");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPlans(data.plans);
      } catch {
        setError("Impossible de charger les offres pour le moment.");
      }
    })();
  }, []);

  async function subscribe(plan: Plan, provider: "STRIPE" | "FEDAPAY") {
    setBusyPlanId(`${plan.id}:${provider}`);
    setActionError(null);
    try {
      const endpoint = provider === "STRIPE" ? "/api/subscriptions" : "/api/billing/fedapay/create";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setActionError("Veuillez vous connecter pour vous abonner.");
        } else {
          setActionError(data.error ?? "Impossible de démarrer le paiement.");
        }
        return;
      }

      // Stripe returns `checkoutUrl`, FedaPay returns `paymentUrl` — either
      // way we hand off to the provider's own hosted, secure payment page.
      const redirectUrl: string | undefined = data.checkoutUrl ?? data.paymentUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        setActionError("Réponse inattendue du serveur.");
      }
    } catch {
      setActionError("Erreur réseau. Réessayez.");
    } finally {
      setBusyPlanId(null);
    }
  }

  return (
    <div className="min-h-screen bg-ink text-white font-sans p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="font-display text-3xl mb-2 text-center">Nos offres</h1>
        <p className="text-muted text-center mb-10">
          Paiement par carte (Stripe) ou Mobile Money (FedaPay) — annulable à tout moment.
        </p>

        {error && <p className="text-danger text-center">{error}</p>}
        {actionError && (
          <p className="text-danger text-center mb-6 bg-danger/10 border border-danger/30 rounded-md py-2 px-4">
            {actionError}
          </p>
        )}

        {!plans && !error && <p className="text-muted text-center">Chargement…</p>}

        {plans && plans.length === 0 && (
          <p className="text-muted text-center">Aucune offre n&apos;est disponible pour le moment.</p>
        )}

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans?.map((plan) => (
            <div key={plan.id} className="bg-panel border border-line rounded-lg p-6 flex flex-col">
              <h2 className="font-display text-xl mb-1">{plan.name}</h2>
              {plan.description && <p className="text-muted text-sm mb-4">{plan.description}</p>}
              <p className="text-3xl font-display mb-1">
                {formatPrice(plan.priceCents, plan.currency)}
              </p>
              <p className="text-muted text-sm mb-6">{intervalLabel(plan.intervalDays)}</p>

              <div className="mt-auto flex flex-col gap-2">
                {plan.providers.stripe && (
                  <button
                    onClick={() => subscribe(plan, "STRIPE")}
                    disabled={busyPlanId === `${plan.id}:STRIPE`}
                    className="bg-accent text-white rounded-md px-4 py-2.5 font-semibold disabled:opacity-50"
                  >
                    {busyPlanId === `${plan.id}:STRIPE` ? "…" : "Payer par carte"}
                  </button>
                )}
                {plan.providers.fedapay && (
                  <button
                    onClick={() => subscribe(plan, "FEDAPAY")}
                    disabled={busyPlanId === `${plan.id}:FEDAPAY`}
                    className="bg-white/5 text-white border border-line rounded-md px-4 py-2.5 font-semibold disabled:opacity-50"
                  >
                    {busyPlanId === `${plan.id}:FEDAPAY` ? "…" : "Payer par Mobile Money"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
