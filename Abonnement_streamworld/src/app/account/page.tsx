"use client";

import { useEffect, useState } from "react";

type Me = {
  firstName: string;
  lastName: string;
  email: string;
  twoFactorEnabled: boolean;
};

type Invoice = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: string;
  paidAt: string | null;
};

type Subscription = {
  id: string;
  status: string;
  paymentProvider: "STRIPE" | "FEDAPAY";
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  plan: { name: string; priceCents: number; currency: string };
  invoices: Invoice[];
};

export default function AccountPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [meRes, subsRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/subscriptions")]);
      if (!meRes.ok || !subsRes.ok) {
        setError("Veuillez vous connecter pour accéder à votre compte.");
        return;
      }
      const meData = await meRes.json();
      const subsData = await subsRes.json();
      setMe(meData.user);
      setSubscriptions(subsData.subscriptions);
    } catch {
      setError("Impossible de charger votre compte pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleCancel(sub: Subscription) {
    setBusyId(sub.id);
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Impossible d'annuler l'abonnement.");
        return;
      }
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  async function handleReactivate(sub: Subscription) {
    setBusyId(sub.id);
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/cancel`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Impossible de réactiver l'abonnement.");
        return;
      }
      await loadAll();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Centered>Chargement…</Centered>;
  if (error) return <Centered>{error}</Centered>;

  return (
    <div className="min-h-screen bg-ink text-white font-sans p-8 max-w-3xl mx-auto">
      <h1 className="font-display text-3xl mb-8">Mon compte</h1>

      {me && (
        <section className="bg-panel border border-line rounded-lg p-4 mb-8">
          <h2 className="text-muted text-sm mb-2">Profil</h2>
          <p className="font-semibold">{me.firstName} {me.lastName}</p>
          <p className="text-muted text-sm">{me.email}</p>
        </section>
      )}

      <section className="mb-8">
        <h2 className="font-display text-xl mb-4">Abonnements & factures</h2>
        {subscriptions.length === 0 && <p className="text-muted">Aucun abonnement pour le moment.</p>}
        <div className="grid gap-4">
          {subscriptions.map((s) => (
            <div key={s.id} className="bg-panel border border-line rounded-lg p-4">
              <div className="flex justify-between items-start flex-wrap gap-2">
                <div>
                  <p className="font-semibold">{s.plan.name}</p>
                  <p className="text-muted text-sm mt-1">
                    {(s.plan.priceCents / (s.plan.currency.toUpperCase() === "XOF" ? 1 : 100)).toLocaleString("fr-FR")}{" "}
                    {s.plan.currency} — {s.paymentProvider === "STRIPE" ? "Carte (Stripe)" : "Mobile Money (FedaPay)"}
                  </p>
                  <p className="text-muted text-sm">
                    {s.cancelAtPeriodEnd ? "Se termine" : "Renouvellement"} le{" "}
                    {new Date(s.currentPeriodEnd).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <StatusBadge status={s.status} cancelAtPeriodEnd={s.cancelAtPeriodEnd} />
              </div>

              <div className="mt-3 flex gap-2">
                {(s.status === "ACTIVE" || s.status === "TRIALING") && !s.cancelAtPeriodEnd && (
                  <button
                    onClick={() => handleCancel(s)}
                    disabled={busyId === s.id}
                    className="text-sm px-3 py-1.5 rounded-md bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 disabled:opacity-50"
                  >
                    {busyId === s.id ? "…" : "Annuler l'abonnement"}
                  </button>
                )}
                {(s.status === "ACTIVE" || s.status === "TRIALING") && s.cancelAtPeriodEnd && (
                  <button
                    onClick={() => handleReactivate(s)}
                    disabled={busyId === s.id}
                    className="text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50"
                  >
                    {busyId === s.id ? "…" : "Annuler la résiliation"}
                  </button>
                )}
              </div>

              {s.invoices.length > 0 && (
                <table className="w-full text-sm mt-4">
                  <thead className="text-muted text-left">
                    <tr>
                      <th className="py-1">Date</th>
                      <th>Montant</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.invoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-line">
                        <td className="py-1">{new Date(inv.issuedAt).toLocaleDateString("fr-FR")}</td>
                        <td>
                          {(inv.amountCents / (inv.currency.toUpperCase() === "XOF" ? 1 : 100)).toLocaleString("fr-FR")}{" "}
                          {inv.currency}
                        </td>
                        <td>{inv.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </section>

      <TwoFactorSection enabled={me?.twoFactorEnabled ?? false} onChange={loadAll} />
    </div>
  );
}

function StatusBadge({ status, cancelAtPeriodEnd }: { status: string; cancelAtPeriodEnd: boolean }) {
  const label = cancelAtPeriodEnd && status !== "CANCELED" ? "Résiliation prévue" : status;
  const color =
    status === "ACTIVE" && !cancelAtPeriodEnd
      ? "text-accent2 border-accent2/30 bg-accent2/10"
      : status === "PAST_DUE" || cancelAtPeriodEnd
        ? "text-warn border-warn/30 bg-warn/10"
        : status === "CANCELED" || status === "EXPIRED"
          ? "text-danger border-danger/30 bg-danger/10"
          : "text-muted border-line bg-white/5";
  return <span className={`text-xs px-2 py-1 rounded-md border ${color}`}>{label}</span>;
}

function TwoFactorSection({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const [step, setStep] = useState<"idle" | "enrolling">("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function startEnroll() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/2fa", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur lors de l'activation.");
        return;
      }
      setQrDataUrl(data.qrDataUrl);
      setStep("enrolling");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/2fa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Code invalide.");
        return;
      }
      setStep("idle");
      setQrDataUrl(null);
      setToken("");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      await fetch("/api/auth/2fa", { method: "DELETE" });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-panel border border-line rounded-lg p-4">
      <h2 className="font-display text-xl mb-2">Authentification à deux facteurs</h2>
      <p className="text-muted text-sm mb-3">
        {enabled
          ? "La 2FA est activée sur votre compte."
          : "Ajoutez une couche de sécurité supplémentaire avec une application d'authentification (Google Authenticator, Authy…)."}
      </p>

      {message && <p className="text-danger text-sm mb-2">{message}</p>}

      {enabled ? (
        <button
          onClick={disable}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded-md bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 disabled:opacity-50"
        >
          Désactiver la 2FA
        </button>
      ) : step === "idle" ? (
        <button
          onClick={startEnroll}
          disabled={busy}
          className="text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50"
        >
          Activer la 2FA
        </button>
      ) : (
        <div className="flex flex-col gap-3 items-start">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code 2FA" className="w-40 h-40 rounded-md bg-white p-2" />
          )}
          <p className="text-muted text-sm">Scannez le QR code puis saisissez le code à 6 chiffres.</p>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            maxLength={6}
            placeholder="123456"
            className="bg-ink border border-line rounded-md px-3 py-1.5 text-sm w-32 tracking-widest"
          />
          <button
            onClick={confirmEnroll}
            disabled={busy || token.length !== 6}
            className="text-sm px-3 py-1.5 rounded-md bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 disabled:opacity-50"
          >
            Confirmer
          </button>
        </div>
      )}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-white font-sans flex items-center justify-center">{children}</div>
  );
}
