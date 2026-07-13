import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-ink text-white font-sans flex flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="font-display text-4xl">Subscriber Portal</h1>
      <p className="text-muted max-w-md">
        Gérez vos comptes, vos abonnements et vos paiements — par carte (Stripe)
        ou Mobile Money (FedaPay).
      </p>
      <div className="flex gap-4">
        <Link href="/pricing" className="bg-accent text-white rounded-md px-5 py-3 font-semibold">
          Voir les tarifs
        </Link>
        <Link href="/dashboard" className="bg-white/5 border border-line text-white rounded-md px-5 py-3 font-semibold">
          Tableau de bord
        </Link>
      </div>
    </div>
  );
}
