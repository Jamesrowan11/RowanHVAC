import { db } from "@/lib/db";
import { COMPANY } from "@/lib/constants";

export const DEFAULT_SIGNATURE = `Rowan Heating & Air Conditioning
Family-owned & operated since 1958
Phone: 410-531-0008
Email: info@rowanhvac.com
Highland & Howard County, MD`;

export async function getSignature(): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: "emailSignature" } });
  return row?.value?.trim() || DEFAULT_SIGNATURE;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(body: string, signature: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const sigHtml = escapeHtml(signature).replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f5f9;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">
  <div style="background:#1a2b4a;border-radius:10px 10px 0 0;padding:18px 24px;">
    <span style="color:#ffffff;font-size:17px;font-weight:bold;">${COMPANY.name}</span>
  </div>
  <div style="background:#ffffff;border-radius:0 0 10px 10px;padding:24px;box-shadow:0 1px 3px rgba(13,22,38,0.1);">
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #e2e7f0;margin:20px 0;"/>
    <div style="color:#3d5d8e;font-size:13px;line-height:1.6;">${sigHtml}</div>
  </div>
</div>
</body></html>`;
}

export type SendEmailInput = {
  senderUserId?: string | null;
  to: string[];
  subject: string;
  body: string;
};

function smtpConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Pluggable email layer. Prefers the company's own mail server via SMTP
 * (SMTP_HOST/SMTP_USER/SMTP_PASS — e.g. the Plesk mailbox the portal sends
 * as); falls back to Resend when RESEND_API_KEY is set; otherwise logs the
 * full email to the console so the app runs end-to-end with no email keys.
 * Every send (real or logged) is recorded in EmailLog. The company
 * signature is appended exactly once.
 */
export async function sendEmail(input: SendEmailInput) {
  const signature = await getSignature();
  // Don't double-append if the body already ends with the signature.
  const baseBody = input.body.trimEnd();
  const text = baseBody.endsWith(signature)
    ? baseBody
    : `${baseBody}\n\n--\n${signature}`;
  const html = buildHtml(baseBody.endsWith(signature) ? baseBody.slice(0, -signature.length).trimEnd() : baseBody, signature);

  const from = process.env.EMAIL_FROM || "Rowan Heating & Air <info@rowanhvac.com>";
  const apiKey = process.env.RESEND_API_KEY;

  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | null = null;

  if (smtpConfigured()) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const port = Number(process.env.SMTP_PORT || 465);
      const transport = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        ...(process.env.SMTP_TLS_INSECURE === "true" ? { tls: { rejectUnauthorized: false } } : {}),
      });
      await transport.sendMail({ from, to: input.to, subject: input.subject, text, html });
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  } else if (apiKey) {
    try {
      const { Resend } = await import("resend");
      const resend = new Resend(apiKey);
      const result = await resend.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        text,
        html,
      });
      if (result.error) {
        status = "FAILED";
        error = result.error.message;
      } else {
        status = "SENT";
      }
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    console.log(
      [
        "================ EMAIL (console mode — no RESEND_API_KEY) ================",
        `From:    ${from}`,
        `To:      ${input.to.join(", ")}`,
        `Subject: ${input.subject}`,
        "---------------------------------------------------------------------------",
        text,
        "===========================================================================",
      ].join("\n")
    );
  }

  await db.emailLog.create({
    data: {
      senderUserId: input.senderUserId ?? null,
      toAddresses: input.to.join(", "),
      subject: input.subject,
      body: text,
      status,
      error,
    },
  });

  return { ok: status !== "FAILED", status, error };
}

/** Fire-and-forget notification — never lets email problems break the request. */
export function notify(input: SendEmailInput) {
  sendEmail(input).catch((e) => console.error("Notification email failed:", e));
}
