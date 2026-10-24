import { NextResponse } from "next/server";
import { clientIpFromHeaders, rateLimit } from "@/lib/rateLimit";
import { applyOps, authenticateDevice, buildSnapshot, touchDevice } from "@/lib/vanServer";
import { hashSnapshot, syncSchema, VAN_PROTOCOL_VERSION } from "@/lib/vanSync";

/**
 * One sync round trip for a van terminal: apply the van's queued changes in
 * order, then return the technician's current working set (or just
 * `unchanged: true` when it matches what the van already has).
 */
export async function POST(req: Request) {
  const caller = await authenticateDevice(req.headers.get("authorization"));
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "This van is signed out. Please sign in again." },
      { status: 401 },
    );
  }

  // Vans sync about once a minute; this only stops a runaway client.
  if (!rateLimit(`van-sync:${caller.deviceId}`, 30, 60 * 1000).ok) {
    return NextResponse.json({ ok: false, error: "Syncing too often." }, { status: 429 });
  }

  let data: unknown;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const parsed = syncSchema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid sync request." }, { status: 422 });
  }

  const results = await applyOps(caller, parsed.data.ops);
  await touchDevice(caller.deviceId, clientIpFromHeaders(req.headers), parsed.data.appVersion);

  const snapshot = await buildSnapshot(caller);
  const snapshotHash = hashSnapshot(snapshot);
  const base = {
    ok: true,
    protocol: VAN_PROTOCOL_VERSION,
    serverTime: new Date().toISOString(),
    results,
    snapshotHash,
  };

  if (parsed.data.snapshotHash === snapshotHash) {
    return NextResponse.json({ ...base, unchanged: true });
  }
  return NextResponse.json({ ...base, unchanged: false, snapshot });
}
