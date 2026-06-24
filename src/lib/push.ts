import webpush from "web-push";
import { db } from "@/lib/db";

/**
 * Web Push notifications. Works when VAPID keys are configured; otherwise it's
 * a no-op (the app runs fine without push set up). Generate keys once with:
 *   npx web-push generate-vapid-keys
 * and set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:info@rowanhvac.com",
    pub,
    priv
  );
  configured = true;
  return true;
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string; // path to open when tapped
};

/** Send a push to all of a set of users' registered devices. */
export async function sendPush(userIds: string[], payload: PushPayload) {
  if (!ensureConfigured() || userIds.length === 0) return;

  const subs = await db.pushSubscription.findMany({
    where: { userId: { in: [...new Set(userIds)] } },
  });
  if (subs.length === 0) return;

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/portal",
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data
        );
      } catch (e: unknown) {
        // 404/410 mean the subscription is dead — clean it up.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error("Push send failed:", e);
        }
      }
    })
  );
}

/** Fire-and-forget push — never breaks the request that triggered it. */
export function notifyPush(userIds: string[], payload: PushPayload) {
  sendPush(userIds, payload).catch((e) => console.error("notifyPush failed:", e));
}
