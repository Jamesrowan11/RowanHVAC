import { db } from "@/lib/db";

/**
 * Pluggable SMS layer with selectable provider. Set SMS_PROVIDER to "twilio"
 * (default) or "nextiva". If the chosen provider isn't fully configured, the
 * message is logged to the console so the app always runs. Every send is
 * recorded in SmsLog.
 *
 * Twilio:  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 * Nextiva: NEXTIVA_API_URL, NEXTIVA_API_KEY, NEXTIVA_FROM
 *          (Nextiva's SMS API is account-gated — get the endpoint + key from
 *           Nextiva; adjust buildNextivaPayload() if their API differs.)
 */

export type SendSmsInput = {
  senderUserId?: string | null;
  to: string[]; // phone numbers
  body: string;
};

function provider(): "twilio" | "nextiva" {
  return (process.env.SMS_PROVIDER || "twilio").toLowerCase() === "nextiva" ? "nextiva" : "twilio";
}

function normalizeUS(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.trim().startsWith("+")) return phone.trim();
  return null; // unrecognizable — skip rather than send junk
}

/* ------------------------------- Twilio ---------------------------------- */

function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

async function sendViaTwilio(to: string[], text: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM as string;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  for (const number of to) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: number, From: from, Body: text }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/* ------------------------------- Nextiva --------------------------------- */

function nextivaConfigured(): boolean {
  return !!(process.env.NEXTIVA_API_URL && process.env.NEXTIVA_API_KEY && process.env.NEXTIVA_FROM);
}

// Adjust this if Nextiva's API expects different field names.
function buildNextivaPayload(from: string, to: string, text: string) {
  return { from, to, text };
}

async function sendViaNextiva(to: string[], text: string) {
  const url = process.env.NEXTIVA_API_URL as string;
  const key = process.env.NEXTIVA_API_KEY as string;
  const from = process.env.NEXTIVA_FROM as string;
  for (const number of to) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildNextivaPayload(from, number, text)),
    });
    if (!res.ok) throw new Error(`Nextiva ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/* ------------------------------- Dispatch -------------------------------- */

export async function sendSms(input: SendSmsInput) {
  const numbers = [...new Set(input.to.map(normalizeUS).filter((n): n is string => !!n))];
  if (numbers.length === 0) {
    return { ok: false, status: "FAILED" as const, error: "No valid phone numbers" };
  }

  const chosen = provider();
  const ready = chosen === "nextiva" ? nextivaConfigured() : twilioConfigured();

  let status: "SENT" | "LOGGED" | "FAILED" = "LOGGED";
  let error: string | null = null;

  if (ready) {
    try {
      if (chosen === "nextiva") await sendViaNextiva(numbers, input.body);
      else await sendViaTwilio(numbers, input.body);
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    console.log(
      [
        `================ SMS (console mode — ${chosen} not configured) ================`,
        `To:   ${numbers.join(", ")}`,
        "-------------------------------------------------------------------------------",
        input.body,
        "===============================================================================",
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
