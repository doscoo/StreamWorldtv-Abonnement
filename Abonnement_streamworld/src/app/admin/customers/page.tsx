"use client";

import { useEffect, useState } from "react";

type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string | null;
  role: string;
  disabledAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  subscription: {
    status: string;
    paymentProvider: string;
    currentPeriodEnd: string;
    plan: { name: string; priceCents: number; currency: string };
  } | null;
};

const STATUS_OPTIONS = ["", "TRIALING", "PENDING_PAYMENT", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED", "NONE"];
const ROLE_OPTIONS = ["", "OWNER", "ADMIN", "SUPPORT", "CUSTOMER"];

export default function AdminCustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [disabled, setDisabled] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  function buildQuery(pageOverride?: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    if (disabled) params.set("disabled", disabled);
    params.set("page", String(pageOverride ?? page));
    params.set("pageSize", "25");
    return params.toString();
  }

  async function load(pageOverride?: number) {
    setLoading(true);
    const res = await fetch(`/api/admin/customers?${buildQuery(pageOverride)}`);
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRows(data.users);
    setTotal(data.total);
    setTotalPages(data.totalPages);
    setLoading(false);
  }

  useEffect(() => {
    load(1);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role, status, disabled]);

  useEffect(() => {
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (forbidden) {
    return (
      <div className="min-h-screen bg-ink text-white font-sans flex items-center justify-center">
        Accès réservé aux administrateurs.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-white font-sans p-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl">Clients</h1>
          <p className="text-muted text-sm mt-1">{total} client{total > 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-3">
          <a href="/dashboard" className="text-sm text-muted hover:text-white">← Tableau de bord</a>
          <a href={`/api/admin/customers?${buildQuery()}&format=csv`} className="text-sm text-accent hover:underline">
            Exporter (CSV)
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher nom ou email…"
          className="bg-panel border border-line rounded-md px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-panel border border-line rounded-md px-3 py-2 text-sm">
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r || "Tous les rôles"}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-panel border border-line rounded-md px-3 py-2 text-sm">
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === "NONE" ? "Sans abonnement" : s || "Tous les statuts"}</option>
          ))}
        </select>
        <select value={disabled} onChange={(e) => setDisabled(e.target.value)} className="bg-panel border border-line rounded-md px-3 py-2 text-sm">
          <option value="">Actifs et désactivés</option>
          <option value="false">Comptes actifs</option>
          <option value="true">Comptes désactivés</option>
        </select>
      </div>

      <div className="bg-panel border border-line rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted text-left">
            <tr>
              <th className="py-3 px-4">Client</th>
              <th>Rôle</th>
              <th>Abonnement</th>
              <th>Fournisseur</th>
              <th>Échéance</th>
              <th>Statut compte</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td className="py-4 px-4 text-muted" colSpan={6}>Chargement…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="py-4 px-4 text-muted" colSpan={6}>Aucun client ne correspond à ces filtres.</td></tr>
            )}
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-line hover:bg-ink/40">
                <td className="py-3 px-4">
                  <a href={`/admin/customers/${u.id}`} className="hover:underline font-medium">
                    {u.firstName} {u.lastName}
                  </a>
                  <div className="text-muted text-xs">{u.email}</div>
                </td>
                <td>{u.role}</td>
                <td>{u.subscription ? `${u.subscription.plan.name} (${u.subscription.status})` : "—"}</td>
                <td>{u.subscription?.paymentProvider ?? "—"}</td>
                <td>{u.subscription ? new Date(u.subscription.currentPeriodEnd).toLocaleDateString("fr-FR") : "—"}</td>
                <td>
                  {u.disabledAt ? (
                    <span className="text-danger">Désactivé</span>
                  ) : (
                    <span className="text-accent2">Actif</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded-md border border-line text-sm disabled:opacity-40"
          >
            ← Précédent
          </button>
          <span className="text-muted text-sm px-2 py-1">Page {page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded-md border border-line text-sm disabled:opacity-40"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  );
}
