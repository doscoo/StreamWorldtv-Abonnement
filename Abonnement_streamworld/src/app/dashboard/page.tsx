"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AdminStats = {
  totalUsers: number;
  newSignups30d: number;
  disabledUsersCount: number;
  revenueCents30d: number;
  revenueCentsAllTime: number;
  mrrCents: number;
  churnRate30d: number;
  canceledLast30d: number;
  revenueByProvider30d: { provider: string; amountCents: number }[];
  revenueTrend12m: { month: string; stripe: number; fedapay: number }[];
  subscriptionsByStatus: { status: string; count: number }[];
  planPopularity: { planId: string; planName: string; count: number }[];
  expiringSoon: {
    id: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    paymentProvider: string;
    user: { id: string; firstName: string; lastName: string; email: string };
    plan: { name: string; priceCents: number; currency: string };
  }[];
  recentSignups: { id: string; firstName: string; lastName: string; email: string; role: string; createdAt: string }[];
};

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

type MySubscription = {
  id: string;
  status: string;
  currentPeriodEnd: string;
  plan: { name: string; priceCents: number; currency: string };
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [subscriptions, setSubscriptions] = useState<MySubscription[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const adminRes = await fetch("/api/admin/stats");
      if (adminRes.ok) {
        setIsAdmin(true);
        setStats(await adminRes.json());
      } else if (adminRes.status === 403) {
        const subRes = await fetch("/api/subscriptions");
        if (subRes.ok) {
          const data = await subRes.json();
          setSubscriptions(data.subscriptions);
        } else {
          setError("Impossible de charger vos abonnements.");
        }
      } else {
        setError("Veuillez vous connecter pour accéder au tableau de bord.");
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <Centered>Chargement…</Centered>;
  }
  if (error) {
    return <Centered>{error}</Centered>;
  }

  if (isAdmin && stats) {
    return (
      <div className="min-h-screen bg-ink text-white font-sans p-8">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h1 className="font-display text-3xl">Tableau de bord</h1>
          <div className="flex gap-3">
            <a href="/admin/customers" className="text-sm text-accent hover:underline">
              Gérer les clients →
            </a>
            <a href="/api/admin/export?type=subscriptions" className="text-sm text-muted hover:text-white">
              Exporter abonnements (CSV)
            </a>
            <a href="/api/admin/export?type=invoices" className="text-sm text-muted hover:text-white">
              Exporter factures (CSV)
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard label="Utilisateurs" value={stats.totalUsers} />
          <StatCard label="Nouveaux (30j)" value={stats.newSignups30d} />
          <StatCard label="MRR" value={`${money(stats.mrrCents)}`} />
          <StatCard label="Revenus (30j)" value={money(stats.revenueCents30d)} />
          <StatCard label="Revenus (total)" value={money(stats.revenueCentsAllTime)} />
          <StatCard label="Churn (30j)" value={`${stats.churnRate30d}%`} accent={stats.churnRate30d > 10 ? "danger" : undefined} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="bg-panel border border-line rounded-lg p-4 h-72">
            <h2 className="text-muted mb-2">Revenus payés — 12 derniers mois</h2>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.revenueTrend12m}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232A34" />
                <XAxis dataKey="month" stroke="#8A94A6" />
                <YAxis stroke="#8A94A6" tickFormatter={(v) => `${(v / 100).toFixed(0)}`} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend />
                <Line type="monotone" dataKey="stripe" name="Stripe" stroke="#4F8CFF" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="fedapay" name="FedaPay" stroke="#7CE0C6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-panel border border-line rounded-lg p-4 h-72">
            <h2 className="text-muted mb-2">Abonnements par statut</h2>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.subscriptionsByStatus}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232A34" />
                <XAxis dataKey="status" stroke="#8A94A6" />
                <YAxis stroke="#8A94A6" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#4F8CFF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="bg-panel border border-line rounded-lg p-4">
            <h2 className="text-muted mb-2">Popularité des offres (actifs)</h2>
            <table className="w-full text-sm">
              <thead className="text-muted text-left">
                <tr>
                  <th className="py-2">Offre</th>
                  <th>Abonnés actifs</th>
                </tr>
              </thead>
              <tbody>
                {stats.planPopularity.map((p) => (
                  <tr key={p.planId} className="border-t border-line">
                    <td className="py-2">{p.planName}</td>
                    <td>{p.count}</td>
                  </tr>
                ))}
                {stats.planPopularity.length === 0 && (
                  <tr>
                    <td className="py-2 text-muted" colSpan={2}>Aucun abonné actif.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-panel border border-line rounded-lg p-4">
            <h2 className="text-muted mb-2">Revenus (30j) par mode de paiement</h2>
            <table className="w-full text-sm">
              <thead className="text-muted text-left">
                <tr>
                  <th className="py-2">Fournisseur</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
                {stats.revenueByProvider30d.map((r) => (
                  <tr key={r.provider} className="border-t border-line">
                    <td className="py-2">{r.provider}</td>
                    <td>{money(r.amountCents)}</td>
                  </tr>
                ))}
                {stats.revenueByProvider30d.length === 0 && (
                  <tr>
                    <td className="py-2 text-muted" colSpan={2}>Aucun paiement sur 30 jours.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-panel border border-line rounded-lg p-4 mb-8">
          <h2 className="text-muted mb-2">Abonnements arrivant à échéance (7 jours)</h2>
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="py-2">Client</th>
                <th>Offre</th>
                <th>Fournisseur</th>
                <th>Échéance</th>
                <th>Renouvellement</th>
              </tr>
            </thead>
            <tbody>
              {stats.expiringSoon.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-2">
                    <a href={`/admin/customers/${s.user.id}`} className="hover:underline">
                      {s.user.firstName} {s.user.lastName}
                    </a>
                  </td>
                  <td>{s.plan.name}</td>
                  <td>{s.paymentProvider}</td>
                  <td>{new Date(s.currentPeriodEnd).toLocaleDateString("fr-FR")}</td>
                  <td className={s.cancelAtPeriodEnd ? "text-danger" : "text-accent2"}>
                    {s.cancelAtPeriodEnd ? "Annulation prévue" : "Auto/à relancer"}
                  </td>
                </tr>
              ))}
              {stats.expiringSoon.length === 0 && (
                <tr>
                  <td className="py-2 text-muted" colSpan={5}>Rien à signaler dans les 7 prochains jours.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-panel border border-line rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-muted">Inscriptions récentes</h2>
            <a href="/admin/customers" className="text-sm text-accent hover:underline">Voir tous les clients →</a>
          </div>
          <table className="w-full text-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="py-2">Nom</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentSignups.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-2">
                    <a href={`/admin/customers/${u.id}`} className="hover:underline">
                      {u.firstName} {u.lastName}
                    </a>
                  </td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-white font-sans p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-3xl">Mon abonnement</h1>
        <a href="/account" className="text-sm text-accent hover:underline">
          Gérer mon compte →
        </a>
      </div>
      {subscriptions.length === 0 && (
        <div className="text-muted">
          Aucun abonnement pour le moment.{" "}
          <a href="/pricing" className="text-accent hover:underline">
            Voir les offres →
          </a>
        </div>
      )}
      <div className="grid gap-4">
        {subscriptions.map((s) => (
          <div key={s.id} className="bg-panel border border-line rounded-lg p-4">
            <div className="flex justify-between">
              <span className="font-semibold">{s.plan.name}</span>
              <span className="text-muted">{s.status}</span>
            </div>
            <p className="text-muted text-sm mt-1">
              {(s.plan.priceCents / 100).toFixed(2)} {s.plan.currency} — jusqu&apos;au{" "}
              {new Date(s.currentPeriodEnd).toLocaleDateString("fr-FR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: "danger" }) {
  return (
    <div className="bg-panel border border-line rounded-lg p-4">
      <p className="text-muted text-sm">{label}</p>
      <p className={`text-2xl font-display ${accent === "danger" ? "text-danger" : ""}`}>{value}</p>
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
