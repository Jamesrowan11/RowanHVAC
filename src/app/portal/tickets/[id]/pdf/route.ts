import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ticketPdfResponse } from "@/lib/ticketFiles";

/** Service ticket PDF for the office (admins) and the job's technician. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  const ticket = await prisma.serviceTicket.findUnique({
    where: { id },
    include: { job: { select: { technicians: { select: { userId: true } } } } },
  });
  const allowed =
    ticket && (user.role === "ADMIN" || (user.role === "EMPLOYEE" && ticket.job.technicians.some((t) => t.userId === user.id)));
  if (!ticket || !allowed) return new NextResponse("Not found", { status: 404 });
  return ticketPdfResponse(ticket, new URL(req.url).searchParams.has("download"));
}
