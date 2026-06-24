import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/guards";
import { pushPublicKey } from "@/lib/push";

/** Returns the VAPID public key the browser needs to subscribe. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ publicKey: pushPublicKey() });
}

/** Saves a device's push subscription against the logged-in user. */
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  // Upsert by endpoint, always tying it to the current user (handles a device
  // that was previously signed in as someone else).
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userId: user.id },
    update: { p256dh, auth, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
