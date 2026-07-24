import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

/**
 * Reads/sends mail through a linked Plesk mailbox's own IMAP/SMTP, using that
 * mailbox's real credentials (there's no OAuth for Plesk mail — this is the
 * only way to connect). Credentials are passed in per call, decrypted just
 * before use by the caller; nothing here persists them.
 */

function mailboxHost(): string {
  const host = process.env.MAILBOX_HOST;
  if (!host) throw new Error("MAILBOX_HOST is not configured");
  return host;
}

function imapTlsOptions() {
  return process.env.MAILBOX_TLS_INSECURE === "true" ? { rejectUnauthorized: false } : undefined;
}

export type MailboxMessageSummary = {
  uid: number;
  subject: string;
  from: string;
  date: string;
  seen: boolean;
};

export async function verifyMailboxCredentials(
  address: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: mailboxHost(),
    port: Number(process.env.MAILBOX_IMAP_PORT || 993),
    secure: true,
    tls: imapTlsOptions(),
    auth: { user: address, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not connect" };
  }
}

export async function fetchRecentMessages(
  address: string,
  password: string,
  limit = 25
): Promise<MailboxMessageSummary[]> {
  const client = new ImapFlow({
    host: mailboxHost(),
    port: Number(process.env.MAILBOX_IMAP_PORT || 993),
    secure: true,
    tls: imapTlsOptions(),
    auth: { user: address, pass: password },
    logger: false,
  });

  const messages: MailboxMessageSummary[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status = await client.status("INBOX", { messages: true });
      const total = status.messages ?? 0;
      if (total === 0) return [];
      const start = Math.max(1, total - limit + 1);
      for await (const msg of client.fetch(`${start}:${total}`, { envelope: true, flags: true, uid: true })) {
        messages.push({
          uid: msg.uid,
          subject: msg.envelope?.subject || "(no subject)",
          from: msg.envelope?.from?.[0]?.address || msg.envelope?.from?.[0]?.name || "(unknown sender)",
          date: (msg.envelope?.date ?? new Date()).toISOString(),
          seen: !!msg.flags?.has("\\Seen"),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return messages.reverse(); // newest first
}

export async function fetchMessageBody(
  address: string,
  password: string,
  uid: number
): Promise<{ subject: string; from: string; date: string; text: string; html: string | null }> {
  const client = new ImapFlow({
    host: mailboxHost(),
    port: Number(process.env.MAILBOX_IMAP_PORT || 993),
    secure: true,
    tls: imapTlsOptions(),
    auth: { user: address, pass: password },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    let source: Buffer | null = null;
    try {
      // Mark as seen when opened, matching normal mail-client behavior.
      const { content } = await client.download(String(uid), undefined, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of content) chunks.push(chunk as Buffer);
      source = Buffer.concat(chunks);
      await client.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true });
    } finally {
      lock.release();
    }
    if (!source) throw new Error("Message not found");
    const parsed = await simpleParser(source);
    return {
      subject: parsed.subject || "(no subject)",
      from: parsed.from?.text || "(unknown sender)",
      date: (parsed.date ?? new Date()).toISOString(),
      text: parsed.text || "",
      html: typeof parsed.html === "string" ? parsed.html : null,
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function sendMailboxMessage(
  address: string,
  password: string,
  opts: { to: string; subject: string; body: string }
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: mailboxHost(),
    port: Number(process.env.MAILBOX_SMTP_PORT || 465),
    secure: Number(process.env.MAILBOX_SMTP_PORT || 465) === 465,
    auth: { user: address, pass: password },
    tls: imapTlsOptions(),
  });
  await transport.sendMail({
    from: address,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
  });
}
