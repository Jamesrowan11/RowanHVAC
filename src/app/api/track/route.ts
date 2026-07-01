import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Public, lightweight analytics endpoint. Records anonymous website events
 * (page views and CTA clicks) — no personal data, just a type + timestamp.
 * Only known event types are accepted.
 */
const ALLOWED = new Set(["PAGE_VIEW", "CALL_CLICK", "QUOTE_CLICK"]);

export async function POST(request: Request) {
  let type = "";
  try {
    const body = await request.json();
    type = String(body?.type ?? "");
  } catch {
    // Also accept sendBeacon's text/plain payloads.
    try {
      type = (await request.text()).trim();
    } catch {
      type = "";
    }
  }

  if (!ALLOWED.has(type)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await db.analyticsEvent.create({ data: { type } });
  return NextResponse.json({ ok: true });
}
