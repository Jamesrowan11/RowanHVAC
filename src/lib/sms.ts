import { db } from "@/lib/db";

/**
 * Pluggable SMS layer. Sends through RingCentral (the phone system Rowan HVAC
 * uses) when configured, so texts come from the company's real business number.
 * If RingCentral isn't configured, the message is logged to the console so the
 * app runs fully without an SMS account. Every send is recorded in SmsLog.
 *
 * RingCentral auth uses the JWT "bearer" flow for server-only apps:
 *   RINGCENTRAL_CLIENT_ID, RINGCENTRAL_CLIENT_SECRET, RINGCENTRAL_JWT,
 *   RINGCENTRAL_FROM (an SMS-enabled RingCentral number, e.g. +14105310008),
 *   RINGCENTRAL_SERVER (optional; defaults to production).
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

function rcServer(): string {
  return process.env.RINGCENTRAL_SERVER || "https://platform.ringcentral.com";
}

function ringcentralConfigured(): boolean {
  return !!(
    process.env.RINGCENTRAL_CLIENT_ID &&
    process.env.RINGCENTRAL_CLIENT_SECRET &&
    process.env.RINGCENTRAL_JWT &&
    process.env.RINGCENTRAL_FROM
  );
}

// Cache the access token across calls (RingCentral tokens last ~1 hour).
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getRingCentralToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  const basic = Buffer.from(
    `${process.env.RINGCENTRAL_CLIENT_ID}:${process.env.RINGCENTRAL_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${rcServer()}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: process.env.RINGCENTRAL_JWT as string,
    }),
  });
  if (!res.ok) {
    throw new Error(`RingCentral auth ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function sendViaRingCentral(from: string, to: string[], text: string) {
  const token = await getRingCentralToken();
  // One request per recipient — keeps this as individual notifications.
  for (const number of to) {
    const res = await fetch(
      `${rcServer()}/restapi/v1.0/account/~/extension/~/sms`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: { phoneNumber: from },
          to: [{ phoneNumber: number }],
          text,
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`RingCentral SMS ${res.status}: ${(await res.text()).slice(0, 300)}`);
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

  if (ringcentralConfigured()) {
    try {
      await sendViaRingCentral(process.env.RINGCENTRAL_FROM as string, numbers, input.body);
      status = "SENT";
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  } else {
    console.log(
      [
        "================ SMS (console mode — RingCentral not configured) ============",
        `From: ${process.env.RINGCENTRAL_FROM || "(RingCentral number)"}`,
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
