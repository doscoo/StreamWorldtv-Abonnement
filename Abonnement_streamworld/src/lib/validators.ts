import { z } from "zod";

export const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(200),
  phone: z.string().trim().max(30).optional(),
  country: z.string().trim().max(80).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  totpToken: z.string().trim().length(6).optional(),
});

export const twoFactorEnrollSchema = z.object({
  action: z.literal("enroll"),
});

export const twoFactorConfirmSchema = z.object({
  action: z.literal("confirm"),
  token: z.string().trim().length(6),
});

export const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  provider: z.enum(["STRIPE", "FEDAPAY"]),
});

export const fedapayCreateSchema = z.object({
  planId: z.string().uuid(),
});

export const fedapayRenewSchema = z.object({
  subscriptionId: z.string().uuid(),
});
