import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { notify } from "@/lib/email";

/**
 * Inbound email webhook (SendGrid / Mailgun / Postmark style).
 * Matched sender → message filed into their newest thread (or a new one with
 * the admins). No match → admin "Unmatched Inbox".
 *
 * Secured with INBOUND_WEBHOOK_SECRET via the `x-webhook-secret` header or a
 * `?secret=` query param. If the env var is unset the endpoint is open —
 * local development only.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      request.headers.get("x-webhook-secret") ??
      request.nextUrl.searchParams.get("secret") ??
      "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Accept JSON or form-encoded payloads; field names vary by provider.
  let payload: Record<string, unknown> = {};
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    }
  } catch {
    return NextResponse.json({ error: "Unreadable payload" }, { status: 400 });
  }

  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = payload[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };

  const fromRaw = pick("from", "From", "sender", "Sender", "envelope_from");
  const subject = pick("subject", "Subject").slice(0, 300) || "(no subject)";
  const body =
    pick("text", "TextBody", "body-plain", "stripped-text", "plain", "body").slice(0, 20000) ||
    "(empty message)";

  // Extract a bare address from forms like `Name <addr@example.com>`.
  const match = fromRaw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const fromAddress = (match?.[0] ?? fromRaw).toLowerCase();
  if (!fromAddress) {
    return NextResponse.json({ error: "Missing sender" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email: fromAddress } });

  if (!user || !user.active) {
    await db.unmatchedInbound.create({ data: { fromAddress, subject, body } });
    return NextResponse.json({ ok: true, filed: "unmatched" });
  }

  // File into the sender's most recent thread, or open a new one with admins.
  let thread = await db.thread.findFirst({
    where: { participants: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
  });

  if (!thread) {
    const admins = await db.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true },
    });
    thread = await db.thread.create({
      data: {
        subject,
        participants: {
          create: [{ userId: user.id }, ...admins.map((a) => ({ userId: a.id }))],
        },
      },
    });
  }

  await db.message.create({
    data: { threadId: thread.id, authorId: user.id, body, viaEmail: true },
  });
  await db.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });

  // Notify the other participants that a reply arrived by email.
  const others = await db.threadParticipant.findMany({
    where: { threadId: thread.id, NOT: { userId: user.id } },
    include: { user: { select: { email: true, active: true } } },
  });
  const emails = others.filter((p) => p.user.active).map((p) => p.user.email);
  if (emails.length > 0) {
    notify({
      to: emails,
      subject: `New message: ${thread.subject}`,
      body: `${user.name} replied by email.\n\n"${body.slice(0, 500)}${body.length > 500 ? "…" : ""}"\n\nView the conversation: ${process.env.APP_URL || ""}/portal/messages/${thread.id}`,
    });
  }

  return NextResponse.json({ ok: true, filed: "thread", threadId: thread.id });
}
