/**
 * Automated announcement calls (text-to-speech), used to give a customer a
 * heads-up that their technician is about to call so they answer the phone.
 *
 * Uses Twilio's voice API (RingCentral has no simple TTS-call endpoint):
 * TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, calling from VOICE_FROM (falls
 * back to TWILIO_FROM). When not configured, the call is logged to the
 * console so the app keeps working.
 */

export function voiceConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.VOICE_FROM || process.env.TWILIO_FROM)
  );
}

function normalizeUS(phone: string): string | null {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.trim().startsWith("+")) return phone.trim();
  return null;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function placeAnnouncementCall(
  to: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const number = normalizeUS(to);
  if (!number) return { ok: false, error: "That phone number doesn't look valid" };

  if (!voiceConfigured()) {
    console.log(
      [
        "=============== VOICE CALL (console mode — Twilio voice not configured) ===============",
        `To:   ${number}`,
        message,
        "=======================================================================================",
      ].join("\n")
    );
    return { ok: false, error: "Automated calling isn't set up on the server yet" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = (process.env.VOICE_FROM || process.env.TWILIO_FROM) as string;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  // Say it twice with a pause — voicemail or a slow pickup still hears it.
  const say = `<Say voice="alice">${escapeXml(message)}</Say>`;
  const twiml = `<Response>${say}<Pause length="1"/>${say}</Response>`;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: number, From: from, Twiml: twiml }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      return { ok: false, error: `Twilio ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Call failed" };
  }
}
