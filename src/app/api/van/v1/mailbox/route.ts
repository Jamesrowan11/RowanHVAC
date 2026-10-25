import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { authenticateDevice } from "@/lib/vanServer";
import { mailboxSchema } from "@/lib/vanSync";
import { encryptSecret, isAllowedMailbox, mailConfig, verifyMailbox } from "@/lib/mailbox";

/**
 * Connects (or disconnects) the technician's own company mailbox — the account
 * they use in Roundcube — so the van app can send email as them. The password
 * is checked against the mail server right away, then stored encrypted.
 */
export async function POST(req: Request) {
  const caller = await authenticateDevice(req.headers.get("authorization"));
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "This van is signed out. Please sign in again." },
      { status: 401 },
    );
  }
  if (!rateLimit(`van-mailbox:${caller.user.id}`, 10, 15 * 60 * 1000).ok) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Wait 15 minutes and try again." },
      { status: 429 },
    );
  }

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = mailboxSchema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Enter your email address and email password." },
      { status: 422 },
    );
  }

  if ("disconnect" in parsed.data) {
    await prisma.mailbox.deleteMany({ where: { userId: caller.user.id } });
    return NextResponse.json({ ok: true, address: null });
  }

  const { address, password } = parsed.data;
  if (!isAllowedMailbox(address)) {
    return NextResponse.json(
      { ok: false, error: `Use your company email address (@${mailConfig().allowedDomain}).` },
      { status: 422 },
    );
  }

  const failure = await verifyMailbox({ address, password });
  if (failure) {
    return NextResponse.json(
      {
        ok: false,
        error: failure.retry
          ? "Couldn't reach the company mail server. Try again in a few minutes."
          : "That email address and password didn't work. Use the same login as webmail (Roundcube).",
      },
      { status: failure.retry ? 503 : 422 },
    );
  }

  const passwordEncrypted = encryptSecret(password);
  await prisma.mailbox.upsert({
    where: { userId: caller.user.id },
    create: { userId: caller.user.id, address, passwordEncrypted },
    update: { address, passwordEncrypted },
  });
  return NextResponse.json({ ok: true, address });
}
