import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import type { EmailStatus } from "@prisma/client";

export const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  "Rowan Heating & Air Conditioning <info@rowanhvac.com>";

export const COMPANY_SIGNATURE = `

—
Rowan Heating & Air Conditioning
Family-owned and operated in Howard County since 1958
Phone: 410-531-0008  •  Email: info@rowanhvac.com
P.O. Box 109, Fulton, MD 20759`;

export const MAX_RECIPIENTS = 25;

type SendArgs = {
  to: string[]; // list of recipient email addresses
  subject: string;
  body: string; // plain text body (signature is appended by callers when desired)
  senderUserId?: string | null;
  appendSignature?: boolean;
};

/**
 * Pluggable email sender. Sends via Resend when RESEND_API_KEY is configured;
 * otherwise logs the full email to the server console. Every attempt is recorded
 * in EmailLog with the sending user's id.
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

  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && recipients.length > 0) {
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
