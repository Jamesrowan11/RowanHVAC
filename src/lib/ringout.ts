import { getRingCentralToken, ringcentralConfigured, rcServer, normalizeUS } from "@/lib/sms";

/**
 * RingOut: place a real two-legged call through the company's RingCentral
 * account. RingCentral rings the TECHNICIAN's phone first; when he answers,
 * it dials the CUSTOMER and connects them — and the customer's caller ID
 * shows the office number (RC_FROM_NUMBER), not the tech's cell. That's the
 * whole point: customers screen unknown cell numbers but recognize the
 * office line.
 *
 * Uses the same Server-to-Server OAuth app (RC_CLIENT_ID / RC_CLIENT_SECRET /
 * RC_JWT) as SMS — the app just needs the "RingOut" permission enabled in
 * the RingCentral Developer Console. When not configured, the call is logged
 * to the console so the app keeps working.
 */
export async function placeRingOut(
  techPhone: string,
  customerPhone: string
): Promise<{ ok: boolean; error?: string }> {
  const from = normalizeUS(techPhone);
  const to = normalizeUS(customerPhone);
  if (!from) return { ok: false, error: "Your phone number on file doesn't look valid — fix it in My Profile" };
  if (!to) return { ok: false, error: "The customer's phone number doesn't look valid" };

  if (!ringcentralConfigured()) {
    console.log(
      [
        "=============== RINGOUT (console mode — RingCentral not configured) ===============",
        `Tech:     ${from}`,
        `Customer: ${to}`,
        "===================================================================================",
      ].join("\n")
    );
    return { ok: false, error: "RingCentral calling isn't set up on the server yet" };
  }

  try {
    const token = await getRingCentralToken();
    const res = await fetch(`${rcServer()}/restapi/v1.0/account/~/extension/~/ring-out`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { phoneNumber: from },
        to: { phoneNumber: to },
        // Show the office number on the customer's caller ID.
        callerId: { phoneNumber: process.env.RC_FROM_NUMBER },
        // Announce "connecting your call" to the tech so he knows it's the system.
        playPrompt: true,
      }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { ok: false, error: `RingCentral ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Call failed" };
  }
}
