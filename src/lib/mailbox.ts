import crypto from "crypto";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";

/**
 * Sending email as a staff member from their own company mailbox (Zoho Mail
 * for @rowanheatingandair.com): the same account they use in Zoho's webmail
 * and phone app.
 *
 * We talk to the mail provider directly with the user's own login: SMTP to
 * send, then IMAP APPEND to save the exact same message into their "Sent"
 * folder, so it shows up in Zoho like anything else they sent. (Zoho Mail's
 * free plan has no IMAP/SMTP; Mail Lite or higher is needed, with IMAP access
 * turned on for each user.)
 *
 * Configuration (all optional; defaults are Zoho's servers for organization
 * accounts in the US data center):
 *   MAIL_SMTP_HOST             default smtppro.zoho.com (EU: smtppro.zoho.eu)
 *   MAIL_IMAP_HOST             default imappro.zoho.com (EU: imappro.zoho.eu)
 *   MAIL_HOST                  sets both at once (e.g. a self-hosted server)
 *   MAIL_SMTP_PORT             465 (TLS) or 587 (STARTTLS)        default 465
 *   MAIL_IMAP_PORT             993 (TLS)                          default 993
 *   MAIL_ALLOWED_DOMAIN        only mailboxes @ this domain       default rowanheatingandair.com
 *   MAIL_SENT_FOLDER           force a Sent folder name (normally auto-detected)
 *   MAIL_TLS_ALLOW_SELF_SIGNED "1" only for a self-hosted server with a
 *                              self-signed certificate
 *   MAILBOX_SECRET             key for encrypting stored mailbox passwords
 *                              (defaults to one derived from AUTH_SECRET)
 */

export function mailConfig() {
  const smtpHost = process.env.MAIL_SMTP_HOST || process.env.MAIL_HOST || "smtppro.zoho.com";
  const imapHost = process.env.MAIL_IMAP_HOST || process.env.MAIL_HOST || "imappro.zoho.com";
  const smtpPort = Number(process.env.MAIL_SMTP_PORT || 465);
  const local = [smtpHost, imapHost].some((h) => h === "localhost" || h === "127.0.0.1");
  return {
    smtpHost,
    imapHost,
    smtpPort,
    imapPort: Number(process.env.MAIL_IMAP_PORT || 993),
    allowedDomain: (process.env.MAIL_ALLOWED_DOMAIN || "rowanheatingandair.com").toLowerCase(),
    sentFolder: process.env.MAIL_SENT_FOLDER || null,
    // Same-server connections can't match a public certificate's hostname.
    rejectUnauthorized: !local && process.env.MAIL_TLS_ALLOW_SELF_SIGNED !== "1",
  };
}

export function isAllowedMailbox(address: string): boolean {
  const domain = address.toLowerCase().split("@")[1];
  return !!domain && domain === mailConfig().allowedDomain;
}

// ---------- Password encryption at rest ----------

function key(): Buffer {
  const secret = process.env.MAILBOX_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("MAILBOX_SECRET or AUTH_SECRET must be set");
  return crypto.createHash("sha256").update(`rowan-mailbox:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

/** Returns null if the value can't be decrypted (e.g. the secret changed). */
export function decryptSecret(stored: string): string | null {
  const [v, iv, tag, ct] = stored.split(":");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- SMTP / IMAP ----------

export type MailboxLogin = { address: string; password: string };

export function smtpTransport(login: MailboxLogin) {
  const cfg = mailConfig();
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    requireTLS: cfg.smtpPort !== 465, // never send the password unencrypted
    auth: { user: login.address, pass: login.password },
    tls: { rejectUnauthorized: cfg.rejectUnauthorized },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/**
 * Why a send failed, in words for a technician. `retry` = temporary (server
 * unreachable), worth trying again later; otherwise it will never work as-is.
 */
export type MailFailure = { message: string; retry: boolean };

export function describeMailError(err: unknown): MailFailure {
  const e = err as { code?: string; responseCode?: number; message?: string };
  if (e.code === "EAUTH" || e.responseCode === 535) {
    return {
      message: "Your email password was rejected. Reconnect your email in the van app (Email tab). With Zoho two-factor sign-in, use an app-specific password.",
      retry: false,
    };
  }
  if (e.code === "EENVELOPE" || (e.responseCode && e.responseCode >= 550 && e.responseCode < 560)) {
    return { message: "The mail server refused a recipient address: " + (e.message || ""), retry: false };
  }
  if (e.responseCode && e.responseCode >= 500) {
    return { message: "The mail server refused the email: " + (e.message || ""), retry: false };
  }
  return { message: "Couldn't reach the mail server; will try again.", retry: true };
}

/** Checks a mailbox login against the mail server (SMTP AUTH). */
export async function verifyMailbox(login: MailboxLogin): Promise<MailFailure | null> {
  const transport = smtpTransport(login);
  try {
    await transport.verify();
    return null;
  } catch (err) {
    return describeMailError(err);
  } finally {
    transport.close();
  }
}

export type OutgoingEmail = {
  fromName: string;
  to: string[];
  subject: string;
  text: string;
  messageId?: string;
};

/** Sends as the mailbox owner, then files a copy in their Sent folder. */
export async function sendFromMailbox(login: MailboxLogin, email: OutgoingEmail) {
  const raw = await new MailComposer({
    from: { name: email.fromName, address: login.address },
    to: email.to,
    subject: email.subject,
    text: email.text,
    messageId: email.messageId,
    date: new Date(),
  })
    .compile()
    .build();

  const transport = smtpTransport(login);
  try {
    await transport.sendMail({ envelope: { from: login.address, to: email.to }, raw });
  } finally {
    transport.close();
  }

  // Best effort: the email is already sent; a missing Sent copy isn't worth
  // failing (and re-sending) over.
  try {
    await appendToSent(login, raw);
  } catch (err) {
    console.error("[mailbox] could not save to Sent folder:", (err as Error).message);
  }
}

async function appendToSent(login: MailboxLogin, raw: Buffer) {
  const cfg = mailConfig();
  const client = new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: { user: login.address, pass: login.password },
    tls: { rejectUnauthorized: cfg.rejectUnauthorized },
    logger: false,
  });
  await client.connect();
  try {
    const folder = cfg.sentFolder || pickSentFolder(await client.list());
    await client.append(folder, raw, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/**
 * Finds the mailbox's sent-mail folder: the one flagged \Sent, else
 * one named like "Sent" (Plesk's Dovecot often names it "INBOX.Sent").
 */
export function pickSentFolder(
  folders: { path: string; name: string; specialUse?: string; delimiter?: string }[],
): string {
  const flagged = folders.find((f) => f.specialUse === "\\Sent");
  if (flagged) return flagged.path;
  const named = folders.find((f) => /^sent( items| messages)?$/i.test(f.name));
  if (named) return named.path;
  const dotted = folders.some((f) => f.delimiter === "." && f.path.toUpperCase().startsWith("INBOX."));
  return dotted ? "INBOX.Sent" : "Sent";
}
