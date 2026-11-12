import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateDevice } from "@/lib/vanServer";
import { ticketPdfResponse } from "@/lib/ticketFiles";

/** The customer's PDF of a service ticket, for the technician who wrote it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticateDevice(req.headers.get("authorization"));
  if (!caller) {
    return NextResponse.json(
      { ok: false, error: "This van is signed out. Please sign in again." },
      { status: 401 },
    );
  }
  const { id } = await params;
  const ticket = await prisma.serviceTicket.findUnique({
    where: { id },
    include: { job: { select: { technicians: { select: { userId: true } } } } },
  });
  if (!ticket || !ticket.job.technicians.some((t) => t.userId === caller.user.id)) {
    return NextResponse.json({ ok: false, error: "Ticket not found." }, { status: 404 });
  }
  return ticketPdfResponse(ticket, false);
}
