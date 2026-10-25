import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateDevice } from "@/lib/vanServer";
import { manualFileResponse } from "@/lib/manuals";

/** Downloads a manual to a van for offline use. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateDevice(req.headers.get("authorization"));
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "This van is signed out. Please sign in again." },
      { status: 401 },
    );
  }
  const { id } = await params;
  const manual = await prisma.manual.findUnique({ where: { id } });
  if (!manual) return NextResponse.json({ ok: false, error: "Manual not found." }, { status: 404 });
  return manualFileResponse(manual, false);
}
