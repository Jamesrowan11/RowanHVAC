import { db } from "@/lib/db";

/**
 * Pluggable SMS layer. Sends through Nextiva (the phone system used here) when
 * configured, so texts come from the company's own business number. If Nextiva
 * isn't configured, the message is logged to the console so the app runs fully
 * without an SMS account. Every send is recorded in SmsLog.
 *
 * Nextiva's programmatic SMS is account-gated, so the endpoint is configurable
 * rather than hardcoded:
 *   NEXTIVA_API_URL    — the SMS send endpoint from your Nextiva developer account
 *   NEXTIVA_API_KEY    — bearer token / API key for that endpoint
 *   NEXTIVA_FROM       — your SMS-enabled Nextiva number (e.g. +14105310008)
 * Confirm the exact URL and payload with Nextiva; adjust buildPayload() below
 * if their API expects a different shape.
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

function nextivaConfigured(): boolean {
  return !!(process.env.NEXTIVA_API_URL && process.env.NEXTIVA_API_KEY && process.env.NEXTIVA_FROM);
}

// Default request body for Nextiva's SMS endpoint. Adjust here if Nextiva's
// API expects different field names.
function buildPayload(from: string, to: string, text: string) {
  return { from, to, text };
}

async function sendViaNextiva(from: string, to: string[], text: string) {
  const url = process.env.NEXTIVA_API_URL as string;
  const key = process.env.NEXTIVA_API_KEY as string;
  // One request per recipient — keeps this as individual notifications.
  for (const number of to) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPayload(from, number, text)),
    });
    if (!res.ok) {
      throw new Error(`Nextiva SMS ${res.status}: ${(await res.text()).slice(0, 300)}`);
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

  if (nextivaConfigured()) {
    try {
      await sendViaNextiva(process.env.NEXTIVA_FROM as string, numbers, input.body);
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    console.log(
      [
        "================ SMS (console mode — Nextiva not configured) ================",
        `From: ${process.env.NEXTIVA_FROM || "(Nextiva number)"}`,
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
