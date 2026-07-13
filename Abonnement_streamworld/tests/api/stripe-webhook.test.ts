import { describe, it, expect, vi, beforeEach } from "vitest";

const constructEvent = vi.fn();
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: (...a: unknown[]) => constructEvent(...a) },
    subscriptions: { retrieve: vi.fn() },
  },
}));

const subFindUnique = vi.fn();
const invoiceUpsert = vi.fn();
const auditLogCreate = vi.fn();
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: (...a: unknown[]) => subFindUnique(...a),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    invoice: { upsert: (...a: unknown[]) => invoiceUpsert(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
  },
}));

const sendPaymentConfirmationEmail = vi.fn();
const sendPaymentFailedEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendPaymentConfirmationEmail: (...a: unknown[]) => sendPaymentConfirmationEmail(...a),
  sendPaymentFailedEmail: (...a: unknown[]) => sendPaymentFailedEmail(...a),
}));

import { POST } from "@/app/api/billing/webhook/route";

function fakeRequest(body: string, signature: string | null = "sig_test") {
  return {
    text: async () => body,
    headers: { get: (name: string) => (name === "stripe-signature" ? signature : null) },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  userFindUnique.mockResolvedValue({ email: "client@example.com", firstName: "Awa" });
});

describe("Stripe webhook", () => {
  it("rejects a request with no stripe-signature header", async () => {
    const res = await POST(fakeRequest("{}", null));
    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("rejects a request with an invalid signature", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(fakeRequest("{}"));
    expect(res.status).toBe(400);
  });

  it("sends a confirmation email and upserts the invoice on invoice.paid", async () => {
    constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: {
          id: "in_1",
          subscription: "sub_123",
          amount_paid: 1999,
          currency: "eur",
        },
      },
    });
    subFindUnique.mockResolvedValue({
      id: "sub_row_1",
      userId: "user_1",
      currentPeriodEnd: new Date(),
      plan: { name: "Pro", priceCents: 1999, currency: "EUR" },
    });

    const res = await POST(fakeRequest("{}"));
    expect(res.status).toBe(200);
    expect(invoiceUpsert).toHaveBeenCalled();
    expect(sendPaymentConfirmationEmail).toHaveBeenCalled();
  });

  it("sends a failure email on invoice.payment_failed without touching invoices", async () => {
    constructEvent.mockReturnValue({
      type: "invoice.payment_failed",
      data: { object: { id: "in_2", subscription: "sub_123" } },
    });
    subFindUnique.mockResolvedValue({
      id: "sub_row_1",
      userId: "user_1",
      plan: { name: "Pro", priceCents: 1999, currency: "EUR" },
    });

    const res = await POST(fakeRequest("{}"));
    expect(res.status).toBe(200);
    expect(sendPaymentFailedEmail).toHaveBeenCalled();
    expect(invoiceUpsert).not.toHaveBeenCalled();
  });

  it("returns 500 so Stripe retries when the handler throws", async () => {
    constructEvent.mockReturnValue({
      type: "invoice.paid",
      data: { object: { id: "in_3", subscription: "sub_123", amount_paid: 100, currency: "usd" } },
    });
    subFindUnique.mockRejectedValue(new Error("db down"));

    const res = await POST(fakeRequest("{}"));
    expect(res.status).toBe(500);
  });
});
