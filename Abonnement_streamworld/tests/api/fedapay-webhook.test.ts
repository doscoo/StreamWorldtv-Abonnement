import { describe, it, expect, vi, beforeEach } from "vitest";

const constructEvent = vi.fn();
vi.mock("@/lib/fedapay", () => ({
  FedaPay: { setApiKey: vi.fn(), setEnvironment: vi.fn() },
  Transaction: {},
  Webhook: { constructEvent: (...args: unknown[]) => constructEvent(...args) },
}));

const findUnique = vi.fn();
const update = vi.fn();
const invoiceCreate = vi.fn();
const auditLogCreate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) },
    invoice: { create: (...a: unknown[]) => invoiceCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    user: { findUnique: vi.fn().mockResolvedValue({ email: "client@example.com", firstName: "Awa" }) },
  },
}));

const sendPaymentConfirmationEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendPaymentConfirmationEmail: (...a: unknown[]) => sendPaymentConfirmationEmail(...a),
}));

import { POST } from "@/app/api/billing/fedapay/webhook/route";

function fakeRequest(body: string, signature = "t=1,v1=abc") {
  return {
    text: async () => body,
    headers: { get: (name: string) => (name === "x-fedapay-signature" ? signature : null) },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FEDAPAY_WEBHOOK_SECRET = "test-secret";
});

describe("FedaPay webhook", () => {
  it("rejects a request with an invalid signature", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const res = await POST(fakeRequest("{}"));
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("activates the matching subscription on transaction.approved", async () => {
    constructEvent.mockReturnValue({
      name: "transaction.approved",
      entity: { id: 4242 },
    });
    findUnique.mockResolvedValue({
      id: "sub_1",
      userId: "user_1",
      status: "PENDING_PAYMENT",
      currentPeriodEnd: new Date(),
      plan: { intervalDays: 30, priceCents: 5000, currency: "XOF", name: "Pro" },
    });

    const res = await POST(fakeRequest("{}"));
    const body = await res.json();

    expect(body).toEqual({ received: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "sub_1" }, data: expect.objectContaining({ status: "ACTIVE" }) })
    );
    expect(invoiceCreate).toHaveBeenCalled();
    expect(sendPaymentConfirmationEmail).toHaveBeenCalled();
  });

  it("does not fail the webhook if the confirmation email throws", async () => {
    constructEvent.mockReturnValue({ name: "transaction.approved", entity: { id: 4242 } });
    findUnique.mockResolvedValue({
      id: "sub_1",
      userId: "user_1",
      status: "PENDING_PAYMENT",
      currentPeriodEnd: new Date(),
      plan: { intervalDays: 30, priceCents: 5000, currency: "XOF", name: "Pro" },
    });
    sendPaymentConfirmationEmail.mockRejectedValue(new Error("resend is down"));

    const res = await POST(fakeRequest("{}"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });

  it("acknowledges events for unknown transactions without throwing", async () => {
    constructEvent.mockReturnValue({ name: "transaction.approved", entity: { id: 9999 } });
    findUnique.mockResolvedValue(null);

    const res = await POST(fakeRequest("{}"));
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });
});
