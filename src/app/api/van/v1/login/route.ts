import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { rateLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { generateDeviceToken, loginSchema, VAN_PROTOCOL_VERSION } from "@/lib/vanSync";

/**
 * Van terminal sign-in. Exchanges a technician's portal email + password for a
 * long-lived device token (shown once; only its hash is stored). Only active
 * EMPLOYEE / ADMIN accounts can sign in a van.
 */
export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  if (!rateLimit(`van-login:${ip}`, 10, 15 * 60 * 1000).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-in attempts. Wait 15 minutes and try again." },
      { status: 429 },
    );
  }

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Enter your email, password, and a name for this van." },
      { status: 422 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  if (!rateLimit(`van-login-email:${email}`, 10, 15 * 60 * 1000).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many sign-in attempts. Wait 15 minutes and try again." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid =
    !!user && user.active && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !valid) {
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }
  if (user.role !== "EMPLOYEE" && user.role !== "ADMIN") {
    return NextResponse.json(
      { ok: false, error: "Only staff accounts can sign in to a van terminal." },
      { status: 403 },
    );
  }

  // Signing in again as the same tech on the same van replaces the old sign-in
  // instead of piling up duplicate entries under Admin → Van Terminals.
  await prisma.vanDevice.updateMany({
    where: { userId: user.id, name: parsed.data.deviceName, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const { raw, hash } = generateDeviceToken();
  await prisma.vanDevice.create({
    data: {
      name: parsed.data.deviceName,
      userId: user.id,
      tokenHash: hash,
      appVersion: parsed.data.appVersion?.slice(0, 40) ?? null,
      lastIp: ip.slice(0, 64),
    },
  });

  return NextResponse.json({
    ok: true,
    protocol: VAN_PROTOCOL_VERSION,
    token: raw,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
