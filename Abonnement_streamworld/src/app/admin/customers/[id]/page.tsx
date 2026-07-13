"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  issuedAt: string;
  paidAt: string | null;
};

type Subscription = {
  id: string;
  status: string;
  paymentProvider: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  plan: { name: string; priceCents: number; currency: string; intervalDays: number };
  invoices: Invoice[];
};

type SessionRow = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

type AuditLogRow = {
  id: string;
  action: string;
  target: string | null;
  createdAt: string;
};

type CustomerDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  role: string;
  disabledAt: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  subscriptions: Subscription[];
  sessions: SessionRow[];
};

const ROLES = ["OWNER", "ADMIN", "SUPPORT", "CUSTOMER"];

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [user, setUser] = useState<CustomerDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/admin/customers/${id}`);
    if (!res.ok) {
      setError(res.status === 403 ? "Accès réservé aux administrateurs." : "Client introuvable.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setUser(data.user);
    setAuditLogs(data.auditLogs);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function updateUser(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action impossible.");
    } else {
      await load();
    }
    setBusy(false);
  }

  async function subscriptionAction(subId: string, action: "cancel" | "reactivate") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/subscriptions/${subId}/cancel`, {
      method: action === "cancel" ? "POST" : "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Action impossible.");
    } else {
      await load();
    }
    setBusy(false);
  }

  if (loading) {
    return <Centered>Chargement…</Centered>;
  }
  if (error && !user) {
    return <Centered>{error}</Centered>;
  }
  if (!user) return null;

  return (
    <div className="min-h-screen bg-ink text-white font-sans p-8 max-w-4xl mx-auto">
      <a href="/admin/customers" className="text-sm text-muted hover:text-white">← Tous les clients</a>

      <div className="flex flex-wrap justify-between items-start gap-4 mt-4 mb-6">
        <div>
          <h1 className="font-display text-3xl">{user.firstName} {user.lastName}</h1>
          <p className="text-muted text-sm mt-1">{user.email}</p>
          {user.phone && <p className="text-muted text-sm">{user.phone}</p>}
          <p className="text-muted text-sm">
            {[user.city, user.country].filter(Boolean).join(", ") || "Localisation inconnue"}
          </p>
        </div>
        <div className="text-right text-sm text-muted">
          <p>Inscrit le {new Date(user.createdAt).toLocaleDateString("fr-FR")}</p>
          <p>Dernière connexion : {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("fr-FR") : "jamais"}</p>
          <p>2FA : {user.twoFactorEnabled ? "activée" : "désactivée"}</p>
        </div>
      </div>

      {error && <div className="bg-danger/10 border border-danger text-danger rounded-md p-3 mb-6 text-sm">{error}</div>}

      <div className="bg-panel border border-line rounded-lg p-4 mb-6">
        <h2 className="text-muted mb-3">Administration du compte</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted">Rôle</label>
          <select
            disabled={busy}
            value={user.role}
            onChange={(e) => updateUser({ role: e.target.value })}
            className="bg-ink border border-line rounded-md px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          {user.disabledAt ? (
            <button
              disabled={busy}
              onClick={() => updateUser({ disabled: false })}
              className="px-3 py-2 rounded-md bg-accent2 text-ink text-sm font-medium disabled:opacity-50"
            >
              Réactiver le compte
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => updateUser({ disabled: true })}
              className="px-3 py-2 rounded-md bg-danger text-white text-sm font-medium disabled:opacity-50"
            >
              Désactiver le compte
            </button>
          )}
          {user.disabledAt && (
            <span className="text-muted text-xs">
              Désactivé le {new Date(user.disabledAt).toLocaleDateString("fr-FR")}
            </span>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-muted mb-3">Abonnements</h2>
        <div className="grid gap-3">
          {user.subscriptions.length === 0 && <p className="text-muted text-sm">Aucun abonnement.</p>}
          {user.subscriptions.map((s) => (
            <div key={s.id} className="bg-panel border border-line rounded-lg p-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <div>
                  <span className="font-semibold">{s.plan.name}</span>{" "}
                  <span className="text-muted text-sm">
                    — {(s.plan.priceCents / 100).toFixed(2)} {s.plan.currency} / {s.plan.intervalDays}j — {s.paymentProvider}
                  </span>
                </div>
                <span className="text-sm">{s.status}{s.cancelAtPeriodEnd ? " (annulation prévue)" : ""}</span>
              </div>
              <p className="text-muted text-xs mt-1">
                Période en cours : {new Date(s.currentPeriodStart).toLocaleDateString("fr-FR")} → {new Date(s.currentPeriodEnd).toLocaleDateString("fr-FR")}
              </p>
              {(s.status === "ACTIVE" || s.status === "TRIALING") && (
                <div className="mt-2">
                  {s.cancelAtPeriodEnd ? (
                    <button
                      disabled={busy}
                      onClick={() => subscriptionAction(s.id, "reactivate")}
                      className="text-sm text-accent hover:underline disabled:opacity-50"
                    >
                      Annuler la résiliation prévue
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => subscriptionAction(s.id, "cancel")}
                      className="text-sm text-danger hover:underline disabled:opacity-50"
                    >
                      Résilier à la fin de la période
                    </button>
                  )}
                </div>
              )}
              {s.invoices.length > 0 && (
                <table className="w-full text-xs mt-3">
                  <thead className="text-muted text-left">
                    <tr>
                      <th className="py-1">Montant</th>
                      <th>Statut</th>
                      <th>Émise le</th>
                      <th>Payée le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.invoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-line">
                        <td className="py-1">{(inv.amountCents / 100).toFixed(2)} {inv.currency}</td>
                        <td>{inv.status}</td>
                        <td>{new Date(inv.issuedAt).toLocaleDateString("fr-FR")}</td>
                        <td>{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-muted mb-3">Sessions de connexion</h2>
        <div className="bg-panel border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="py-2 px-4">Appareil</th>
                <th>IP</th>
                <th>Dernière activité</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {user.sessions.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-2 px-4 truncate max-w-xs">{s.userAgent ?? "—"}</td>
                  <td>{s.ipAddress ?? "—"}</td>
                  <td>{new Date(s.lastSeenAt).toLocaleString("fr-FR")}</td>
                  <td>{s.revokedAt ? "Révoquée" : "Active"}</td>
                </tr>
              ))}
              {user.sessions.length === 0 && (
                <tr><td className="py-2 px-4 text-muted" colSpan={4}>Aucune session enregistrée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-muted mb-3">Journal d&apos;activité</h2>
        <div className="bg-panel border border-line rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="py-2 px-4">Action</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-t border-line">
                  <td className="py-2 px-4">{log.action}</td>
                  <td>{new Date(log.createdAt).toLocaleString("fr-FR")}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr><td className="py-2 px-4 text-muted" colSpan={2}>Aucune entrée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-white font-sans flex items-center justify-center">
      {children}
    </div>
  );
}
