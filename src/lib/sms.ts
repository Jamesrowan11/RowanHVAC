import { db } from "@/lib/db";

/**
 * Pluggable SMS layer — the same shape as the email layer. Sends through
 * Twilio when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM are set,
 * otherwise logs the message to the console so the app runs fully without an
 * SMS account. Every send (real or logged) is recorded in SmsLog.
 */

export type SendSmsInput = {
  senderUserId?: string | null;
  to: string[]; // phone numbers
  body: string;
};

function normalizeUS(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.trim().startsWith("+")) return phone.trim();
  return null; // unrecognizable — skip rather than send junk
}

export async function sendSms(input: SendSmsInput) {
  const numbers = [...new Set(input.to.map(normalizeUS).filter((n): n is string => !!n))];
  if (numbers.length === 0) {
    return { ok: false, status: "FAILED" as const, error: "No valid phone numbers" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | null = null;

  if (sid && token && from) {
    try {
      // Twilio REST API — one request per recipient.
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      for (const to of numbers) {
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: to, From: from, Body: input.body }),
          }
        );
        if (!res.ok) {
          status = "FAILED";
          error = `Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`;
          break;
        }
      }
      if (status !== "FAILED") status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    console.log(
      [
        "================ SMS (console mode — Twilio not configured) ================",
        `To:   ${numbers.join(", ")}`,
        "----------------------------------------------------------------------------",
        input.body,
        "============================================================================",
      ].join("\n")
    );
  }

  await db.smsLog.create({
    data: {
      senderUserId: input.senderUserId ?? null,
      toNumbers: numbers.join(", "),
      body: input.body,
      status,
      error,
    },
  });

  return { ok: status !== "FAILED", status, error };
}

/** Fire-and-forget SMS — never lets messaging problems break the request. */
export function notifySms(input: SendSmsInput) {
  // Drop silently if there are no usable numbers (e.g. a client with no phone).
  if (input.to.filter(Boolean).length === 0) return;
  sendSms(input).catch((e) => console.error("SMS notification failed:", e));
}
