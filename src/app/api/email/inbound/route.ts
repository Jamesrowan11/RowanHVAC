import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

/**
 * Inbound email webhook.
 *
 * Email providers (e.g. Resend inbound, SendGrid Inbound Parse, Postmark) POST
 * a parsed message here. We:
 *   1. Authenticate the request with a shared secret (INBOUND_EMAIL_SECRET).
 *   2. Record it in EmailLog (direction = INBOUND).
 *   3. If the sender matches a known portal user, append the message to a
 *      conversation between that user and the company (admins) — creating one
 *      if needed — so staff see inbound replies in the in-app Messages section.
 *
 * Accepts a generic JSON body: { from, to, subject, text|body, secret? }.
 */
export async function POST(req: Request) {
  // Throttle: at most 60 inbound posts per minute per IP.
  const ip = clientIpFromHeaders(req.headers);
  if (!rateLimit(`inbound:${ip}`, 60, 60 * 1000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const secret = process.env.INBOUND_EMAIL_SECRET;

  // Auth: accept the secret via Authorization: Bearer, x-webhook-secret header,
  // or a `secret` field in the JSON body.
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (secret) {
    const auth = req.headers.get("authorization") || "";
    const headerSecret =
      req.headers.get("x-webhook-secret") || auth.replace(/^Bearer\s+/i, "");
    const bodySecret = typeof body.secret === "string" ? body.secret : "";
    if (headerSecret !== secret && bodySecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const from = String(body.from || "").toLowerCase().trim();
  const subject = String(body.subject || "(no subject)");
  const text = String(body.text || body.body || "").trim();
  const to = String(body.to || process.env.EMAIL_FROM || "");

  if (!from || !text) {
    return NextResponse.json(
      { error: "Missing 'from' or message body" },
      { status: 400 },
    );
  }

  // Extract a bare email address if a display name is included.
  const match = from.match(/[^\s<>]+@[^\s<>]+/);
  const fromEmail = match ? match[0] : from;

  // Always record the inbound email.
  const sender = await prisma.user.findUnique({
    where: { email: fromEmail },
    select: { id: true, role: true },
  });

  await prisma.emailLog.create({
    data: {
      senderUserId: sender?.id ?? null,
      to,
      subject,
      body: text,
      status: "LOGGED",
      direction: "INBOUND",
    },
  });

  // If we recognize the sender, surface the message in the in-app inbox.
  if (sender) {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true },
    });

    // Find an existing conversation that includes the sender and at least one admin.
    const existing = await prisma.conversation.findFirst({
      where: {
        participants: { some: { userId: sender.id } },
        AND: [{ participants: { some: { user: { role: "ADMIN" } } } }],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    let conversationId = existing?.id;
    if (!conversationId) {
      const participantIds = Array.from(
        new Set([sender.id, ...admins.map((a) => a.id)]),
      );
      const convo = await prisma.conversation.create({
        data: {
          subject,
          participants: {
            create: participantIds.map((id) => ({ userId: id })),
          },
        },
        select: { id: true },
      });
      conversationId = convo.id;
    }

    await prisma.message.create({
      data: {
        conversationId,
        senderId: sender.id,
        body: text,
        viaEmail: true,
      },
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}
