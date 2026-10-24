import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateDevice } from "@/lib/vanServer";

/** Signs a van out: revokes its own device token. */
export async function POST(req: Request) {
  const caller = await authenticateDevice(req.headers.get("authorization"));
  if (caller) {
    await prisma.vanDevice.update({
      where: { id: caller.deviceId },
      data: { revokedAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
