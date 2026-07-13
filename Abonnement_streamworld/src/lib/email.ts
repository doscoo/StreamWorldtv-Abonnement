import { Resend } from "resend";

// Lazy singleton: only instantiate once RESEND_API_KEY is actually needed,
// so a missing key in local dev doesn't crash routes that don't send email.
let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Missing required env var: RESEND_API_KEY");
    client = new Resend(key);
  }
  return client;
}

function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "billing@yourcompany.com";
}

function money(amountCents: number, currency: string): string {
  // XOF (FedaPay) has no minor unit — Plan.priceCents already stores whole
  // francs for those plans, so don't divide by 100 in that case.
  const amount = currency.toUpperCase() === "XOF" ? amountCents : amountCents / 100;
  return `${amount.toLocaleString("fr-FR")} ${currency.toUpperCase()}`;
}

function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;background:#0E1116;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0E1116;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#161B22;border:1px solid #232A34;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <h1 style="color:#ffffff;font-size:20px;margin:0 0 16px;">${title}</h1>
                <div style="color:#C7CDD8;font-size:14px;line-height:1.6;">${bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;">
                <p style="color:#8A94A6;font-size:12px;margin:0;">Cet email a été envoyé automatiquement, merci de ne pas y répondre directement.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

type MinimalUser = { email: string; firstName: string };
type MinimalPlan = { name: string; priceCents: number; currency: string };

/**
 * Sent right after a payment succeeds (Stripe invoice.paid /
 * checkout.session.completed, or FedaPay transaction.approved).
 * Best-effort: failures are caught by the caller and logged, never allowed
 * to fail the webhook itself (Stripe/FedaPay would just retry the event).
 */
export async function sendPaymentConfirmationEmail(
  user: MinimalUser,
  plan: MinimalPlan,
  periodEnd: Date
) {
  const html = wrap(
    "Paiement confirmé ✅",
    `<p>Bonjour ${escapeHtml(user.firstName)},</p>
     <p>Nous avons bien reçu votre paiement pour l'offre <strong>${escapeHtml(plan.name)}</strong>
     (${money(plan.priceCents, plan.currency)}).</p>
     <p>Votre abonnement est actif jusqu'au <strong>${periodEnd.toLocaleDateString("fr-FR")}</strong>.</p>
     <p>Merci de votre confiance !</p>`
  );

  return getClient().emails.send({
    from: fromAddress(),
    to: user.email,
    subject: "Confirmation de votre paiement",
    html,
  });
}

/** Sent when a recurring payment attempt fails (Stripe invoice.payment_failed). */
export async function sendPaymentFailedEmail(user: MinimalUser, plan: MinimalPlan) {
  const html = wrap(
    "Échec de votre paiement ⚠️",
    `<p>Bonjour ${escapeHtml(user.firstName)},</p>
     <p>Le paiement de votre abonnement <strong>${escapeHtml(plan.name)}</strong> n'a pas pu être traité.</p>
     <p>Merci de vérifier votre moyen de paiement pour éviter une interruption de service.</p>`
  );

  return getClient().emails.send({
    from: fromAddress(),
    to: user.email,
    subject: "Échec de paiement — action requise",
    html,
  });
}

/**
 * Sent by the renewal-reminder cron a few days before currentPeriodEnd —
 * mainly aimed at FedaPay subscriptions, which need the customer to approve
 * each charge manually (see README "Mobile Money via FedaPay").
 */
export async function sendRenewalReminderEmail(
  user: MinimalUser,
  plan: MinimalPlan,
  periodEnd: Date,
  renewUrl?: string
) {
  const cta = renewUrl
    ? `<p><a href="${renewUrl}" style="display:inline-block;background:#4F8CFF;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;">Renouveler maintenant</a></p>`
    : "";

  const html = wrap(
    "Votre abonnement expire bientôt ⏳",
    `<p>Bonjour ${escapeHtml(user.firstName)},</p>
     <p>Votre abonnement <strong>${escapeHtml(plan.name)}</strong> arrive à échéance le
     <strong>${periodEnd.toLocaleDateString("fr-FR")}</strong>.</p>
     <p>Pensez à le renouveler pour ne pas perdre l'accès à votre offre.</p>
     ${cta}`
  );

  return getClient().emails.send({
    from: fromAddress(),
    to: user.email,
    subject: "Votre abonnement expire bientôt",
    html,
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
