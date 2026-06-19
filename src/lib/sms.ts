import { db } from "@/lib/db";

/**
 * Pluggable SMS layer. Sends through Twilio when configured, otherwise logs
 * the message to the console so the app runs fully without an SMS account.
 * Every send is recorded in SmsLog.
 *
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN — from your Twilio console
 *   TWILIO_FROM — your SMS-enabled Twilio number (e.g. +14105310008)
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

function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

async function sendViaTwilio(from: string, to: string[], text: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  // One request per recipient — keeps this as individual notifications.
  for (const number of to) {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: number, From: from, Body: text }),
      }
    );
    if (!res.ok) {
      throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }
}

export async function sendSms(input: SendSmsInput) {
  const numbers = [...new Set(input.to.map(normalizeUS).filter((n): n is string => !!n))];
  if (numbers.length === 0) {
    return { ok: false, status: "FAILED" as const, error: "No valid phone numbers" };
  }

  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | null = null;

  if (twilioConfigured()) {
    try {
      await sendViaTwilio(process.env.TWILIO_FROM as string, numbers, input.body);
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    console.log(
      [
        "================ SMS (console mode — Twilio not configured) =================",
        `From: ${process.env.TWILIO_FROM || "(Twilio number)"}`,
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
  if (input.to.filter(Boolean).length === 0) return;
  sendSms(input).catch((e) => console.error("SMS notification failed:", e));
}
