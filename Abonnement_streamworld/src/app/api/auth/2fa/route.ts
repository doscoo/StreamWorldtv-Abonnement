import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { generateTwoFactorSecret, verifyTwoFactorToken } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

// Step 1: generate a secret + QR code for the user to scan in their
// authenticator app. Stored but NOT enabled until confirmed in step 2 —
// otherwise a dropped request could lock the user out with 2FA "half on".
export async function POST(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: caller.sub } });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { secret, otpauthUrl } = generateTwoFactorSecret(user.email);
  await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret: secret } });

  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return NextResponse.json({ otpauthUrl, qrDataUrl });
}

const confirmSchema = z.object({ token: z.string().trim().length(6) });

// Step 2: user submits the 6-digit code their app is currently showing.
// Only after this succeeds do we flip twoFactorEnabled on.
export async function PUT(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { token } = confirmSchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id: caller.sub } });
    if (!user?.twoFactorSecret) {
      return NextResponse.json({ error: "No 2FA enrollment in progress." }, { status: 400 });
    }

    if (!verifyTwoFactorToken(token, user.twoFactorSecret)) {
      return NextResponse.json({ error: "Invalid code." }, { status: 400 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await prisma.auditLog.create({ data: { actorId: user.id, action: "user.2fa_enabled" } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("2fa confirm error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Disable 2FA (requires current password re-entry client-side ideally —
// kept simple here: just requires being authenticated).
export async function DELETE(req: NextRequest) {
  const caller = getCurrentUser(req);
  if (!caller) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await prisma.user.update({
    where: { id: caller.sub },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  await prisma.auditLog.create({ data: { actorId: caller.sub, action: "user.2fa_disabled" } });

  return NextResponse.json({ ok: true });
}
