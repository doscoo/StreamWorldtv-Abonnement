import { FedaPay, Transaction, Webhook } from "fedapay";

// "sandbox" while testing, "live" once you're ready to receive real money.
// Get both keys from your FedaPay dashboard: Réglages → Clés API.
FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY as string);
FedaPay.setEnvironment((process.env.FEDAPAY_ENV as "sandbox" | "live") ?? "sandbox");

export { FedaPay, Transaction, Webhook };
