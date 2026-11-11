import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { smtpTransport } from "@/lib/mailbox";
import type { EmailStatus } from "@prisma/client";

export const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  "Rowan Heating & Air Conditioning <info@rowanheatingandair.com>";

export const COMPANY_SIGNATURE = `

—
Rowan Heating & Air Conditioning
Family-owned and operated in Howard County since 1958
Phone: 410-531-0008  •  Email: info@rowanheatingandair.com
P.O. Box 109, Fulton, MD 20759`;

export const MAX_RECIPIENTS = 25;

type SendArgs = {
  to: string[]; // list of recipient email addresses
  subject: string;
  body: string; // plain text body (signature is appended by callers when desired)
  senderUserId?: string | null;
  appendSignature?: boolean;
};

/** Parse "Name <addr@x>" or "addr@x" into ZeptoMail's sender shape. */
function parseFrom(from: string): { address: string; name?: string } {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, address: m[2] } : { address: from.trim() };
}

/**
 * The company mailbox the website sends its automatic emails from (password
 * resets, quote and message notifications, vehicle alerts), e.g.
 * info@rowanheatingandair.com on Zoho Mail. Uses the same SMTP server as the
 * van app's Email tab (MAIL_SMTP_HOST / MAIL_SMTP_PORT).
 *   EMAIL_SMTP_USER      the mailbox address
 *   EMAIL_SMTP_PASSWORD  its password (a Zoho app-specific password if that
 *                        account uses two-factor sign-in)
 */
export function smtpSender(): { user: string; password: string } | null {
  const user = process.env.EMAIL_SMTP_USER?.trim();
  const password = process.env.EMAIL_SMTP_PASSWORD;
  return user && password ? { user, password } : null;
}

/**
 * Zoho (like most providers) only lets a mailbox send as itself. Keep the
 * display name from EMAIL_FROM, but send from the authenticated mailbox; if
 * EMAIL_FROM names a different address, replies go there.
 */
export function smtpFromHeaders(user: string, emailFrom = EMAIL_FROM) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(emailFrom);
  const name = (m ? m[1] : "").replace(/^"|"$/g, "") || "Rowan Heating & Air Conditioning";
  const address = (m ? m[2] : emailFrom).trim();
  return {
    from: { name, address: user },
    ...(address.toLowerCase() !== user.toLowerCase() && address.includes("@") ? { replyTo: address } : {}),
  };
}

/**
 * Send through ZeptoMail (Zoho's transactional email API). The token comes from
 * ZEPTOMAIL_TOKEN in the server's environment file (never in code or Git).
 * ZEPTOMAIL_API_HOST is api.zeptomail.com, or .eu / .in / .com.au for other regions.
 */
export async function sendViaZeptoMail(
  token: string,
  recipients: string[],
  subject: string,
  text: string,
): Promise<boolean> {
  const host = process.env.ZEPTOMAIL_API_HOST || "api.zeptomail.com";
  if (!/^api\.zeptomail\.[a-z.]+$/.test(host)) {
    console.error("[email] ZEPTOMAIL_API_HOST must look like api.zeptomail.com");
    return false;
  }
  const res = await fetch(`https://${host}/v1.1/email`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Zoho-enczapikey ${token.replace(/^Zoho-enczapikey\s+/i, "")}`,
    },
    body: JSON.stringify({
      from: parseFrom(EMAIL_FROM),
      to: recipients.map((address) => ({ email_address: { address } })),
      subject,
      textbody: text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    console.error(`[email] ZeptoMail HTTP ${res.status}:`, (await res.text()).slice(0, 500));
    return false;
  }
  return true;
}

/**
 * Pluggable email sender, in order of preference:
 * 1. ZeptoMail (ZEPTOMAIL_TOKEN),
 * 2. the company mailbox over SMTP (EMAIL_SMTP_USER / EMAIL_SMTP_PASSWORD),
 * 3. Resend (RESEND_API_KEY),
 * 4. otherwise the full email is logged to the server console.
 * Every attempt is recorded in EmailLog with the sending user's id.
 */
export async function sendEmail({
  to,
  subject,
  body,
  senderUserId = null,
  appendSignature = true,
}: SendArgs) {
  const recipients = to
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_RECIPIENTS);

  const finalBody = appendSignature ? `${body}${COMPANY_SIGNATURE}` : body;
  const toLine = recipients.join(", ");

  let status: EmailStatus = "LOGGED";

  const zeptoToken = process.env.ZEPTOMAIL_TOKEN;
  const smtp = smtpSender();
  const apiKey = process.env.RESEND_API_KEY;
  if (zeptoToken && recipients.length > 0) {
    try {
      status = (await sendViaZeptoMail(zeptoToken, recipients, subject, finalBody)) ? "SENT" : "FAILED";
    } catch (err) {
      status = "FAILED";
      console.error("[email] ZeptoMail threw:", err);
    }
  } else if (smtp && recipients.length > 0) {
    const transport = smtpTransport({ address: smtp.user, password: smtp.password });
    try {
      await transport.sendMail({
        ...smtpFromHeaders(smtp.user),
        to: recipients,
        subject,
        text: finalBody,
      });
      status = "SENT";
    } catch (err) {
      status = "FAILED";
      console.error("[email] SMTP send failed:", (err as Error).message);
    } finally {
      transport.close();
    }
  } else if (apiKey && recipients.length > 0) {
    try {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: EMAIL_FROM,
        to: recipients,
        subject,
        text: finalBody,
      });
      status = error ? "FAILED" : "SENT";
      if (error) {
        console.error("[email] Resend error:", error);
      }
    } catch (err) {
      status = "FAILED";
      console.error("[email] Resend threw:", err);
    }
  } else {
    // Console fallback — the app runs fully without an email key.
    console.log(
      [
        "",
        "==================== EMAIL (console fallback) ====================",
        `From:    ${EMAIL_FROM}`,
        `To:      ${toLine || "(no recipients)"}`,
        `Subject: ${subject}`,
        "------------------------------------------------------------------",
        finalBody,
        "==================================================================",
        "",
      ].join("\n"),
    );
  }

  const log = await prisma.emailLog.create({
    data: {
      senderUserId: senderUserId || null,
      to: toLine,
      subject,
      body: finalBody,
      status,
      direction: "OUTBOUND",
    },
  });

  return { status, log };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseRecipients(raw: string): {
  valid: string[];
  invalid: string[];
} {
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (EMAIL_RE.test(p)) valid.push(p);
    else invalid.push(p);
  }
  return { valid, invalid };
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}
